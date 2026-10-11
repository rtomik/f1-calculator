# F1 Championship Calculator

Live F1 standings, a session-only race predictor, and title maths: who's still in it, what each driver needs, and when the leader can clinch.

React + Vite + TypeScript (strict) · TanStack Query · Zustand · Recharts · Tailwind v4 · Zod · Vitest. Static build, no backend.

## Setup

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run coverage   # tests + 100% coverage gate on src/engine
npm run build      # typecheck + static build into dist/ (relative base, deploy anywhere)
```

Node 20+.

## Project layout

```
src/
  engine/              pure championship logic, no React, 100% covered
    rules.ts           points tables, tie-break notes (the single rules config)
    types.ts
    championship.ts    applyPredictions, maxPointsRemaining, isMathematicallyEliminated,
                       canClinch, pointsNeededToWin, minUniformPosition, withStatus, assignSlot
    project.ts         season + predictions → table rows, clinch info, chart series
    *.test.ts
  api/
    client.ts          throttled fetch (≥300 ms between requests), Zod validation, pagination
    schemas.ts         Zod schemas for every endpoint
    season.ts          TanStack queries + buildSeason (API → engine model)
    season.test.ts     runs the real 2026 snapshot through fetch → parse → engine
    __fixtures__/      recorded Jolpica responses (after the R17 sprint, before the R17 race)
  components/          Standings, Predictor, Scenarios, shared UI (skeleton/error/empty/tabs/badges)
  charts/Charts.tsx    all charts, for drivers and constructors
  store.ts             Zustand prediction state (memory only)
  teamColors.ts        official team colours + fallback palette
```

## Data source and assumptions

- **API:** Jolpica-F1 at `https://api.jolpi.ca/ergast/f1` (`/current.json`, `/current/driverStandings.json`, `/current/constructorStandings.json`, `/current/results.json`, `/current/sprint.json`). Results and sprint endpoints are paged 100 rows at a time. One race is about 22 rows, so a race can be split across two pages. Pages are merged by round.
- **Which sessions are done:** taken from the results themselves (a round has race or sprint results). `standings.round` is never used, because it already says "17" when only the R17 sprint has been run.
- **Points:** totals come from the official standings endpoints, because they include penalties. Countback and per-round progression come from the race results. If the two disagree, a banner says so.
- **Countback:** race (Grand Prix) finishing positions only; sprint results are not counted. Only rows whose `positionText` is numeric count as classified. Retired, withdrawn and disqualified rows carry a numeric `position`, but it is ignored. If two competitors are still tied after the full countback, they stay in API order. The FIA's further tie-break criteria aren't modelled.
- **Sprint weekends:** marked by the schedule's `Sprint` field, or by sprint results existing for that round.
- **Driver → team:** taken from the driver's most recent result. This handles mid-season swaps; the standings list Lawson under `red_bull` last, but his latest result is with `rb`.
- **Predictor grid:** the entrants of the most recent session, so replaced drivers don't appear in the dropdowns.
- **Rate limits:** requests run one at a time with at least 300 ms between them (limit is 4 req/s). A cold load is about 9 requests. `staleTime` is 5 min. The app polls every 10 min while the tab is visible (matching Jolpica's 10-min CDN cache) and refetches when you return to the tab if the data is stale. A Refresh button is in the header. Failures retry up to 3 times with exponential backoff. Zod shape errors are never retried, since retrying would only use up the hourly quota.
- **Off-season:** an empty schedule shows an "Off-season" state. A season with no results shows empty standings, charts and predictor states.

## Ambiguities and the choices made

- **Elimination** assumes rivals can score 0 (for example a DNF). A competitor is eliminated when someone is already strictly ahead of their best case: winning every remaining race and sprint (a 1-2 for constructors), with the extra wins counted in the countback.
- **Champion** means nobody's best case can catch the leader, countback included.
- **Minimum result to clinch:** the worst position in the *next session* that still clinches, assuming every rival gets their best result in that session. The next session is the sprint if one is pending. For constructors the app only answers "would a 1-2 clinch it?", because "minimum two-car result" has no single natural ordering.
- **"Needs X points":** X is the gap +1, or just the gap if a tie would go their way on countback.
- **Title scenarios** ("leader scores 0" / "leader P2 every time"): the worst position the driver needs in *every* remaining race and sprint to finish ahead of the leader. If the selected driver is the leader, the rival is P2. Other drivers are ignored.
- **Predictions:** each points position (P1–P10 race, P1–P8 sprint) can be filled by dragging a driver from the "not placed" pool or by its dropdown. Dragging one position onto another swaps them; dragging back to the pool removes the driver. Quick-fill buttons per session: *Current standings* (championship order, current grid only), *Previous race/sprint* (your earlier prediction if you made one, otherwise the actual result), and *Clear*. Duplicates are impossible: placing a driver who is already placed moves them. Anyone not placed is a DNF / outside the points (0 pts). A session counts as predicted, and stops counting as remaining, as soon as one slot is filled.
- **Dark mode** follows the OS setting (`prefers-color-scheme`); there is no manual toggle.
- **Line charts** show the top 8 drivers by projected points to stay readable. All constructors are shown.

## Known limitations

- Predicted sessions only fill the points positions. Countback for predicted rounds therefore ignores P11 and below, which matters only for extremely deep ties.
- Half points or shortened-race rules aren't applied to predictions; predictions always use full points.
- Penalties applied after a race appear in totals (from the standings endpoints) but not in the progression charts (from results). A banner flags the mismatch.
- Drag and drop uses the browser's native HTML5 drag and drop, which some mobile browsers support poorly. On touch devices the dropdowns and quick-fill buttons do the same job.
- Teammates share a team colour. The second car gets a shaded variant, and every chart has a data table, so identity never depends on colour alone.
- The JS bundle is ~780 kB minified (233 kB gzipped), mostly Recharts; it is not code-split.
- Team colours are hardcoded per `constructorId`. A new team gets a stable fallback colour until it is added to `teamColors.ts`.
