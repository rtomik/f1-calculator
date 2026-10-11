import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { fetchAllPages, fetchJson } from './client';
import {
  constructorStandingsSchema,
  driverStandingsSchema,
  resultsSchema,
  scheduleSchema,
  sprintSchema,
  type ApiResult,
  type ConstructorStandingsResponse,
  type DriverStandingsResponse,
  type RoundResults,
  type ScheduleResponse,
} from './schemas';
import type { Driver, Finish, SeasonData, Session } from '../engine/types';

export interface RawSeason {
  driverStandings: DriverStandingsResponse;
  constructorStandings: ConstructorStandingsResponse;
  schedule: ScheduleResponse;
  results: RoundResults;
  sprints: RoundResults;
}

function toFinish(r: ApiResult): Finish {
  return {
    driverId: r.Driver.driverId,
    constructorId: r.Constructor.constructorId,
    // Retired/withdrawn/disqualified rows still carry a numeric `position`; only numeric positionText is classified.
    position: /^\d+$/.test(r.positionText) ? r.position : null,
    points: r.points,
  };
}

/** Normalises validated API responses into the engine's season model. Pure. */
export function buildSeason(raw: RawSeason): SeasonData {
  const raceRounds = new Set(raw.results.map((r) => r.round));
  const sprintRounds = new Set(raw.sprints.map((r) => r.round));
  const schedule = raw.schedule.MRData.RaceTable.Races.map((r) => ({
    round: r.round,
    name: r.raceName,
    date: r.date,
    hasSprint: r.Sprint !== undefined || sprintRounds.has(r.round),
    raceDone: raceRounds.has(r.round),
    sprintDone: sprintRounds.has(r.round),
  })).sort((a, b) => a.round - b.round);

  const sessions: Session[] = [
    ...raw.sprints.map((r) => ({ round: r.round, kind: 'sprint' as const, finishes: r.results.map(toFinish), predicted: false })),
    ...raw.results.map((r) => ({ round: r.round, kind: 'race' as const, finishes: r.results.map(toFinish), predicted: false })),
  ].sort((a, b) => a.round - b.round || (a.kind === 'sprint' ? -1 : 1));

  const driverList = raw.driverStandings.MRData.StandingsTable.StandingsLists[0]?.DriverStandings ?? [];
  const constructorList = raw.constructorStandings.MRData.StandingsTable.StandingsLists[0]?.ConstructorStandings ?? [];

  const drivers = new Map<string, Driver>();
  const teams = new Map<string, string>();
  const addDriver = (d: ApiResult['Driver'], constructorId: string) =>
    drivers.set(d.driverId, {
      id: d.driverId,
      code: d.code ?? d.familyName.slice(0, 3).toUpperCase(),
      name: `${d.givenName} ${d.familyName}`,
      constructorId,
    });
  for (const s of driverList) {
    const team = s.Constructors.at(-1);
    if (team) teams.set(team.constructorId, team.name);
    addDriver(s.Driver, team?.constructorId ?? '');
  }
  for (const c of constructorList) teams.set(c.Constructor.constructorId, c.Constructor.name);
  // Later sessions overwrite earlier ones, so each driver ends up with their most recent team.
  const allResults = [...raw.sprints.map((r) => ({ ...r, order: r.round })), ...raw.results.map((r) => ({ ...r, order: r.round + 0.5 }))].sort(
    (a, b) => a.order - b.order,
  );
  for (const r of allResults) {
    for (const x of r.results) {
      addDriver(x.Driver, x.Constructor.constructorId);
      teams.set(x.Constructor.constructorId, x.Constructor.name);
    }
  }

  const last = sessions.at(-1);
  return {
    season: raw.schedule.MRData.RaceTable.season,
    schedule,
    sessions,
    drivers: [...drivers.values()],
    constructors: [...teams.entries()].map(([id, name]) => ({ id, name })),
    entrants: last ? last.finishes.map((f) => f.driverId) : [...drivers.keys()],
    driverPoints: driverList.map((s) => ({ id: s.Driver.driverId, points: s.points })),
    constructorPoints: constructorList.map((s) => ({ id: s.Constructor.constructorId, points: s.points })),
  };
}

const toRounds = <K extends 'Results' | 'SprintResults'>(key: K) =>
  (page: { MRData: { RaceTable: { Races: ({ round: number } & Record<K, ApiResult[]>)[] } } }) =>
    page.MRData.RaceTable.Races.map((r) => ({ round: r.round, items: r[key] }));

const toRoundResults = (rounds: { round: number; items: ApiResult[] }[]): RoundResults =>
  rounds.map((r) => ({ round: r.round, results: r.items }));

export const seasonQueries = [
  { queryKey: ['schedule'], queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson('/current.json', scheduleSchema, signal) },
  { queryKey: ['driverStandings'], queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson('/current/driverStandings.json', driverStandingsSchema, signal) },
  { queryKey: ['constructorStandings'], queryFn: ({ signal }: { signal: AbortSignal }) => fetchJson('/current/constructorStandings.json', constructorStandingsSchema, signal) },
  { queryKey: ['results'], queryFn: async ({ signal }: { signal: AbortSignal }) => toRoundResults(await fetchAllPages('/current/results.json', resultsSchema, toRounds('Results'), signal)) },
  { queryKey: ['sprints'], queryFn: async ({ signal }: { signal: AbortSignal }) => toRoundResults(await fetchAllPages('/current/sprint.json', sprintSchema, toRounds('SprintResults'), signal)) },
] as const;

export type SeasonQuery =
  | { status: 'pending' }
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'success'; data: SeasonData; isFetching: boolean };

type SeasonResults = [
  UseQueryResult<ScheduleResponse>,
  UseQueryResult<DriverStandingsResponse>,
  UseQueryResult<ConstructorStandingsResponse>,
  UseQueryResult<RoundResults>,
  UseQueryResult<RoundResults>,
];

// Module-level so TanStack Query can memoise the combined result between renders.
function combine(qs: SeasonResults): SeasonQuery {
      const [schedule, driverStandings, constructorStandings, results, sprints] = qs;
      const failed = qs.find((q) => q.error);
      if (failed?.error) {
        return { status: 'error', error: failed.error, retry: () => qs.forEach((q) => q.isError && void q.refetch()) };
      }
      if (!schedule.data || !driverStandings.data || !constructorStandings.data || !results.data || !sprints.data) {
        return { status: 'pending' };
      }
      return {
        status: 'success',
        data: buildSeason({
          schedule: schedule.data,
          driverStandings: driverStandings.data,
          constructorStandings: constructorStandings.data,
          results: results.data,
          sprints: sprints.data,
        }),
        isFetching: qs.some((q) => q.isFetching),
      };
}

export function useSeason(): SeasonQuery {
  return useQueries({ queries: seasonQueries, combine });
}
