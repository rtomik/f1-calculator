import type { Mode, SessionKind } from './types';

// Single source of truth for the points system (2025+ regulations).
export const RACE_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] as const;
export const SPRINT_POINTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
// No fastest-lap point (abolished from 2025).
// Tie-break: countback of race (Grand Prix) finishing positions — wins, then P2s, then P3s, ...
// Sprint results are not used in the countback.

export const POINTS: Record<SessionKind, readonly number[]> = { race: RACE_POINTS, sprint: SPRINT_POINTS };

export function pointsFor(kind: SessionKind, position: number | null): number {
  return position === null ? 0 : (POINTS[kind][position - 1] ?? 0);
}

/** Most points one competitor can take from one session: P1 for a driver, P1+P2 for a constructor. */
export function maxSessionPoints(kind: SessionKind, mode: Mode): number {
  return bestPositions(mode).reduce((sum, p) => sum + pointsFor(kind, p), 0);
}

/** Positions a competitor occupies in its best possible result. */
export function bestPositions(mode: Mode): number[] {
  return mode === 'driver' ? [1] : [1, 2];
}

export const sessionKey = (round: number, kind: SessionKind): string => `${round}:${kind}`;
