import { openSessions } from '../engine/championship';
import { POINTS, sessionKey } from '../engine/rules';
import type { SeasonData, SessionKind, Weekend } from '../engine/types';
import type { Projection } from '../engine/project';
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
            Pick who finishes in each points position. Picking a driver who is already placed moves them, so a driver can't hold two
            positions. Anyone not placed counts as DNF / outside the points (0 pts).
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

function SessionPicker({ round, kind, season }: { round: number; kind: SessionKind; season: SeasonData }) {
  const order = usePredictions((s) => s.predictions[sessionKey(round, kind)]);
  const setSlot = usePredictions((s) => s.setSlot);
  const drivers = season.entrants.flatMap((id) => season.drivers.filter((d) => d.id === id));
  const label = kind === 'race' ? 'Race' : 'Sprint';
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 md:grid-cols-3">
        {POINTS[kind].map((pts, i) => {
          const id = `p-${round}-${kind}-${i}`;
          return (
            <div key={i} className="flex items-center gap-2">
              <label htmlFor={id} className="w-16 shrink-0 text-xs tabular-nums">
                P{i + 1} <span className="opacity-60">({pts})</span>
              </label>
              <select
                id={id}
                className="field"
                value={order?.[i] ?? ''}
                onChange={(e) => setSlot(round, kind, i, e.target.value || null)}
                aria-label={`Round ${round} ${label} P${i + 1}`}
              >
                <option value="">— DNF / none</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} · {d.name}
                    {order?.includes(d.id) && order[i] !== d.id ? ` (P${order.indexOf(d.id) + 1})` : ''}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
