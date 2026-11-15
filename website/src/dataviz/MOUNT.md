# Mounting the data displays

Built to the ux lane's in-scene look. No box anywhere: pointing at a month, a year or a method frames it with pale
cyan corner brackets (`#9fe3ff`, the interface's one colour) and sets its exact readout beside or above it in mono
capitals, with the action in white where pressing does something. Data keeps its colours: orange MODIS `#ff7a45`,
light blue VIIRS `#8fd6f5`, the estimate white. Every component reads the identity's CSS variables first (`--id-*`,
the cyan as `--id-signal`). A live page of every component: run the dev server and open `/src/dataviz/preview.html`
(add `?still` for a headless capture: the frame's close-in motion off).

## Once, in `main.tsx` (after the identity's stylesheet)

```ts
import './dataviz/dataviz.css';
```

## The Record's grid (compare-view lane, `beats/calendar/TheRecord.tsx`)

The route's answer the screen already holds (`GET /api/calendar` or `GET /api/cube/record`) goes in whole:

```tsx
import { RecordGrid } from '../../dataviz/RecordGrid';
import { cellsFromCalendar } from '../../dataviz/recordCells';

const record = cellsFromCalendar(calendarAnswer);
{record ? (
  <RecordGrid
    record={record}
    selected={pickedYm}
    onPick={setPickedYm}
    actionFor={(cell) => (cell.ym === fireYm ? words.openFire(cell) : null)}
  />
) : null}
```

It replaces the grid's SVG, its legend, the two satellite lines and the month label with its range bar. The reticle
rests on `selected` ("YYYY-MM") and follows the pointer; over the grid, in the pointed month's column, its prompt
(`actionFor`'s words where pressing opens something, else the month's name) and two readout lines (each satellite as
counted, then the value on one scale with its range). Click picks a month. To mount the identity's `ScenePrompt`
instead, pass `frame={false}` and `onPoint={(cell, box) => ...}`: it gives the pointed month and its box on screen.
No line under the grid: the held-out check goes to the Method sheet's Record section (`heldOutFromCalendar` and
`heldOutText` in `recordCells` give it from the route; `line` or `heldOut` still draw it under the grid if wanted).

## The 57 fires' result (world-view lane, the test's panel, `world/WorldTest.tsx`)

```tsx
import { OverlapBars } from '../dataviz/OverlapBars';
import { overlapFromEvidence } from '../dataviz/overlapRows';

const overlap = overlapFromEvidence(evidence, 'test_b');
{overlap ? <OverlapBars overlap={overlap} /> : null}
```

It reads `fresh_test.test_b.all.scores` and `beside_the_headline.challenger_blend.against_the_baselines.scores`
from `GET /api/evidence`. It replaces the panel's table of ahead, level and behind on the main screen; the detail
sheet keeps its seven rows. Words in `words` (title, line, the two bar names).

## The years (world-view lane, the Earth's years, `world/EarthYears.tsx`)

```tsx
import { YearBars } from '../dataviz/YearBars';
import { countryName, seriesFromCube, seriesFromCountry } from '../dataviz/yearSeries';

// countryKey: the map's name (the atlas, for example "United States of America") or the store's file name.
const series = countryKey ? seriesFromCountry(countriesAnswer, countryKey) : seriesFromCube(yearsAnswer);
const label = countryKey ? countryName(countriesAnswer, countryKey) : null;
{series ? <YearBars series={series} upTo={playingYear} current={currentYear} oneScale={onOneScale} /> : null}
```

`countriesAnswer` is `GET /api/cube/years/countries` whole (its `countries` arrays and `by_atlas`). Orange bars where
MODIS counted, light blue from VIIRS's first year; `oneScale` adds each year's estimate as a white
outline. `upTo` draws the years only up to the one playing, on the scale of every year, so bars never rescale.
It replaces the strip's bars, line and key.

## The live table (world-view lane, the sealed board, `world/SealedTonight.tsx`)

```tsx
import { LiveTable } from '../dataviz/LiveTable';
import { rowsFromLive } from '../dataviz/liveRows';

const table = rowsFromLive(liveAnswer, (f) => (f.centre ? countryAt(f.centre[0], f.centre[1]) : null) ?? partWords(f));
{table ? <LiveTable table={table} /> : null}
```

One row a fire with a sealed prediction (its latest seal), newest first: the fire, when the prediction was locked,
whether VIIRS's data has arrived and been checked, and the seal's fingerprint. `partWords` is exported from
`liveRows`. Column heads in `heads`.
