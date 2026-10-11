import {
  applyPredictions,
  applySessions,
  canClinch,
  idOf,
  isMathematicallyEliminated,
  markDone,
  maxPointsRemaining,
  predictionsToSessions,
  withStatus,
  type ClinchInfo,
} from './championship';
import type { Mode, Predictions, SeasonData, Session, Standing, Status, Weekend } from './types';

export interface TableRow {
  position: number;
  id: string;
  name: string;
  /** Three-letter code for drivers, team name for constructors. */
  short: string;
  teamId: string;
  points: number;
  /** Points added by predictions (0 when nothing is predicted). */
  predictedPoints: number;
  gap: number;
  wins: number;
  status: Status;
}

export interface Projection {
  /** Schedule with predicted sessions counted as done. */
  schedule: Weekend[];
  predicted: Session[];
  standings: Record<Mode, Standing[]>;
  rows: Record<Mode, TableRow[]>;
  clinch: Record<Mode, ClinchInfo | null>;
  /** True if summed results disagree with the official standings (e.g. a post-race penalty). */
  mismatch: boolean;
  /** Last session the standings include (actual or predicted); null before the season starts. */
  asOf: { round: number; kind: 'race' | 'sprint'; predicted: boolean } | null;
}

export function teamMap(season: SeasonData): Record<string, string> {
  return Object.fromEntries(season.drivers.map((d) => [d.id, d.constructorId]));
}

/** Official points, plus countback derived from actual race results. */
export function currentStandings(season: SeasonData, mode: Mode): Standing[] {
  const official = mode === 'driver' ? season.driverPoints : season.constructorPoints;
  const base = official.map((o) => ({ id: o.id, points: o.points, countback: [] }));
  return applySessions(base, season.sessions, mode, false);
}

function summedPoints(sessions: Session[], mode: Mode): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions) for (const f of s.finishes) totals.set(idOf(f, mode), (totals.get(idOf(f, mode)) ?? 0) + f.points);
  return totals;
}

export function project(season: SeasonData, predictions: Predictions): Projection {
  const predicted = predictionsToSessions(predictions, season.schedule, teamMap(season));
  const schedule = markDone(season.schedule, predicted);
  const driverNames = new Map(season.drivers.map((d) => [d.id, d]));
  const teamNames = new Map(season.constructors.map((c) => [c.id, c.name]));

  const build = (mode: Mode) => {
    const standings = applyPredictions(currentStandings(season, mode), predicted, mode);
    const added = summedPoints(predicted, mode);
    const leaderPoints = standings[0]?.points ?? 0;
    const rows = withStatus(standings, schedule, mode).map((s, i): TableRow => {
      const driver = driverNames.get(s.id);
      const teamId = mode === 'driver' ? (driver?.constructorId ?? '') : s.id;
      const name = mode === 'driver' ? (driver?.name ?? s.id) : (teamNames.get(s.id) ?? s.id);
      return {
        position: i + 1,
        id: s.id,
        name,
        short: mode === 'driver' ? (driver?.code ?? s.id.slice(0, 3).toUpperCase()) : name,
        teamId,
        points: s.points,
        predictedPoints: added.get(s.id) ?? 0,
        gap: leaderPoints - s.points,
        wins: s.countback[0] ?? 0,
        status: s.status,
      };
    });
    const leader = standings[0];
    return { standings, rows, clinch: leader ? canClinch(leader.id, standings, schedule, mode) : null };
  };

  const d = build('driver');
  const c = build('constructor');
  const differs = (official: { id: string; points: number }[], mode: Mode) => {
    const sums = summedPoints(season.sessions, mode);
    return official.some((o) => (sums.get(o.id) ?? 0) !== o.points);
  };
  const mismatch = differs(season.driverPoints, 'driver') || differs(season.constructorPoints, 'constructor');
  return {
    schedule,
    predicted,
    standings: { driver: d.standings, constructor: c.standings },
    rows: { driver: d.rows, constructor: c.rows },
    clinch: { driver: d.clinch, constructor: c.clinch },
    mismatch,
    asOf: lastSession([...season.sessions, ...predicted]),
  };
}

function lastSession(sessions: Session[]): Projection['asOf'] {
  // A weekend's race comes after its sprint.
  const order = (s: Session) => s.round * 2 + (s.kind === 'race' ? 1 : 0);
  const last = sessions.reduce<Session | undefined>((acc, s) => (!acc || order(s) > order(acc) ? s : acc), undefined);
  return last ? { round: last.round, kind: last.kind, predicted: sessions.some((s) => s.predicted) } : null;
}

// ---------- Predictor quick-fill ----------

/** Current championship order, limited to the current grid (drivers in the latest session). */
export function standingsOrder(season: SeasonData, size: number): (string | null)[] {
  const grid = new Set(season.entrants);
  return currentStandings(season, 'driver')
    .map((s) => s.id)
    .filter((id) => grid.has(id))
    .slice(0, size);
}

/**
 * Order of the latest earlier session of the same kind: the user's prediction if they made one (copied
 * slot for slot), otherwise the actual result (classified finishers on the current grid, in order).
 * null if there is no earlier session of that kind.
 */
export function previousOrder(
  season: SeasonData,
  predictions: Predictions,
  round: number,
  kind: 'race' | 'sprint',
  size: number,
): (string | null)[] | null {
  const grid = new Set(season.entrants);
  const predicted = predictionsToSessions(predictions, season.schedule, teamMap(season));
  const earlier = [...season.sessions, ...predicted]
    .filter((s) => s.kind === kind && s.round < round)
    .sort((a, b) => a.round - b.round)
    .at(-1);
  if (!earlier) return null;
  if (earlier.predicted) {
    const order: (string | null)[] = Array.from({ length: size }, () => null);
    for (const f of earlier.finishes) if (f.position !== null) order[f.position - 1] = f.driverId;
    return order;
  }
  return earlier.finishes
    .filter((f): f is typeof f & { position: number } => f.position !== null && grid.has(f.driverId))
    .sort((a, b) => a.position - b.position)
    .map((f) => f.driverId)
    .slice(0, size);
}

// ---------- Chart series ----------

/** Recharts row: `[id]` = actual value, `[id + PRED]` = predicted value (the two overlap at the hand-over round). */
export type SeriesRow = { round: number; label: string; name: string; predicted: boolean } & Record<string, number | string | boolean | undefined>;
export const PRED = '~pred';

interface RoundState {
  round: number;
  name: string;
  sprintOnly: boolean;
  predicted: boolean;
  standings: Standing[];
  schedule: Weekend[];
}

/** Cumulative standings after each round that has at least one actual or predicted session. */
function roundStates(season: SeasonData, predicted: Session[], mode: Mode): RoundState[] {
  const all = [...season.sessions, ...predicted];
  const blank = season.schedule.map((w) => ({ ...w, raceDone: false, sprintDone: false }));
  const rounds = [...new Set(all.map((s) => s.round))].sort((a, b) => a - b);
  let standings: Standing[] = [];
  let seen: Session[] = [];
  return rounds.map((round) => {
    const these = all.filter((s) => s.round === round);
    standings = applySessions(standings, these, mode);
    seen = [...seen, ...these];
    return {
      round,
      name: season.schedule.find((w) => w.round === round)?.name ?? `Round ${round}`,
      // Sprint run (or predicted) but the race not yet: the point shows standings after the sprint only.
      sprintOnly: !these.some((s) => s.kind === 'race'),
      predicted: these.some((s) => s.predicted),
      standings,
      schedule: markDone(blank, seen),
    };
  });
}

/** Splits per-round values into actual and predicted keys so charts can draw solid vs dashed lines. */
function split(states: RoundState[], ids: string[], value: (st: RoundState, id: string) => number): SeriesRow[] {
  const lastActual = states.reduce((acc, st, i) => (st.predicted ? acc : i), -1);
  // The predicted series starts at the last actual round so the dashed line joins the solid one,
  // but only when there is something predicted after it.
  const firstPred = states.some((st) => st.predicted) ? Math.max(lastActual, 0) : states.length;
  return states.map((st, i) => {
    const row: SeriesRow = {
      round: st.round,
      label: st.sprintOnly ? `R${st.round} S` : `R${st.round}`,
      name: st.sprintOnly ? `${st.name} (sprint only, race not run yet)` : st.name,
      predicted: st.predicted,
    };
    for (const id of ids) {
      const v = value(st, id);
      if (i <= lastActual) row[id] = v;
      if (i >= firstPred) row[id + PRED] = v;
    }
    return row;
  });
}

const pointsOf = (st: RoundState, id: string): number => st.standings.find((s) => s.id === id)?.points ?? 0;
const leaderOf = (st: RoundState): number => st.standings[0]?.points ?? 0;

export interface ChartData {
  progression: SeriesRow[];
  gap: SeriesRow[];
  /** Max achievable final points after each round; `LEADER` key holds the leader's points then. */
  maxAchievable: SeriesRow[];
  /** Round after which each competitor was mathematically eliminated (null = still alive). */
  eliminatedAfter: Record<string, number | null>;
  split: { id: string; raceActual: number; sprintActual: number; racePredicted: number; sprintPredicted: number }[];
}
export const LEADER = '__leader';

export function chartData(season: SeasonData, predicted: Session[], mode: Mode, ids: string[]): ChartData {
  const states = roundStates(season, predicted, mode);
  const maxAchievable = split(states, ids, (st, id) => pointsOf(st, id) + maxPointsRemaining(st.schedule, mode));
  for (const [i, row] of maxAchievable.entries()) row[LEADER] = leaderOf(states[i] as RoundState);

  const eliminatedAfter: Record<string, number | null> = {};
  for (const id of ids) {
    const st = states.find((s) => s.standings.some((x) => x.id === id) && isMathematicallyEliminated(id, s.standings, s.schedule, mode));
    eliminatedAfter[id] = st?.round ?? null;
  }

  const splitRows = ids.map((id) => {
    const row = { id, raceActual: 0, sprintActual: 0, racePredicted: 0, sprintPredicted: 0 };
    for (const s of [...season.sessions, ...predicted]) {
      const pts = s.finishes.filter((f) => idOf(f, mode) === id).reduce((sum, f) => sum + f.points, 0);
      const key = `${s.kind}${s.predicted ? 'Predicted' : 'Actual'}` as const;
      row[key] += pts;
    }
    return row;
  });

  return {
    progression: split(states, ids, pointsOf),
    gap: split(states, ids, (st, id) => leaderOf(st) - pointsOf(st, id)),
    maxAchievable,
    eliminatedAfter,
    split: splitRows,
  };
}
