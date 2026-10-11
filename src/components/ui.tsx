import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ZodError } from 'zod';
import type { Status } from '../engine/types';

export const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Skeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
      <p className="font-semibold">Couldn't load championship data.</p>
      <p className="mt-1 text-sm break-words opacity-80">{error instanceof ZodError ? 'The API returned data in an unexpected format.' : error.message}</p>
      <button type="button" onClick={onRetry} className="btn mt-3">
        Retry
      </button>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm opacity-80">{children}</div>}
    </div>
  );
}

const STATUS_STYLE: Record<Status, { icon: string; cls: string }> = {
  Champion: { icon: '★', cls: 'bg-amber-200 text-amber-950 dark:bg-amber-500/30 dark:text-amber-100' },
  Leading: { icon: '▲', cls: 'bg-emerald-200 text-emerald-950 dark:bg-emerald-500/30 dark:text-emerald-100' },
  'In contention': { icon: '●', cls: 'bg-sky-200 text-sky-950 dark:bg-sky-500/30 dark:text-sky-100' },
  Eliminated: { icon: '✕', cls: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {status}
    </span>
  );
}

/** Marker for predicted values: italic + "pred" tag, so it never relies on colour alone. */
export function Predicted({ children }: { children: ReactNode }) {
  return (
    <span className="italic text-violet-700 dark:text-violet-300">
      {children}
      <span className="ml-0.5 align-super text-[0.6rem] not-italic">pred</span>
    </span>
  );
}

/** Accessible tabs (WAI-ARIA pattern: arrow keys move between tabs). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  idPrefix,
}: {
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    const next = (i + delta + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${t.id}`}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          aria-selected={value === t.id}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
            value === t.id
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'hover:bg-zinc-200 dark:hover:bg-zinc-800'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
