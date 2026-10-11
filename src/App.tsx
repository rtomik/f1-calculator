import { useMemo, useState } from 'react';
import { useSeason } from './api/season';
import { project } from './engine/project';
import type { SeasonData } from './engine/types';
import { usePredictions } from './store';
import { EmptyState, ErrorState, Skeleton, Tabs } from './components/ui';
import { StandingsView } from './components/StandingsView';
import { Predictor } from './components/Predictor';
import { Scenarios } from './components/Scenarios';
import { Charts } from './charts/Charts';

const TABS = [
  { id: 'standings', label: 'Standings' },
  { id: 'predictor', label: 'Predictor' },
  { id: 'scenarios', label: 'Title scenarios' },
  { id: 'charts', label: 'Charts' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function App() {
  const season = useSeason();
  const [tab, setTab] = useState<TabId>('standings');

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold sm:text-2xl">
          F1 Championship Calculator
          {season.status === 'success' && <span className="ml-2 text-base font-normal opacity-70">{season.data.season}</span>}
        </h1>
        {season.status === 'success' && season.isFetching && (
          <span role="status" className="text-xs opacity-70">
            Refreshing…
          </span>
        )}
      </header>
      <nav className="mb-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Sections" idPrefix="main" />
      </nav>
      <main>
        <div id={`main-panel-${tab}`} role="tabpanel" aria-labelledby={`main-tab-${tab}`}>
          {season.status === 'pending' && <Skeleton rows={10} label="Loading championship data" />}
          {season.status === 'error' && <ErrorState error={season.error} onRetry={season.retry} />}
          {season.status === 'success' && <Loaded season={season.data} tab={tab} />}
        </div>
      </main>
      <footer className="mt-8 text-xs opacity-60">
        Data: Jolpica-F1 (Ergast-compatible). Predictions live in memory and are lost on reload.
      </footer>
    </div>
  );
}

function Loaded({ season, tab }: { season: SeasonData; tab: TabId }) {
  const predictions = usePredictions((s) => s.predictions);
  const projection = useMemo(() => project(season, predictions), [season, predictions]);

  if (season.schedule.length === 0) {
    return <EmptyState title="Off-season">There is no schedule for the current season yet. Check back once the calendar is published.</EmptyState>;
  }
  return (
    <>
      {projection.mismatch && (
        <p role="note" className="mb-3 rounded border border-amber-300 bg-amber-50 p-2 text-sm dark:border-amber-800 dark:bg-amber-950">
          Official standings differ from the sum of race results (likely a penalty). Totals use the official standings; charts use results.
        </p>
      )}
      {tab === 'standings' && <StandingsView projection={projection} />}
      {tab === 'predictor' && <Predictor season={season} projection={projection} />}
      {tab === 'scenarios' && <Scenarios projection={projection} />}
      {tab === 'charts' && <Charts season={season} projection={projection} />}
    </>
  );
}
