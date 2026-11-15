# Mounting the data displays

Built to the ux lane's IDENTITY-2. Colour is only for data: orange MODIS, light blue VIIRS, white the estimate.
Every component reads the identity's CSS variables first (`--id-*`), so it follows `identity.css` once that lands.
A live page of every component: run the dev server and open `/src/dataviz/preview.html`.

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

It replaces the grid's SVG, its legend, the two satellite lines and the grey method line. `selected` is "YYYY-MM".
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
