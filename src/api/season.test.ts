import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';
import fixture from './__fixtures__/season-2026-r17.json';
import { fetchJson, HttpError } from './client';
import { scheduleSchema } from './schemas';
import { buildSeason, seasonQueries } from './season';
import { maxPointsRemaining, remainingSessions } from '../engine/championship';
import { project } from '../engine/project';

// Serves the recorded 2026 responses (taken after round 17's sprint, before its race), paginated like the real API.
function mockApi() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const body = url.pathname.endsWith('/current.json')
      ? fixture.schedule
      : url.pathname.endsWith('/driverStandings.json')
        ? fixture.driverStandings
        : url.pathname.endsWith('/constructorStandings.json')
          ? fixture.constructorStandings
          : url.pathname.endsWith('/results.json')
            ? fixture.resultsPages[offset / 100]
            : fixture.sprintPages[offset / 100];
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('season from the real 2026 snapshot', () => {
  it('fetches every page, merges races split across pages and derives remaining sessions per session', async () => {
    const fetchMock = mockApi();
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    const [qSchedule, qDrivers, qConstructors, qResults, qSprints] = seasonQueries;
    const [schedule, driverStandings, constructorStandings, results, sprints] = await Promise.all([
      qSchedule.queryFn({ signal }),
      qDrivers.queryFn({ signal }),
      qConstructors.queryFn({ signal }),
      qResults.queryFn({ signal }),
      qSprints.queryFn({ signal }),
    ]);
    // 4 results pages + 2 sprint pages + 3 single endpoints.
    expect(fetchMock).toHaveBeenCalledTimes(9);

    const season = buildSeason({ schedule, driverStandings, constructorStandings, results, sprints });
    expect(season.sessions.filter((s) => s.kind === 'race')).toHaveLength(16);
    expect(season.sessions.every((s) => s.finishes.length === 22)).toBe(true);
    // Round 17: sprint run, race not. Standings say round 17, but 7 races remain.
    expect(remainingSessions(season.schedule)).toEqual({ races: 7, sprints: 0 });
    expect(maxPointsRemaining(season.schedule, 'driver')).toBe(175);
    expect(maxPointsRemaining(season.schedule, 'constructor')).toBe(301);
    expect(season.entrants).toHaveLength(22);
    // Lawson raced for both teams; standings list red_bull last, but his latest result (R17 sprint) is with rb.
    expect(season.drivers.find((d) => d.id === 'lawson')?.constructorId).toBe('rb');

    const p = project(season, {});
    expect(p.mismatch).toBe(false);
    expect(p.rows.driver[0]).toMatchObject({ id: 'antonelli', points: 325, wins: 8, status: 'Leading' });
    expect(p.rows.constructor).toHaveLength(11);
    // Non-classified rows (R/W/D) never count towards the countback.
    const unclassified = [...results, ...sprints].flatMap((r) => r.results).filter((r) => !/^\d+$/.test(r.positionText));
    expect(unclassified.length).toBeGreaterThan(0);
    expect(season.sessions.flatMap((s) => s.finishes).filter((f) => f.position === null)).toHaveLength(unclassified.length);
  }, 10_000);
});

describe('fetchJson', () => {
  it('throws an HttpError on a non-OK response (e.g. rate limited)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('slow down', { status: 429 })));
    await expect(fetchJson('/current.json', scheduleSchema)).rejects.toBeInstanceOf(HttpError);
  });
  it('rejects an unexpected shape with a ZodError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ MRData: { total: 'x' } }))));
    await expect(fetchJson('/current.json', scheduleSchema)).rejects.toBeInstanceOf(ZodError);
  });
});
