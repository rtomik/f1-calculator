import { useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  type TooltipContentProps,
  type TooltipValueType,
  YAxis,
} from 'recharts';
import { chartData, LEADER, PRED, type Projection, type SeriesRow, type TableRow } from '../engine/project';
import type { Mode, SeasonData } from '../engine/types';
import { seriesColors } from '../teamColors';
import { EmptyState, fmt, Tabs } from '../components/ui';

// Drivers are capped so line charts stay readable; constructors are few enough to show all.
const MAX_DRIVER_SERIES = 8;
const RACE_COLOR = '#3b82f6';
const SPRINT_COLOR = '#d97706';
const MODES = [
  { id: 'driver', label: 'Drivers' },
  { id: 'constructor', label: 'Constructors' },
] as const;

const tooltipStyle = { background: 'var(--tt-bg)', border: '1px solid var(--tt-border)', borderRadius: 6, fontSize: 12 };
const axisTick = { fontSize: 12 };
// Legend text uses the normal text colour; the coloured icon next to it carries the identity.
const legendText = (value: string) => <span className="text-zinc-700 dark:text-zinc-300">{value}</span>;

export function Charts({ season, projection }: { season: SeasonData; projection: Projection }) {
  const [mode, setMode] = useState<Mode>('driver');
  const rows = projection.rows[mode];
  const shown = useMemo(() => (mode === 'driver' ? rows.slice(0, MAX_DRIVER_SERIES) : rows), [rows, mode]);
  const data = useMemo(
    () => chartData(season, projection.predicted, mode, shown.map((r) => r.id)),
    [season, projection.predicted, mode, shown],
  );
  const colors = useMemo(() => seriesColors(shown), [shown]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs tabs={MODES} value={mode} onChange={setMode} label="Championship" idPrefix="charts" />
        <p className="text-xs opacity-80">
          Solid line = actual results · dashed line + shaded area = your predictions
          {mode === 'driver' && rows.length > MAX_DRIVER_SERIES ? ` · top ${MAX_DRIVER_SERIES} drivers` : ''}
        </p>
      </div>
      {data.progression.length === 0 ? (
        <EmptyState title="No results yet">Charts appear after the first session, or once you add a prediction.</EmptyState>
      ) : (
        <div id={`charts-panel-${mode}`} role="tabpanel" aria-labelledby={`charts-tab-${mode}`} className="grid gap-4 xl:grid-cols-2">
          <LineFrame title="Points progression" desc="Cumulative championship points after each round." rows={data.progression} shown={shown} colors={colors} />
          <LineFrame
            title="Gap to leader"
            desc="Points behind whoever led after each round (0 = leading)."
            rows={data.gap}
            shown={shown}
            colors={colors}
            reversed
          />
          <LineFrame
            title="Maximum achievable points"
            desc="Points plus everything still available after each round. A line below the leader's points line means eliminated."
            rows={data.maxAchievable}
            shown={shown}
            colors={colors}
            leader
            footer={<EliminationList shown={shown} eliminatedAfter={data.eliminatedAfter} />}
          />
          <SplitChart split={data.split} shown={shown} />
        </div>
      )}
    </div>
  );
}

function ChartFrame({ title, desc, table, footer, children }: { title: string; desc: string; table: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <figure className="card min-w-0">
      <figcaption className="mb-2">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs opacity-80">{desc} Exact values are in the data table below the chart.</span>
      </figcaption>
      {/* Recharts' accessibility layer makes the chart keyboard-navigable (arrow keys move the tooltip). */}
      {children}
      {footer}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs opacity-80">Data table</summary>
        <div className="mt-2 max-h-72 overflow-auto">{table}</div>
      </details>
    </figure>
  );
}

function LineFrame({
  title,
  desc,
  rows,
  shown,
  colors,
  reversed = false,
  leader = false,
  footer,
}: {
  title: string;
  desc: string;
  rows: SeriesRow[];
  shown: TableRow[];
  colors: Record<string, string>;
  reversed?: boolean;
  leader?: boolean;
  footer?: ReactNode;
}) {
  const predicted = rows.filter((r) => r.predicted);
  const firstPred = predicted[0];
  const lastPred = predicted.at(-1);
  return (
    <ChartFrame title={title} desc={desc} footer={footer} table={<SeriesTable rows={rows} shown={shown} leader={leader} />}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 14, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} />
          <YAxis tick={axisTick} reversed={reversed} allowDecimals={false} />
          {firstPred && lastPred && (
            <ReferenceArea x1={firstPred.label} x2={lastPred.label} fill="#8b5cf6" fillOpacity={0.12} />
          )}
          <Tooltip content={SeriesTooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          {leader && <Line dataKey={LEADER} name="Leader's points" stroke="var(--leader)" strokeWidth={3} dot={false} isAnimationActive={false} />}
          {shown.map((r) => (
            <Line key={r.id} dataKey={r.id} name={r.short} stroke={colors[r.id]} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
          {shown.map((r) => (
            <Line
              key={r.id + PRED}
              dataKey={r.id + PRED}
              name={`${r.short} (predicted)`}
              legendType="none"
              stroke={colors[r.id]}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * One entry per competitor. At the hand-over round both the actual and the predicted series hold the
 * same value, so show the actual one on actual rounds and the predicted one on predicted rounds.
 */
function SeriesTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
  const row = payload?.[0]?.payload as SeriesRow | undefined;
  if (!active || !row) return null;
  const items = payload
    .filter((p) => typeof p.value === 'number' && String(p.dataKey).endsWith(PRED) === row.predicted)
    .sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div style={tooltipStyle} className="px-2 py-1.5">
      <p className="mb-1 font-semibold">
        {label} · {row.name}
        {row.predicted && <span className="font-normal italic"> (predicted)</span>}
      </p>
      <ul>
        {items.map((p) => (
          <li key={String(p.dataKey)} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-3" style={{ background: p.color }} />
            <span className="flex-1">{String(p.name).replace(' (predicted)', '')}</span>
            <span className="tabular-nums">{fmt(Number(p.value))}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SeriesTable({ rows, shown, leader }: { rows: SeriesRow[]; shown: TableRow[]; leader: boolean }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th scope="col" className="pr-2 text-left">Round</th>
          {leader && <th scope="col" className="pr-2 text-right">Leader</th>}
          {shown.map((r) => (
            <th key={r.id} scope="col" className="pr-2 text-right">
              {r.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.round} className={row.predicted ? 'italic' : ''}>
            <th scope="row" className="pr-2 text-left font-normal">
              {row.label} {row.name}
              {row.predicted ? ' (predicted)' : ''}
            </th>
            {leader && <td className="pr-2 text-right tabular-nums">{String(row[LEADER] ?? '')}</td>}
            {shown.map((r) => {
              const v = row.predicted ? row[r.id + PRED] : row[r.id];
              return (
                <td key={r.id} className="pr-2 text-right tabular-nums">
                  {typeof v === 'number' ? fmt(v) : '—'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EliminationList({ shown, eliminatedAfter }: { shown: TableRow[]; eliminatedAfter: Record<string, number | null> }) {
  const out = shown.filter((r) => eliminatedAfter[r.id] != null);
  if (out.length === 0) return <p className="mt-2 text-xs opacity-80">Nobody shown has been eliminated yet.</p>;
  return (
    <p className="mt-2 text-xs opacity-80">
      Eliminated: {out.map((r) => `${r.short} after R${eliminatedAfter[r.id]}`).join(' · ')}
    </p>
  );
}

function SplitChart({ split, shown }: { split: ReturnType<typeof chartData>['split']; shown: TableRow[] }) {
  const names = new Map(shown.map((r) => [r.id, r.short]));
  const rows = split.map((s) => ({ ...s, name: names.get(s.id) ?? s.id }));
  const segments = [
    { key: 'raceActual', name: 'Race', fill: RACE_COLOR },
    { key: 'sprintActual', name: 'Sprint', fill: SPRINT_COLOR },
    { key: 'racePredicted', name: 'Race (predicted, hatched)', fill: 'url(#hatch-race)' },
    { key: 'sprintPredicted', name: 'Sprint (predicted, hatched)', fill: 'url(#hatch-sprint)' },
  ] as const;
  const table = (
    <table className="w-full text-xs">
      <thead>
        <tr>
          <th scope="col" className="pr-2 text-left">Name</th>
          {segments.map((s) => (
            <th key={s.key} scope="col" className="pr-2 text-right">
              {s.name.replace(', hatched', '')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <th scope="row" className="pr-2 text-left font-normal">
              {r.name}
            </th>
            {segments.map((s) => (
              <td key={s.key} className="pr-2 text-right tabular-nums">
                {fmt(r[s.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartFrame title="Points: race vs sprint" desc="Where each total came from. Hatched segments are predicted." table={table}>
      <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 30 + 70)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            {[
              ['hatch-race', RACE_COLOR],
              ['hatch-sprint', SPRINT_COLOR],
            ].map(([id, color]) => (
              <pattern key={id} id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="6" height="6" fill={color} fillOpacity={0.25} />
                <line x1="0" y1="0" x2="0" y2="6" stroke={color} strokeWidth="3" />
              </pattern>
            ))}
          </defs>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" tick={axisTick} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={axisTick} width={90} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fillOpacity: 0.1 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={legendText} />
          {segments.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="pts" fill={s.fill} stroke="var(--tt-bg)" strokeWidth={1} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
