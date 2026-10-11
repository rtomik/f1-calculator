import { useMemo, useState, type DragEvent } from 'react';
import { openSessions, swapSlots } from '../engine/championship';
import { POINTS, sessionKey } from '../engine/rules';
import type { SeasonData, SessionKind, Weekend } from '../engine/types';
import { previousOrder, standingsOrder, type Projection } from '../engine/project';
import { usePredictions } from '../store';
import { teamColor } from '../teamColors';
import { EmptyState, fmt, Predicted, StatusBadge } from './ui';

export function Predictor({ season, projection }: { season: SeasonData; projection: Projection }) {
  const resetAll = usePredictions((s) => s.resetAll);
  const open = openSessions(season.schedule);
  const upcoming = season.schedule.filter((w) => open.some((o) => o.round === w.round));

  if (upcoming.length === 0) {
    return <EmptyState title="Nothing left to predict">Every session of the {season.season} season has been run.</EmptyState>;
  }
  if (season.entrants.length === 0) {
    return <EmptyState title="No driver line-up yet">The predictor unlocks once the first session of the season has results.</EmptyState>;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm opacity-80">
            Drag drivers onto finishing positions, or use the dropdowns. Drag one position onto another to swap them, or back to the
            pool to remove. A driver can only hold one position; anyone not placed counts as DNF / outside the points (0 pts).
          </p>
          <button type="button" className="btn" onClick={resetAll} disabled={projection.predicted.length === 0}>
            Reset all
          </button>
        </div>
        {upcoming.map((w, i) => (
          <WeekendCard
            key={w.round}
            weekend={w}
            sessions={open.filter((o) => o.round === w.round).map((o) => o.kind)}
            season={season}
            defaultOpen={i === 0}
          />
        ))}
      </div>
      <aside className="card h-fit lg:sticky lg:top-4" aria-labelledby="live-h">
        <h2 id="live-h" className="mb-2 font-semibold">
          Live projection
        </h2>
        <ol className="space-y-1 text-sm" aria-live="polite">
          {projection.rows.driver.slice(0, 10).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-5 tabular-nums opacity-70">{r.position}</span>
                <span aria-hidden="true" className="h-3 w-1 rounded" style={{ background: teamColor(r.teamId) }} />
                <span className="truncate">{r.short}</span>
              </span>
              <span className="flex items-center gap-2 tabular-nums">
                {r.predictedPoints > 0 ? <Predicted>{fmt(r.points)}</Predicted> : fmt(r.points)}
                <StatusBadge status={r.status} />
              </span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function WeekendCard({
  weekend: w,
  sessions,
  season,
  defaultOpen,
}: {
  weekend: Weekend;
  sessions: SessionKind[];
  season: SeasonData;
  defaultOpen: boolean;
}) {
  const resetRound = usePredictions((s) => s.resetRound);
  const hasAny = usePredictions((s) =>
    [s.predictions[sessionKey(w.round, 'sprint')], s.predictions[sessionKey(w.round, 'race')]].some((o) => o?.some((x) => x !== null)),
  );
  return (
    <details open={defaultOpen} className="card">
      <summary className="cursor-pointer font-semibold">
        R{w.round} · {w.name} <span className="font-normal opacity-70">({w.date})</span>
        {hasAny && <span className="ml-2 text-xs font-normal text-violet-700 dark:text-violet-300">predicted</span>}
      </summary>
      <div className="mt-3 space-y-4">
        {sessions.map((kind) => (
          <SessionPicker key={kind} round={w.round} kind={kind} season={season} />
        ))}
        <button type="button" className="btn" onClick={() => resetRound(w.round)} disabled={!hasAny}>
          Reset R{w.round}
        </button>
      </div>
    </details>
  );
}

// Drag payload: "<sessionKey>|<from slot index, -1 = pool>|<driverId>".
const DRAG_TYPE = 'text/plain';

function SessionPicker({ round, kind, season }: { round: number; kind: SessionKind; season: SeasonData }) {
  const key = sessionKey(round, kind);
  const order = usePredictions((s) => s.predictions[key]);
  const predictions = usePredictions((s) => s.predictions);
  const setSlot = usePredictions((s) => s.setSlot);
  const setOrder = usePredictions((s) => s.setOrder);
  const [over, setOver] = useState<number | 'pool' | null>(null);
  const size = POINTS[kind].length;
  const drivers = season.entrants.flatMap((id) => season.drivers.filter((d) => d.id === id));
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const unplaced = drivers.filter((d) => !order?.includes(d.id));
  const label = kind === 'race' ? 'Race' : 'Sprint';
  const previous = useMemo(() => previousOrder(season, predictions, round, kind, size), [season, predictions, round, kind, size]);
  const hasAny = order?.some((x) => x !== null) ?? false;

  const startDrag = (e: DragEvent, from: number, driverId: string) => {
    e.dataTransfer.setData(DRAG_TYPE, `${key}|${from}|${driverId}`);
    e.dataTransfer.effectAllowed = 'move';
  };
  // Anything else can be dropped here (e.g. selected text), so only accept known drivers.
  const readDrag = (e: DragEvent) => {
    const [fromKey, from, driverId] = e.dataTransfer.getData(DRAG_TYPE).split('|');
    return driverId && byId.has(driverId) ? { sameSession: fromKey === key, from: Number(from), driverId } : null;
  };
  const dragOver = (e: DragEvent, target: number | 'pool') => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOver(target);
  };
  const dropOnSlot = (e: DragEvent, i: number) => {
    e.preventDefault();
    setOver(null);
    const drag = readDrag(e);
    if (!drag) return;
    if (drag.sameSession && drag.from >= 0) setOrder(round, kind, swapSlots(order ?? [], drag.from, i, size));
    else setSlot(round, kind, i, drag.driverId);
  };
  const dropOnPool = (e: DragEvent) => {
    e.preventDefault();
    setOver(null);
    const drag = readDrag(e);
    if (drag?.sameSession && drag.from >= 0) setSlot(round, kind, drag.from, null);
  };
  const ring = (target: number | 'pool') => (over === target ? 'ring-2 ring-violet-500' : '');

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="mb-2 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => setOrder(round, kind, standingsOrder(season, size))}>
          Current standings
        </button>
        <button
          type="button"
          className="btn"
          disabled={previous === null}
          onClick={() => previous && setOrder(round, kind, previous)}
          title={previous === null ? `No earlier ${kind} this season` : `Copy the previous ${kind} (your prediction if you made one)`}
        >
          Previous {kind}
        </button>
        <button type="button" className="btn" disabled={!hasAny} onClick={() => setOrder(round, kind, [])}>
          Clear
        </button>
      </div>
      <ol className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:grid-cols-3">
        {POINTS[kind].map((pts, i) => {
          const id = `p-${round}-${kind}-${i}`;
          const driver = order?.[i] ? byId.get(order[i]) : undefined;
          return (
            <li
              key={i}
              className={`flex items-center gap-1.5 rounded ${ring(i)}`}
              onDragOver={(e) => dragOver(e, i)}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => dropOnSlot(e, i)}
            >
              <span
                draggable={driver !== undefined}
                onDragStart={(e) => driver && startDrag(e, i, driver.id)}
                onDragEnd={() => setOver(null)}
                aria-hidden="true"
                className={`w-3 shrink-0 text-center select-none ${driver ? 'cursor-grab opacity-60' : 'opacity-0'}`}
              >
                ⠿
              </span>
              <label htmlFor={id} className="w-14 shrink-0 text-xs tabular-nums">
                P{i + 1} <span className="opacity-60">({pts})</span>
              </label>
              <select
                id={id}
                className="field"
                value={order?.[i] ?? ''}
                onChange={(e) => setSlot(round, kind, i, e.target.value || null)}
                aria-label={`Round ${round} ${label} P${i + 1}`}
                style={driver ? { borderLeft: `4px solid ${teamColor(driver.constructorId)}` } : undefined}
              >
                <option value="">— DNF / none</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name.split(' ').at(-1)}
                    {order?.includes(d.id) && order[i] !== d.id ? ` (P${order.indexOf(d.id) + 1})` : ''}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>
      <div
        className={`mt-2 rounded border border-dashed border-zinc-300 p-2 dark:border-zinc-700 ${ring('pool')}`}
        onDragOver={(e) => dragOver(e, 'pool')}
        onDragLeave={() => setOver(null)}
        onDrop={dropOnPool}
      >
        <p className="mb-1 text-xs opacity-70">Not placed (0 pts): drag onto a position</p>
        {unplaced.length === 0 ? (
          <p className="text-xs italic opacity-60">Everyone is placed.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {unplaced.map((d) => (
              <li
                key={d.id}
                draggable
                onDragStart={(e) => startDrag(e, -1, d.id)}
                onDragEnd={() => setOver(null)}
                title={d.name}
                className="cursor-grab rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs font-medium select-none dark:border-zinc-700 dark:bg-zinc-950"
                style={{ borderLeft: `4px solid ${teamColor(d.constructorId)}` }}
              >
                {d.code}
              </li>
            ))}
          </ul>
        )}
      </div>
    </fieldset>
  );
}
