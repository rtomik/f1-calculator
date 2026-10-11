import { create } from 'zustand';
import { assignSlot } from './engine/championship';
import { POINTS, sessionKey } from './engine/rules';
import type { Predictions, SessionKind } from './engine/types';

// Session-only state: deliberately not persisted (no localStorage).
interface PredictionState {
  predictions: Predictions;
  selectedDriver: string | null;
  setSlot: (round: number, kind: SessionKind, index: number, driverId: string | null) => void;
  /** Replaces a whole session's order (quick-fill, drag swaps, clear with []). */
  setOrder: (round: number, kind: SessionKind, order: (string | null)[]) => void;
  resetRound: (round: number) => void;
  resetAll: () => void;
  selectDriver: (id: string) => void;
}

export const usePredictions = create<PredictionState>((set) => ({
  predictions: {},
  selectedDriver: null,
  setSlot: (round, kind, index, driverId) =>
    set((s) => {
      const key = sessionKey(round, kind);
      return { predictions: { ...s.predictions, [key]: assignSlot(s.predictions[key] ?? [], index, driverId, POINTS[kind].length) } };
    }),
  setOrder: (round, kind, order) => set((s) => ({ predictions: { ...s.predictions, [sessionKey(round, kind)]: order } })),
  resetRound: (round) =>
    set((s) => {
      const { [sessionKey(round, 'race')]: _race, [sessionKey(round, 'sprint')]: _sprint, ...rest } = s.predictions;
      return { predictions: rest };
    }),
  resetAll: () => set({ predictions: {} }),
  selectDriver: (id) => set({ selectedDriver: id }),
}));
