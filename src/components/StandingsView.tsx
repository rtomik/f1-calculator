import type { ClinchInfo } from '../engine/championship';
import { POINTS } from '../engine/rules';
import type { Mode } from '../engine/types';
import type { Projection, TableRow } from '../engine/project';
import { teamColor } from '../teamColors';
import { EmptyState, fmt, Predicted, StatusBadge } from './ui';

export function StandingsView({ projection }: { projection: Projection }) {
  const anyPredicted = projection.predicted.length > 0;
  return (
    <div className="space-y-4">
      {anyPredicted && (
        <p className="text-sm">
          Showing <Predicted>projected</Predicted> standings including {projection.predicted.length} predicted session(s).
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <StandingsTable title="Drivers" mode="driver" rows={projection.rows.driver} clinch={projection.clinch.driver} asOf={projection.asOf} />
        <StandingsTable
          title="Constructors"
          mode="constructor"
          rows={projection.rows.constructor}
          clinch={projection.clinch.constructor}
          asOf={projection.asOf}
        />
      </div>
    </div>
  );
}

function clinchSummary(leader: TableRow, clinch: ClinchInfo | null, mode: Mode): string | null {
  if (!clinch || clinch.clinched || !clinch.next) return null;
  const where = `round ${clinch.next.round} ${clinch.next.kind}`;
  if (!clinch.canClinchNext) return null;
  if (mode === 'constructor') return `${leader.name} can clinch at the ${where} with a 1-2.`;
  const p = clinch.minPosition;
  return p !== null && p > POINTS[clinch.next.kind].length
    ? `${leader.name} clinches at the ${where} whatever happens.`
    : `${leader.name} clinches at the ${where} by finishing P${p} or better, even if every rival scores the maximum.`;
}

function asOfText(asOf: Projection['asOf']): string | null {
  if (!asOf) return null;
  const session = `R${asOf.round}${asOf.kind === 'sprint' ? ' sprint' : ''}`;
  return asOf.predicted ? `Projected points after ${session} (includes your predictions)` : `Points after ${session}`;
}

function StandingsTable({
  title,
  mode,
  rows,
  clinch,
  asOf,
}: {
  title: string;
  mode: Mode;
  rows: TableRow[];
  clinch: ClinchInfo | null;
  asOf: Projection['asOf'];
}) {
  const leader = rows[0];
  const summary = leader ? clinchSummary(leader, clinch, mode) : null;
  return (
    <section className="card min-w-0" aria-labelledby={`h-${mode}`}>
      <h2 id={`h-${mode}`} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      {rows.length > 0 && asOfText(asOf) && <p className={`text-sm opacity-80 ${asOf?.predicted ? 'italic' : ''}`}>{asOfText(asOf)}</p>}
      {summary && <p className="mt-1 text-sm font-medium">{summary}</p>}
      <div className="mb-2" />
      {rows.length === 0 ? (
        <EmptyState title="No standings yet">Standings appear after the first session of the season.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{title} championship standings</caption>
            <thead className="text-left text-xs uppercase opacity-70">
              <tr>
                <th scope="col" className="py-1 pr-2">Pos</th>
                <th scope="col" className="py-1 pr-2">{mode === 'driver' ? 'Driver' : 'Team'}</th>
                <th scope="col" className="py-1 pr-2 text-right">Pts</th>
                <th scope="col" className="py-1 pr-2 text-right">Gap</th>
                <th scope="col" className="hidden py-1 pr-2 text-right sm:table-cell">Wins</th>
                <th scope="col" className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-1.5 pr-2 tabular-nums">{r.position}</td>
                  <th scope="row" className="py-1.5 pr-2 text-left font-medium">
                    <span className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded" style={{ background: teamColor(r.teamId) }} />
                      <span className="sm:hidden">{mode === 'driver' ? r.short : r.name}</span>
                      <span className="hidden sm:inline">{r.name}</span>
                    </span>
                  </th>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {r.predictedPoints > 0 ? <Predicted>{fmt(r.points)}</Predicted> : fmt(r.points)}
                    {r.predictedPoints > 0 && <span className="sr-only"> (includes {fmt(r.predictedPoints)} predicted)</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.gap === 0 ? '—' : `−${fmt(r.gap)}`}</td>
                  <td className="hidden py-1.5 pr-2 text-right tabular-nums sm:table-cell">{r.wins}</td>
                  <td className="py-1.5">
                    <StatusBadge status={r.status} />
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
