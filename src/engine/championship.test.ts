import { describe, expect, it } from 'vitest';
import {
  addResult,
  applyPredictions,
  assignSlot,
  swapSlots,
  bestCase,
  canClinch,
  compareStandings,
  isClinched,
  isMathematicallyEliminated,
  markDone,
  maxPointsRemaining,
  minUniformPosition,
  nextSession,
  openSessions,
  titleScenarios,
  pointsNeededToWin,
  predictionsToSessions,
  rank,
  remainingSessions,
  withStatus,
} from './championship';
import { maxSessionPoints, pointsFor, sessionKey } from './rules';
import type { Session, Standing, Weekend } from './types';

const wk = (round: number, o: Partial<Weekend> = {}): Weekend => ({
  round,
  name: `GP ${round}`,
  date: '2026-01-01',
  hasSprint: false,
  raceDone: false,
  sprintDone: false,
  ...o,
});
const st = (id: string, points: number, countback: number[] = []): Standing => ({ id, points, countback });
const races = (n: number): Weekend[] => Array.from({ length: n }, (_, i) => wk(i + 1));

describe('rules', () => {
  it('scores race and sprint positions, with no points outside the top 10/8 or for a DNF', () => {
    expect(pointsFor('race', 1)).toBe(25);
    expect(pointsFor('race', 10)).toBe(1);
    expect(pointsFor('race', 11)).toBe(0);
    expect(pointsFor('sprint', 8)).toBe(1);
    expect(pointsFor('sprint', 9)).toBe(0);
    expect(pointsFor('race', null)).toBe(0);
  });
  it('max per session: P1 for drivers, P1+P2 for constructors', () => {
    expect(maxSessionPoints('race', 'driver')).toBe(25);
    expect(maxSessionPoints('race', 'constructor')).toBe(43);
    expect(maxSessionPoints('sprint', 'driver')).toBe(8);
    expect(maxSessionPoints('sprint', 'constructor')).toBe(15);
    expect(sessionKey(3, 'sprint')).toBe('3:sprint');
  });
});

describe('compareStandings / rank (countback)', () => {
  it('orders by points first', () => {
    expect(compareStandings(st('a', 10), st('b', 5))).toBeLessThan(0);
  });
  it('breaks a points tie on wins, then P2s, with different-length countbacks', () => {
    expect(compareStandings(st('a', 50, [1]), st('b', 50, [0, 3]))).toBeLessThan(0);
    expect(compareStandings(st('a', 50, [1, 0]), st('b', 50, [1, 1]))).toBeGreaterThan(0);
    expect(compareStandings(st('a', 50, [1, 0, 1]), st('b', 50, [1]))).toBeLessThan(0);
  });
  it('returns 0 for a complete tie, including two drivers on zero points', () => {
    expect(compareStandings(st('a', 0), st('b', 0, [0, 0]))).toBe(0);
  });
  it('ranks without mutating input', () => {
    const input = [st('a', 1), st('b', 2)];
    expect(rank(input).map((s) => s.id)).toEqual(['b', 'a']);
    expect(input[0]?.id).toBe('a');
  });
});

describe('addResult', () => {
  it('adds race points from the rules and records the countback position', () => {
    expect(addResult(st('a', 0), 'race', [2])).toEqual(st('a', 18, [0, 1]));
  });
  it('ignores DNFs and does not count sprints in the countback', () => {
    expect(addResult(st('a', 5, [1]), 'race', [null])).toEqual(st('a', 5, [1]));
    expect(addResult(st('a', 0), 'sprint', [1])).toEqual(st('a', 8, []));
  });
  it('uses explicit points when given (e.g. official API points)', () => {
    expect(addResult(st('a', 0), 'race', [1], 12.5).points).toBe(12.5);
  });
});

describe('predictionsToSessions + applyPredictions', () => {
  const schedule = [wk(1, { raceDone: true }), wk(2, { hasSprint: true }), wk(3)];
  const teams = { ver: 'rbr', nor: 'mcl', pia: 'mcl' };

  it('builds sessions for upcoming sessions only, skipping empty slots, unknown drivers and non-sprint weekends', () => {
    const sessions = predictionsToSessions(
      {
        '1:race': ['ver'], // already run
        '2:sprint': ['nor', null, 'ver'],
        '2:race': [null, null],
        '3:race': ['ghost', 'pia'],
        '3:sprint': ['ver'], // no sprint at round 3
      },
      schedule,
      teams,
    );
    expect(sessions).toEqual([
      {
        round: 2,
        kind: 'sprint',
        predicted: true,
        finishes: [
          { driverId: 'nor', constructorId: 'mcl', position: 1, points: 8 },
          { driverId: 'ver', constructorId: 'rbr', position: 3, points: 6 },
        ],
      },
      { round: 3, kind: 'race', predicted: true, finishes: [{ driverId: 'pia', constructorId: 'mcl', position: 2, points: 18 }] },
    ]);
  });

  it('projects standings with a countback tie-break', () => {
    // Both end on 43 with one win and one P2 each: a complete tie keeps input order.
    const current = [st('ver', 25, [1]), st('nor', 18, [0, 1])];
    const predicted = predictionsToSessions({ '3:race': ['nor', 'ver'] }, schedule, teams);
    const out = applyPredictions(current, predicted, 'driver');
    expect(out).toEqual([st('ver', 43, [1, 1]), st('nor', 43, [1, 1])]);
    const p2 = predictionsToSessions({ '3:race': ['nor', null, 'ver'] }, schedule, teams);
    // nor 43 [1,1] vs ver 40 [1,0,1]
    expect(applyPredictions(current, p2, 'driver').map((s) => s.id)).toEqual(['nor', 'ver']);
  });

  it('aggregates both cars for constructors and adds newcomers', () => {
    const predicted = predictionsToSessions({ '3:race': ['nor', 'pia'] }, schedule, teams);
    expect(applyPredictions([st('rbr', 30)], predicted, 'constructor')).toEqual([st('mcl', 43, [1, 1]), st('rbr', 30)]);
  });
});

describe('schedule helpers', () => {
  const season = [
    wk(1, { raceDone: true }),
    wk(2, { hasSprint: true, sprintDone: true, raceDone: true }),
    wk(3, { hasSprint: true, sprintDone: true }), // mid-weekend: sprint run, race not
    wk(4, { hasSprint: true }),
    wk(5),
  ];

  it('counts remaining sessions across sprint weekends, including a half-finished weekend', () => {
    expect(remainingSessions(season)).toEqual({ races: 3, sprints: 1 });
    expect(maxPointsRemaining(season, 'driver')).toBe(3 * 25 + 8);
    expect(maxPointsRemaining(season, 'constructor')).toBe(3 * 43 + 15);
  });

  it('a cancelled race simply disappears from the schedule and from the maximum', () => {
    const cancelled = season.filter((w) => w.round !== 5);
    expect(maxPointsRemaining(cancelled, 'driver')).toBe(2 * 25 + 8);
  });

  it('is zero after the last race', () => {
    const over = markDone(season, [
      { round: 3, kind: 'race', finishes: [], predicted: true },
      { round: 4, kind: 'sprint', finishes: [], predicted: true },
      { round: 4, kind: 'race', finishes: [], predicted: true },
      { round: 5, kind: 'race', finishes: [], predicted: true },
    ]);
    expect(maxPointsRemaining(over, 'driver')).toBe(0);
    expect(nextSession(over)).toBeNull();
  });

  it('finds the next session, sprint before race', () => {
    expect(nextSession(season)).toEqual({ round: 3, kind: 'race' });
    expect(nextSession([wk(4, { hasSprint: true })])).toEqual({ round: 4, kind: 'sprint' });
  });

  it('best case gives wins (drivers) or 1-2s (constructors) in every remaining race', () => {
    const two = races(2);
    expect(bestCase(st('a', 10), two, 'driver')).toEqual(st('a', 60, [2]));
    expect(bestCase(st('t', 10), two, 'constructor')).toEqual(st('t', 96, [2, 2]));
  });
});

describe('isMathematicallyEliminated', () => {
  it('eliminates on points alone', () => {
    const s = [st('a', 100), st('b', 49)];
    expect(isMathematicallyEliminated('b', s, races(2), 'driver')).toBe(true);
  });
  it('keeps a driver alive who can tie on points and win the countback', () => {
    const s = [st('a', 100, [1]), st('b', 50)];
    // b's best case: 100 points, 2 wins vs a's 1 win.
    expect(isMathematicallyEliminated('b', s, races(2), 'driver')).toBe(false);
  });
  it('eliminates a driver who can only tie on points but loses the countback', () => {
    const s = [st('a', 100, [3]), st('b', 50)];
    expect(isMathematicallyEliminated('b', s, races(2), 'driver')).toBe(true);
  });
  it('handles a driver on zero points', () => {
    expect(isMathematicallyEliminated('z', [st('a', 20), st('z', 0)], races(1), 'driver')).toBe(false);
    expect(isMathematicallyEliminated('z', [st('a', 26), st('z', 0)], races(1), 'driver')).toBe(true);
  });
  it('after the last race only the leader is not eliminated', () => {
    const done = [wk(1, { raceDone: true })];
    const s = [st('a', 25, [1]), st('b', 18, [0, 1])];
    expect(isMathematicallyEliminated('a', s, done, 'driver')).toBe(false);
    expect(isMathematicallyEliminated('b', s, done, 'driver')).toBe(true);
  });
  it('throws for an unknown competitor', () => {
    expect(() => isMathematicallyEliminated('x', [st('a', 1)], [], 'driver')).toThrow('Unknown competitor: x');
  });
});

describe('isClinched / canClinch', () => {
  it('reports an already-clinched title', () => {
    const s = [st('a', 100), st('b', 40)];
    expect(isClinched('a', s, races(2), 'driver')).toBe(true);
    expect(canClinch('a', s, races(2), 'driver')).toEqual({ clinched: true, next: null, canClinchNext: false, minPosition: null });
  });

  it('finds the minimum race finish that clinches, with countback', () => {
    // After next race 25 remain. b best = 60 + 25 + 25 = 110 (2 wins).
    // P4 → 112 clinches; P5 → 110 ties on points but loses the countback.
    const s = [st('a', 100), st('b', 60)];
    expect(canClinch('a', s, races(2), 'driver')).toEqual({
      clinched: false,
      next: { round: 1, kind: 'race' },
      canClinchNext: true,
      minPosition: 4,
    });
  });

  it('uses the sprint when it is the next session (sprints add no countback)', () => {
    // b best after sprint = 70 + 8 + 25 = 103 with a race win. a needs > 103 → P5 sprint (4 pts) gives 104.
    const s = [st('a', 100), st('b', 70)];
    expect(canClinch('a', s, [wk(1, { hasSprint: true })], 'driver').minPosition).toBe(5);
  });

  it('needs a win when the rival can only finish second', () => {
    // a wins → 125 vs b (P2 then a win) 123. a P2 → 118 vs b 130.
    const s = [st('a', 100), st('b', 80)];
    expect(canClinch('a', s, races(2), 'driver').minPosition).toBe(1);
  });

  it('reports when the next session cannot clinch it', () => {
    const s = [st('a', 100), st('b', 90)];
    expect(canClinch('a', s, races(2), 'driver')).toEqual({
      clinched: false,
      next: { round: 1, kind: 'race' },
      canClinchNext: false,
      minPosition: null,
    });
  });

  it('handles a season that ended in a complete tie (nothing left to run)', () => {
    const s = [st('a', 100, [1]), st('b', 100, [1])];
    const done = [wk(1, { raceDone: true })];
    expect(canClinch('a', s, done, 'driver')).toEqual({ clinched: false, next: null, canClinchNext: false, minPosition: null });
  });

  it('constructors: says whether a 1-2 next race clinches', () => {
    expect(canClinch('t1', [st('t1', 100), st('t2', 60)], races(1), 'constructor')).toEqual({
      clinched: false,
      next: { round: 1, kind: 'race' },
      canClinchNext: true,
      minPosition: null,
    });
    expect(canClinch('t1', [st('t1', 100), st('t2', 90)], races(2), 'constructor').canClinchNext).toBe(false);
  });
});

describe('pointsNeededToWin', () => {
  it('leader needs nothing', () => {
    expect(pointsNeededToWin('a', [st('a', 100), st('b', 50)], races(2), 'driver')).toMatchObject({
      leaderId: 'a',
      gapToLeader: 0,
      pointsNeeded: 0,
    });
  });
  it('needs gap + 1 normally', () => {
    expect(pointsNeededToWin('b', [st('a', 100), st('b', 90)], races(2), 'driver')).toEqual({
      leaderId: 'a',
      gapToLeader: 10,
      maxAvailable: 50,
      pointsNeeded: 11,
      bestCaseTotal: 140,
      worstCaseTotal: 90,
      eliminated: false,
    });
  });
  it('needs only the gap when the countback already favours them', () => {
    expect(pointsNeededToWin('b', [st('a', 100, [1]), st('b', 90, [2])], races(2), 'driver').pointsNeeded).toBe(10);
  });
  it('needs exactly the maximum when a perfect run wins the countback', () => {
    expect(pointsNeededToWin('b', [st('a', 100), st('b', 50)], races(2), 'driver').pointsNeeded).toBe(50);
  });
  it('is null once eliminated', () => {
    expect(pointsNeededToWin('c', [st('a', 100), st('c', 10)], races(2), 'driver')).toMatchObject({ pointsNeeded: null, eliminated: true });
  });
});

describe('minUniformPosition', () => {
  // 3 races + 1 sprint left; a leads b by 20.
  const sched = [wk(1, { hasSprint: true }), wk(2), wk(3)];
  const s = [st('a', 100), st('b', 80), st('c', 20)];
  it('leader scores nothing: P7 everywhere gives 20 points and the countback', () => {
    expect(minUniformPosition('b', 'a', s, sched, null)).toBe(7);
  });
  it('leader finishes P2 everywhere: only winning everything can work', () => {
    expect(minUniformPosition('b', 'a', s, sched, 2)).toBe(1);
    expect(minUniformPosition('c', 'a', s, sched, 2)).toBeNull();
  });
});

describe('withStatus', () => {
  it('is empty for an empty championship (off-season)', () => {
    expect(withStatus([], [], 'driver')).toEqual([]);
  });
  it('labels leader, contenders and eliminated', () => {
    const out = withStatus([st('c', 10), st('a', 100), st('b', 80)], races(2), 'driver');
    expect(out.map((s) => [s.id, s.status])).toEqual([
      ['a', 'Leading'],
      ['b', 'In contention'],
      ['c', 'Eliminated'],
    ]);
  });
  it('crowns a champion and eliminates everyone else', () => {
    const out = withStatus([st('a', 100), st('b', 80)], [wk(1, { raceDone: true })], 'driver');
    expect(out.map((s) => s.status)).toEqual(['Champion', 'Eliminated']);
  });
});

describe('assignSlot', () => {
  it('moves a driver instead of duplicating them', () => {
    expect(assignSlot(['a', 'b', null], 2, 'a', 3)).toEqual([null, 'b', 'a']);
  });
  it('clears a slot with null and pads to the session size', () => {
    expect(assignSlot(['a'], 0, null, 3)).toEqual([null, null, null]);
  });
});

describe('session typing', () => {
  it('accepts sessions with no finishes', () => {
    const empty: Session = { round: 1, kind: 'race', finishes: [], predicted: false };
    expect(applyPredictions([st('a', 1)], [empty], 'driver')).toEqual([st('a', 1)]);
  });
});

describe('openSessions', () => {
  it('lists unrun sessions in order, sprint before race, skipping a half-run weekend\'s sprint', () => {
    expect(
      openSessions([wk(1, { raceDone: true }), wk(2, { hasSprint: true, sprintDone: true }), wk(3, { hasSprint: true })]),
    ).toEqual([
      { round: 2, kind: 'race' },
      { round: 3, kind: 'sprint' },
      { round: 3, kind: 'race' },
    ]);
  });
});

describe('titleScenarios', () => {
  const sched = [wk(1, { hasSprint: true }), wk(2), wk(3)];
  const s = [st('a', 100), st('b', 80), st('c', 20)];
  it('a chaser is compared with the leader: leader scores 0 / leader P2', () => {
    expect(titleScenarios('b', s, sched)).toMatchObject({
      rival: 'a',
      remaining: { races: 3, sprints: 1 },
      needed: { pointsNeeded: 21 },
      scenarios: [
        { rivalPosition: null, position: 7 },
        { rivalPosition: 2, position: 1 },
      ],
    });
  });
  it('the leader is compared with P2, including P2 winning everything', () => {
    expect(titleScenarios('a', s, sched).scenarios).toEqual([
      { rivalPosition: null, position: 10 },
      // b P2 everywhere → 141. a P3 → 151; a P4 → 141 but loses the countback to b's P2s.
      { rivalPosition: 2, position: 3 },
      // b winning everything reaches 163; a's best at P2 everywhere is 161.
      { rivalPosition: 1, position: null },
    ]);
  });
  it('has no scenarios without a rival', () => {
    expect(titleScenarios('a', [st('a', 10)], sched)).toMatchObject({ rival: null, scenarios: [] });
  });
});

describe('swapSlots', () => {
  it('swaps two positions, including with an empty slot, padded to the session size', () => {
    expect(swapSlots(['a', 'b', 'c'], 0, 2, 3)).toEqual(['c', 'b', 'a']);
    expect(swapSlots(['a'], 0, 2, 3)).toEqual([null, null, 'a']);
  });
});
