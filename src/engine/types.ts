export type SessionKind = 'race' | 'sprint';
/** Which championship a calculation is for. */
export type Mode = 'driver' | 'constructor';

export interface Weekend {
  round: number;
  name: string;
  date: string;
  hasSprint: boolean;
  raceDone: boolean;
  sprintDone: boolean;
}

export interface Finish {
  driverId: string;
  constructorId: string;
  /** Classified finishing position; null for DNF/DNS/DSQ/unplaced. */
  position: number | null;
  points: number;
}

export interface Session {
  round: number;
  kind: SessionKind;
  finishes: Finish[];
  predicted: boolean;
}

export interface Standing {
  id: string;
  points: number;
  /** countback[i] = number of race finishes in position i+1 (races only, not sprints). */
  countback: number[];
}

export type Status = 'Champion' | 'Leading' | 'In contention' | 'Eliminated';

/** Predicted finishing order per session, index 0 = P1, null = slot empty. Key: `${round}:${kind}`. */
export type Predictions = Record<string, (string | null)[]>;

export interface Driver {
  id: string;
  code: string;
  name: string;
  /** Team of the driver's most recent result (handles mid-season swaps). */
  constructorId: string;
}

export interface Constructor {
  id: string;
  name: string;
}

/** Everything the app needs about the season, already validated and normalised. */
export interface SeasonData {
  season: string;
  schedule: Weekend[];
  /** Actual results, sprint before race within a round. */
  sessions: Session[];
  drivers: Driver[];
  constructors: Constructor[];
  /** Drivers in the most recent session — the grid offered in the predictor. */
  entrants: string[];
  /** Official totals from the standings endpoints. */
  driverPoints: { id: string; points: number }[];
  constructorPoints: { id: string; points: number }[];
}
