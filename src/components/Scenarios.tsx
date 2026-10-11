import { useMemo } from 'react';
import { titleScenarios } from '../engine/championship';
import type { Projection } from '../engine/project';
import { usePredictions } from '../store';
import { EmptyState, fmt, StatusBadge } from './ui';

export function Scenarios({ projection }: { projection: Projection }) {
  const rows = projection.rows.driver;
  const selected = usePredictions((s) => s.selectedDriver);
  const selectDriver = usePredictions((s) => s.selectDriver);
  const id = rows.some((r) => r.id === selected) ? selected : (rows[1]?.id ?? rows[0]?.id);

  const view = useMemo(() => (id ? titleScenarios(id, projection.standings.driver, projection.schedule) : null), [id, projection]);

  if (!view || !id) return <EmptyState title="No drivers yet">Scenarios appear once the season has standings.</EmptyState>;
  const me = rows.find((r) => r.id === id);
  const rival = rows.find((r) => r.id === view.rival);
  const isLeader = rows[0]?.id === id;
  const { needed, remaining } = view;
  const scenarioLabel = (pos: number | null) =>
    pos === null ? `${rival?.short} scores no more points` : pos === 1 ? `${rival?.short} wins every time` : `${rival?.short} finishes P${pos} every time`;
  const sessions = `${remaining.races} race${remaining.races === 1 ? '' : 's'}${remaining.sprints ? ` and ${remaining.sprints} sprint${remaining.sprints === 1 ? '' : 's'}` : ''}`;

  return (
    <section className="card space-y-4" aria-labelledby="scen-h">
      <div className="flex flex-wrap items-end gap-3">
        <h2 id="scen-h" className="text-lg font-semibold">
          Title scenarios
        </h2>
        <label className="text-sm">
          <span className="mr-2">Driver</span>
          <select className="field inline-block w-auto" value={id} onChange={(e) => selectDriver(e.target.value)}>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                P{r.position} · {r.name}
              </option>
            ))}
          </select>
        </label>
        {me && <StatusBadge status={me.status} />}
      </div>
      {projection.predicted.length > 0 && <p className="text-sm italic opacity-80">Includes your predictions; remaining sessions exclude predicted ones.</p>}

      <p className="text-base">
        {remaining.races + remaining.sprints === 0 ? (
          'No sessions remain.'
        ) : isLeader ? (
          <>
            Leads by <strong>{fmt(rival?.gap ?? 0)}</strong> points with <strong>{fmt(needed.maxAvailable)}</strong> still available
            from {sessions}.
          </>
        ) : needed.pointsNeeded === null ? (
          <>
            Mathematically eliminated: even {fmt(needed.bestCaseTotal)} points (winning everything) can't beat the leader.
          </>
        ) : (
          <>
            Needs <strong>{fmt(needed.pointsNeeded)}</strong> points from <strong>{fmt(needed.maxAvailable)}</strong> remaining ({sessions}) to pass
            the leader if the leader scores nothing more. Gap: {fmt(needed.gapToLeader)}.
          </>
        )}
      </p>
      <dl className="grid grid-cols-2 gap-2 text-sm sm:max-w-md">
        <dt className="opacity-70">Best case final total</dt>
        <dd className="tabular-nums">{fmt(needed.bestCaseTotal)}</dd>
        <dt className="opacity-70">Worst case final total</dt>
        <dd className="tabular-nums">{fmt(needed.worstCaseTotal)}</dd>
      </dl>

      {rival && view.scenarios.length > 0 && remaining.races + remaining.sprints > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-1 text-left text-sm opacity-80">
              Worst finishing position needed in <em>every</em> remaining race and sprint to finish ahead of {rival.name} (other drivers ignored).
            </caption>
            <thead className="text-left text-xs uppercase opacity-70">
              <tr>
                <th scope="col" className="py-1 pr-2">If…</th>
                <th scope="col" className="py-1">{me?.short ?? ''} needs</th>
              </tr>
            </thead>
            <tbody>
              {view.scenarios.map((s) => (
                <tr key={String(s.rivalPosition)} className="border-t border-zinc-200 dark:border-zinc-800">
                  <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                    {scenarioLabel(s.rivalPosition)}
                  </th>
                  <td className="py-1.5 font-medium">
                    {s.position === null ? 'Not possible' : s.position === 1 ? 'Win every time' : `P${s.position} or better`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
