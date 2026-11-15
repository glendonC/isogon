# Mounting the data displays

Built to the ux lane's in-scene look. No box anywhere: pointing at a month, a year or a method frames it with pale
cyan corner brackets (`#9fe3ff`, the interface's one colour) and sets its exact readout beside or above it in mono
capitals, with the action in white where pressing does something. Data keeps its colours: orange MODIS `#ff7a45`,
light blue VIIRS `#8fd6f5`, the estimate white. Every component reads the identity's CSS variables first (`--id-*`,
the cyan as `--id-ui`). A live page of every component: run the dev server and open `/src/dataviz/preview.html`
(add `?still` for a headless capture: the frame's close-in motion off).

## Once, in `main.tsx` (after the identity's stylesheet)

```ts
import './dataviz/dataviz.css';
```

## The Record's grid and its held-out line (compare-view lane, `beats/calendar/TheRecord.tsx`)

The route's answer the screen already holds (`GET /api/calendar` or `GET /api/cube/record`) goes in whole:

```tsx
import { RecordGrid } from '../../dataviz/RecordGrid';
import { cellsFromCalendar, heldOutFromCalendar } from '../../dataviz/recordCells';

const record = cellsFromCalendar(calendarAnswer);
{record ? (
  <RecordGrid record={record} selected={pickedYm} onPick={setPickedYm} heldOut={heldOutFromCalendar(calendarAnswer)} />
) : null}
```

It replaces the grid's SVG, its legend, the two satellite lines, the month label with its range bar and the grey
method line: the frame rests on `selected` ("YYYY-MM") and follows the pointer, with the month's readout above the
grid and a leader down to it. Pass `action` (two to four words, for example the product lane's words for showing
the month's fire) and it is set over the readout while the frame is on the picked month; click picks a month.
The product lane's words go in `words` (legend and satellite names) and `line` (the line under the grid).
A drawn area (`/api/cube/record`) has no validation block, so its line is left out unless `line` is given.

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
import { seriesFromCube, seriesFromCountry } from '../dataviz/yearSeries';

const series = countryKey ? seriesFromCountry(countriesAnswer, countryKey) : seriesFromCube(yearsAnswer);
{series ? <YearBars series={series} upTo={playingYear} current={currentYear} oneScale={onOneScale} /> : null}
```

Orange bars where MODIS counted, light blue from VIIRS's first year; `oneScale` adds each year's estimate as a white
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
