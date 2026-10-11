import { bestPositions, maxSessionPoints, pointsFor, POINTS } from './rules';
import type { Mode, Predictions, Session, SessionKind, Standing, Status, Weekend } from './types';

export const idOf = (f: { driverId: string; constructorId: string }, mode: Mode): string =>
  mode === 'driver' ? f.driverId : f.constructorId;

/** Negative if a ranks ahead of b: points, then countback (most wins, then most P2s, ...). */
export function compareStandings(a: Standing, b: Standing): number {
  if (a.points !== b.points) return b.points - a.points;
  const n = Math.max(a.countback.length, b.countback.length);
  for (let i = 0; i < n; i++) {
    const d = (b.countback[i] ?? 0) - (a.countback[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export const rank = (standings: Standing[]): Standing[] => [...standings].sort(compareStandings);

/** New standing with a session result added: points, and countback positions for races. */
export function addResult(s: Standing, kind: SessionKind, positions: (number | null)[], points?: number): Standing {
  const countback = [...s.countback];
  if (kind === 'race') {
    for (const p of positions) {
      if (p === null) continue;
      countback[p - 1] = (countback[p - 1] ?? 0) + 1;
    }
  }
  const earned = points ?? positions.reduce<number>((sum, p) => sum + pointsFor(kind, p), 0);
  return { id: s.id, points: s.points + earned, countback: Array.from(countback, (c) => c ?? 0) };
}

/** Applies sessions (actual or predicted) on top of standings and re-ranks. Unknown ids are added. */
export function applySessions(standings: Standing[], sessions: Session[], mode: Mode, countPoints = true): Standing[] {
  const byId = new Map(standings.map((s) => [s.id, s]));
  for (const session of sessions) {
    for (const f of session.finishes) {
      const id = idOf(f, mode);
      const cur = byId.get(id) ?? { id, points: 0, countback: [] };
      byId.set(id, addResult(cur, session.kind, [f.position], countPoints ? f.points : 0));
    }
  }
  return rank([...byId.values()]);
}

/** Projected standings: current standings + predicted sessions, re-ranked with countback. */
export function applyPredictions(current: Standing[], predictions: Session[], mode: Mode): Standing[] {
  return applySessions(current, predictions, mode);
}

/** Sessions not yet run, in running order (a weekend's sprint before its race). */
export function openSessions(schedule: Weekend[]): { round: number; kind: SessionKind }[] {
  return schedule.flatMap((w) => [
    ...(w.hasSprint && !w.sprintDone ? [{ round: w.round, kind: 'sprint' as const }] : []),
    ...(!w.raceDone ? [{ round: w.round, kind: 'race' as const }] : []),
  ]);
}

/**
 * Turns the predictor's slot lists into sessions. Ignores sessions already run, empty predictions,
 * and drivers with no known team.
 */
export function predictionsToSessions(
  predictions: Predictions,
  schedule: Weekend[],
  teamOf: Record<string, string>,
): Session[] {
  return openSessions(schedule).flatMap(({ round, kind }) => {
    const order = predictions[`${round}:${kind}`];
    if (!order || order.every((id) => id === null)) return [];
    const finishes = order.flatMap((driverId, i) => {
      const constructorId = driverId === null ? undefined : teamOf[driverId];
      return driverId === null || constructorId === undefined
        ? []
        : [{ driverId, constructorId, position: i + 1, points: pointsFor(kind, i + 1) }];
    });
    return [{ round, kind, finishes, predicted: true }];
  });
}

/** Schedule with the given sessions marked as done (used so predicted sessions stop counting as "remaining"). */
export function markDone(schedule: Weekend[], sessions: Session[]): Weekend[] {
  const done = new Set(sessions.map((s) => `${s.round}:${s.kind}`));
  return schedule.map((w) => ({
    ...w,
    raceDone: w.raceDone || done.has(`${w.round}:race`),
    sprintDone: w.sprintDone || done.has(`${w.round}:sprint`),
  }));
}

/** Sessions not yet run (or predicted). */
export function remainingSessions(schedule: Weekend[]): { races: number; sprints: number } {
  return {
    races: schedule.filter((w) => !w.raceDone).length,
    sprints: schedule.filter((w) => w.hasSprint && !w.sprintDone).length,
  };
}

export function maxPointsRemaining(schedule: Weekend[], mode: Mode): number {
  const { races, sprints } = remainingSessions(schedule);
  return races * maxSessionPoints('race', mode) + sprints * maxSessionPoints('sprint', mode);
}

/** Best possible final standing: wins (or 1-2s) every remaining session. */
export function bestCase(s: Standing, schedule: Weekend[], mode: Mode): Standing {
  const { races } = remainingSessions(schedule);
  const positions = Array.from({ length: races }, () => bestPositions(mode)).flat();
  const withWins = addResult(s, 'race', positions, 0);
  return { ...withWins, points: s.points + maxPointsRemaining(schedule, mode) };
}

function find(standings: Standing[], id: string): Standing {
  const s = standings.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown competitor: ${id}`);
  return s;
}

/**
 * True if someone already ranks strictly ahead of this competitor's best case even when that someone
 * scores nothing more. Includes countback: equal points but a worse countback is still eliminated.
 */
export function isMathematicallyEliminated(id: string, standings: Standing[], schedule: Weekend[], mode: Mode): boolean {
  const best = bestCase(find(standings, id), schedule, mode);
  return standings.some((o) => o.id !== id && compareStandings(o, best) < 0);
}

/** True if no rival can reach this competitor even with a perfect run (countback included). */
export function isClinched(id: string, standings: Standing[], schedule: Weekend[], mode: Mode): boolean {
  const me = find(standings, id);
  return standings.every((o) => o.id === id || compareStandings(me, bestCase(o, schedule, mode)) < 0);
}

export interface ClinchInfo {
  clinched: boolean;
  next: { round: number; kind: SessionKind } | null;
  canClinchNext: boolean;
  /**
   * Drivers only: the worst finishing position in the next session that still clinches, assuming every
   * rival gets their best possible result there. `POINTS[kind].length + 1` means "even with no points".
   * null if the next session can't clinch it, or for constructors.
   */
  minPosition: number | null;
}

/** Next session to run: a weekend's sprint comes before its race. */
export function nextSession(schedule: Weekend[]): { round: number; kind: SessionKind } | null {
  return openSessions(schedule)[0] ?? null;
}

export function canClinch(leaderId: string, standings: Standing[], schedule: Weekend[], mode: Mode): ClinchInfo {
  if (isClinched(leaderId, standings, schedule, mode)) {
    return { clinched: true, next: null, canClinchNext: false, minPosition: null };
  }
  const next = nextSession(schedule);
  if (!next) return { clinched: false, next: null, canClinchNext: false, minPosition: null };

  const after = markDone(schedule, [{ ...next, finishes: [], predicted: false }]);
  const leader = find(standings, leaderId);
  const rivals = standings.filter((s) => s.id !== leaderId);
  const clinchesWith = (mine: number[], rivalsBest: number[]): boolean =>
    rivals.every((r) => {
      const me = addResult(leader, next.kind, mine);
      return compareStandings(me, bestCase(addResult(r, next.kind, rivalsBest), after, mode)) < 0;
    });

  if (mode === 'constructor') {
    // ponytail: constructors only answer "can a 1-2 clinch it?"; a minimum two-car result is ambiguous.
    return { clinched: false, next, canClinchNext: clinchesWith([1, 2], [3, 4]), minPosition: null };
  }
  // Worst position first; "no points" is one past the last scoring position.
  for (let p = POINTS[next.kind].length + 1; p >= 1; p--) {
    const mine = p > POINTS[next.kind].length ? [] : [p];
    if (clinchesWith(mine, [p === 1 ? 2 : 1])) return { clinched: false, next, canClinchNext: true, minPosition: p };
  }
  return { clinched: false, next, canClinchNext: false, minPosition: null };
}

export interface PointsNeeded {
  leaderId: string;
  gapToLeader: number;
  maxAvailable: number;
  /** Points needed from the remaining sessions to finish ahead if the leader scores nothing; null if impossible. */
  pointsNeeded: number | null;
  bestCaseTotal: number;
  worstCaseTotal: number;
  eliminated: boolean;
}

export function pointsNeededToWin(id: string, standings: Standing[], schedule: Weekend[], mode: Mode): PointsNeeded {
  const ranked = rank(standings);
  const me = find(ranked, id);
  const leader = ranked.find((s) => s.id !== id && compareStandings(s, me) <= 0) ?? me;
  const gap = leader.points - me.points;
  const maxAvailable = maxPointsRemaining(schedule, mode);
  const eliminated = isMathematicallyEliminated(id, standings, schedule, mode);
  // Level on points is enough if we'd already win the countback, or if a perfect run (all wins) wins it.
  const levelIsEnough =
    leader === me ||
    compareStandings({ ...me, points: leader.points }, leader) < 0 ||
    (gap === maxAvailable && !eliminated);
  const needed = Math.max(0, levelIsEnough ? gap : gap + 1);
  return {
    leaderId: leader.id,
    gapToLeader: gap,
    maxAvailable,
    pointsNeeded: eliminated ? null : needed,
    bestCaseTotal: me.points + maxAvailable,
    worstCaseTotal: me.points,
    eliminated,
  };
}

/**
 * Drivers only. Worst position P such that finishing P in every remaining race and sprint puts `id`
 * ahead of `rivalId`, given the rival finishes `rivalPosition` everywhere (null = rival scores nothing).
 * Returns null if no position works.
 */
export function minUniformPosition(
  id: string,
  rivalId: string,
  standings: Standing[],
  schedule: Weekend[],
  rivalPosition: number | null,
): number | null {
  const { races, sprints } = remainingSessions(schedule);
  const finish = (s: Standing, p: number | null): Standing => {
    const r = addResult(s, 'race', Array.from({ length: races }, () => p));
    return { ...r, points: r.points + sprints * pointsFor('sprint', p) };
  };
  const rival = finish(find(standings, rivalId), rivalPosition);
  const me = find(standings, id);
  for (let p = POINTS.race.length; p >= 1; p--) {
    if (p !== rivalPosition && compareStandings(finish(me, p), rival) < 0) return p;
  }
  return null;
}

export interface TitleScenarios {
  rival: string | null;
  needed: PointsNeeded;
  remaining: { races: number; sprints: number };
  /** Worst uniform position needed when the rival finishes `rivalPosition` everywhere (null = scores nothing). */
  scenarios: { rivalPosition: number | null; position: number | null }[];
}

/**
 * Drivers only. Title scenarios for one driver against the leader, or against P2 if they are the leader
 * (who also gets a "rival wins every time" scenario).
 */
export function titleScenarios(id: string, standings: Standing[], schedule: Weekend[]): TitleScenarios {
  const ranked = rank(standings);
  const isLeader = ranked[0]?.id === id;
  const rival = (isLeader ? ranked[1] : ranked[0])?.id ?? null;
  const positions: (number | null)[] = isLeader ? [null, 2, 1] : [null, 2];
  return {
    rival,
    needed: pointsNeededToWin(id, standings, schedule, 'driver'),
    remaining: remainingSessions(schedule),
    scenarios:
      rival === null
        ? []
        : positions.map((rivalPosition) => ({
            rivalPosition,
            position: minUniformPosition(id, rival, standings, schedule, rivalPosition),
          })),
  };
}

/** Ranked standings, each with its championship status. */
export function withStatus(standings: Standing[], schedule: Weekend[], mode: Mode): (Standing & { status: Status })[] {
  const ranked = rank(standings);
  const leader = ranked[0];
  const champion = leader !== undefined && isClinched(leader.id, ranked, schedule, mode);
  return ranked.map((s) => {
    if (s === leader) return { ...s, status: champion ? 'Champion' : 'Leading' };
    if (champion || isMathematicallyEliminated(s.id, ranked, schedule, mode)) return { ...s, status: 'Eliminated' };
    return { ...s, status: 'In contention' };
  });
}

/**
 * Predictor slot assignment. Putting a driver in a slot removes them from any other slot,
 * so no driver can hold two positions and no position can hold two drivers.
 */
export function assignSlot(order: (string | null)[], index: number, driverId: string | null, size: number): (string | null)[] {
  const next = Array.from({ length: size }, (_, i) => (order[i] === driverId ? null : (order[i] ?? null)));
  next[index] = driverId;
  return next;
}
