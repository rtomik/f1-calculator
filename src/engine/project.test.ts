import { describe, expect, it } from 'vitest';
import { chartData, LEADER, PRED, project } from './project';
import type { SeasonData, Session } from './types';

const race = (round: number, order: [string, string][], predicted = false): Session => ({
  round,
  kind: 'race',
  predicted,
  finishes: order.map(([driverId, constructorId], i) => ({
    driverId,
    constructorId,
    position: i + 1,
    points: [25, 18, 15][i] ?? 0,
  })),
});

// Three-round season, round 2 is a sprint weekend whose sprint has run but race hasn't.
const season: SeasonData = {
  season: '2030',
  schedule: [
    { round: 1, name: 'Alpha GP', date: '2030-03-01', hasSprint: false, raceDone: true, sprintDone: false },
    { round: 2, name: 'Beta GP', date: '2030-03-08', hasSprint: true, raceDone: false, sprintDone: true },
    { round: 3, name: 'Gamma GP', date: '2030-03-15', hasSprint: false, raceDone: false, sprintDone: false },
  ],
  sessions: [
    race(1, [
      ['ann', 'red'],
      ['bob', 'blue'],
      ['cat', 'red'],
    ]),
    {
      round: 2,
      kind: 'sprint',
      predicted: false,
      finishes: [
        { driverId: 'bob', constructorId: 'blue', position: 1, points: 8 },
        { driverId: 'ann', constructorId: 'red', position: null, points: 0 },
      ],
    },
  ],
  drivers: [
    { id: 'ann', code: 'ANN', name: 'Ann A', constructorId: 'red' },
    { id: 'bob', code: 'BOB', name: 'Bob B', constructorId: 'blue' },
    { id: 'cat', code: 'CAT', name: 'Cat C', constructorId: 'red' },
  ],
  constructors: [
    { id: 'red', name: 'Red Team' },
    { id: 'blue', name: 'Blue Team' },
  ],
  entrants: ['ann', 'bob', 'cat'],
  // 'dan' appears only in the standings (e.g. a replaced driver) and 'grey' only in constructor standings.
  driverPoints: [
    { id: 'ann', points: 25 },
    { id: 'bob', points: 26 },
    { id: 'cat', points: 15 },
    { id: 'dan', points: 0 },
  ],
  constructorPoints: [
    { id: 'red', points: 40 },
    { id: 'blue', points: 26 },
    { id: 'grey', points: 0 },
  ],
};

describe('project', () => {
  it('builds current tables from official points with countback, statuses and gaps', () => {
    const p = project(season, {});
    expect(p.mismatch).toBe(false);
    expect(p.predicted).toEqual([]);
    expect(p.rows.driver.map((r) => [r.position, r.id, r.points, r.gap, r.wins, r.status])).toEqual([
      [1, 'bob', 26, 0, 0, 'Leading'],
      [2, 'ann', 25, 1, 1, 'In contention'],
      [3, 'cat', 15, 11, 0, 'In contention'],
      [4, 'dan', 0, 26, 0, 'In contention'],
    ]);
    const dan = p.rows.driver[3];
    expect(dan).toMatchObject({ name: 'dan', short: 'DAN', teamId: '' });
    expect(p.rows.constructor.map((r) => [r.id, r.short, r.teamId])).toEqual([
      ['red', 'Red Team', 'red'],
      ['blue', 'Blue Team', 'blue'],
      ['grey', 'grey', 'grey'],
    ]);
    expect(p.clinch.driver?.next).toEqual({ round: 2, kind: 'race' });
  });

  it('applies predictions, marks those sessions done and reports predicted points', () => {
    const p = project(season, { '2:race': ['ann', 'bob'], '3:race': ['ann', 'cat'] });
    expect(p.schedule.every((w) => w.raceDone)).toBe(true);
    expect(p.rows.driver[0]).toMatchObject({ id: 'ann', points: 75, predictedPoints: 50, status: 'Champion' });
    expect(p.rows.constructor[0]).toMatchObject({ id: 'red', points: 108, status: 'Champion' });
    expect(p.clinch.driver).toMatchObject({ clinched: true });
  });

  it('flags a mismatch between official standings and summed results', () => {
    const penalised = { ...season, driverPoints: [{ id: 'ann', points: 20 }] };
    expect(project(penalised, {}).mismatch).toBe(true);
    const teamPenalty = { ...season, constructorPoints: [{ id: 'red', points: 30 }] };
    expect(project(teamPenalty, {}).mismatch).toBe(true);
  });

  it('handles the off-season (no standings, no sessions)', () => {
    const empty: SeasonData = { ...season, sessions: [], driverPoints: [], constructorPoints: [], schedule: [] };
    const p = project(empty, {});
    expect(p.rows.driver).toEqual([]);
    expect(p.clinch.driver).toBeNull();
  });
});

describe('chartData', () => {
  it('splits actual and predicted series at the hand-over round', () => {
    const p = project(season, { '3:race': ['cat', 'ann'] });
    const c = chartData(season, p.predicted, 'driver', ['ann', 'bob', 'zed']);
    expect(c.progression.map((r) => [r.label, r.predicted, r.ann, r[`ann${PRED}`]])).toEqual([
      ['R1', false, 25, undefined],
      ['R2', false, 25, 25],
      ['R3', true, undefined, 43],
    ]);
    expect(c.progression[0]?.name).toBe('Alpha GP');
    // zed never scored: zero everywhere.
    expect(c.progression[0]?.zed).toBe(0);
    expect(c.gap.map((r) => r.bob ?? r[`bob${PRED}`])).toEqual([7, 0, 17]);
    expect(c.split).toEqual([
      { id: 'ann', raceActual: 25, sprintActual: 0, racePredicted: 18, sprintPredicted: 0 },
      { id: 'bob', raceActual: 18, sprintActual: 8, racePredicted: 0, sprintPredicted: 0 },
      { id: 'zed', raceActual: 0, sprintActual: 0, racePredicted: 0, sprintPredicted: 0 },
    ]);
  });

  it('computes max achievable points and the elimination round', () => {
    const c = chartData(season, [], 'driver', ['ann', 'cat']);
    // After R1: ann 25 + (25 race + 8 sprint + 25 race) = 83; leader line = 25.
    expect(c.maxAchievable[0]).toMatchObject({ ann: 83, [LEADER]: 25 });
    expect(c.eliminatedAfter).toEqual({ ann: null, cat: null });
    const blowout = [race(2, [['bob', 'blue']], true), race(3, [['bob', 'blue']], true)];
    expect(chartData(season, blowout, 'driver', ['ann']).eliminatedAfter).toEqual({ ann: 2 });
  });

  it('treats everything as predicted before the first race, and names unknown rounds', () => {
    const pre: SeasonData = { ...season, sessions: [] };
    const c = chartData(pre, [race(9, [['ann', 'red']], true), { round: 10, kind: 'race', finishes: [], predicted: true }], 'constructor', ['red']);
    expect(c.progression.map((r) => [r.name, r.red, r[`red${PRED}`]])).toEqual([
      ['Round 9', undefined, 25],
      ['Round 10', undefined, 25],
    ]);
    expect(c.maxAchievable[1]?.[LEADER]).toBe(25);
    const none = chartData(pre, [{ round: 1, kind: 'race', finishes: [], predicted: true }], 'driver', []);
    expect(none.maxAchievable[0]?.[LEADER]).toBe(0);
  });
});
