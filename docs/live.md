# The live test

The blind test ([method.md](method.md)) hides VIIRS on past fires. A test on the past can always be doubted. The
live test predicts passes that have not happened yet: for fires burning now, it predicts what VIIRS on NOAA-20 and
NOAA-21 will detect on each coming pass, from MODIS detections alone, and writes the prediction down with a SHA-256
fingerprint and the time before the pass begins. When NASA publishes the pass's rows, the sealed prediction is scored.
Only a seal that was pushed to the public repository before its pass has a public timestamp ([the seal
log](#the-seal-log-in-the-repository)).

The rows are FIRMS near real time rows, with real time and ultra real time rows in the United States and Canada.
They are not the science-quality archive the blind test reads. Every answer that shows a score says so. The counts of
seals and scores change as passes come: `GET /api/live` serves them, and this document gives none.

## What it does

The code is `backend/live/`. Its constants are `backend/live/protocol.py`, written into `protocol.json` before the
first seal; the runner refuses to start when the protocol of its code differs from the one on record.

1. **Fires, from MODIS rows alone.** At the first run and every 24 hours after, one area API request asks for the
   world's `MODIS_NRT` rows of the last two days. The rows are counted in a lattice of boxes of the product's size
   (0.52 by 0.38 degrees). Each lattice box gives a candidate of the same size centred on the median of its rows.
   Candidates with fewer than 30 rows are dropped. Candidates are grouped by the nearest of six world anchors, and
   12 are taken round robin over the groups, largest first, none meeting another. No VIIRS row is read.
2. **Coming passes.** NOAA-20 and NOAA-21 fly a 16-day repeat orbit, so their granules over a box start at the same
   minutes 16 days apart. The coming passes over a box are the passes of the standard collections 16 days earlier
   (NASA CMR, no key), moved forward 16 days. The minute the scan crosses the box and the pixel size there are
   computed as `backend/eval/schedule.py` computes them for a listed pass. Only a pass whose swath holds the whole
   box is predicted. Suomi NPP ceased production on 2 November 2026 and is not predicted.
3. **Seal.** Between 30 and 10 minutes before a pass begins, the three methods of the blind test answer for it from
   every MODIS row of the fire's context box (five times the box on each side) acquired in the two days before:
   `painted_modis`, `overlap_ratio` and the estimate in use, the occupancy filter alone. The learned layer of
   [method.md](method.md) is not sealed, so a live score is the filter's, not the blend's. The record holds the
   protocol's digest, the code's commit, the digests of the fitted values, the slot as a method is told it, the MODIS
   reply used with its digest, and each method's published entry with the digest of its arrays. It is canonical JSON;
   its SHA-256 is taken; it is appended to `seals.jsonl` with the digest of the line before it, so a changed line
   breaks the chain. A pass whose deadline passes unsealed goes to `missed.jsonl` and is never sealed.
4. **The sealing path holds no way to a VIIRS row.** It is given a fetcher that serves `MODIS_NRT` only and raises on
   any other source (`backend/tests/test_live_seal.py` runs a whole cycle with a fetcher that fails on any VIIRS
   request).
5. **Score.** From two hours after a pass, NASA's near real time collections in CMR are asked for it. Four hours
   after the real pass ends (FIRMS states three), its NRT rows over the context box are fetched once. Then
   `blind_test_sealed` of `backend/eval/blind_test.py`, unchanged, scores the sealed predictions read back from
   their arrays file, after each is checked against its sealed digests. A score is kept only when the report's
   published entries are the sealed ones exactly.
6. **Nothing is dropped.** A seal is scored or marked with its reason: no pass listed within 12 hours, a real swath
   that held only part of the box, a real pass that began before the seal, rows not obtained within 36 hours.

## A score withdrawn

A look is scored only on a reply retrieved after its pass's rows were due. Two passes of one fire, one satellite and
one day ask FIRMS the same question, so a reply held from the earlier pass is not reused for the later one. A score
found decided on such an early reply is withdrawn by a line of its own in `scores.jsonl`, with the digest of the line
it withdraws and the reason, and the look is scored again on a reply retrieved after. The withdrawn line stays in the
log, and the answer lists it under `withdrawn` and on its seal, with what it said and why it was withdrawn.

## When the sealer was not running

The sealer writes one line per cycle (every 5 minutes) and one per start. A stretch of more than two cycles with no
line is a stop. The answer lists every stop with the passes whose seal window it held, and a pass missed that way
says so in its reason. A page draws a stop as a stretch when the sealer was not running: no seal in it says nothing
about fire. Before the first recorded cycle only the runner's starts are known, from its log, so that stretch is
drawn as not recorded.

## The seal log in the repository

`data/live_seals.csv` is the seal log. It holds one line per seal: the UTC time it was sealed, its fingerprint (the
SHA-256 of the sealed record), its fire, its satellite and the predicted minute of the pass. The runner adds a line as
soon as a seal is made and commits that file alone; a line already written is never changed.

Only a seal that was pushed to the public repository before its pass has a public timestamp. A copy of the repository
published before a pass shows that seal in the log, and so witnesses every seal whose pass came after the copy. The
time in a line is the sealer's own clock. A seal pushed only after its pass has no public timestamp before it, whatever
its line says. Each fingerprint can be checked against `seals.jsonl` in the live folder, whose chain checks
every line before it.

## How a result is judged

As [method.md](method.md) judges: per fire, the plain comparison of `verdict` (strictly better than both baselines);
over the fires, `bootstrap_verdict` (fires resampled whole, a score ahead or behind only when the 90 percent interval
of its improvement says so). A new box has no burning calendar, so `overlap_ratio` states no pixel count and the
pixel count score is not judged. A negative result stays.

## Files

The live folder lies outside the repository and is written only by the runner:

| File | What |
| --- | --- |
| `protocol.json` | The protocol, its digest, the time it was written and the code's commit |
| `cohorts.jsonl` | Each choice of fires with the reply it came from |
| `seals.jsonl` | One line per sealed prediction, chained |
| `arrays/<sha256>.bin` | The arrays of each seal's three predictions, named by their digest |
| `missed.jsonl` | Passes that were due and not sealed, with the reason and the seal window |
| `cycles.jsonl` | One line per start and per cycle of the sealer, chained |
| `scores.jsonl` | One line per seal once it is scored or marked, chained |
| `state.json`, `summary.json`, `live.json` | Rewritten each cycle: waiting states, the running count, the page's answer |
| `cache/` | Every FIRMS and CMR reply as returned, with its URL (the key replaced by `<MAP_KEY>`) and digest |

## Running it

```bash
uv run --no-project --python 3.12 --with numpy --with pillow python3 -m backend.live.run \
    --env-file <folder>/.env --live-dir <live folder> --witness <second record>.md
```

The key `FIRMS_MAP_KEY` is read as `backend/firms/area_api.py` reads it and never printed. A lock keeps one runner
per live folder. Stopped and started again, it reads its logs, checks their chains, seals no pass twice and adds to
the second record any digest missing there. The answer is served read only by
`python3 backend/server_live.py --live-dir <live folder> --port 9388` at `GET /api/live`.

## Rehearsing the scoring path

`python3 -m backend.live.rehearse --env-file <folder>/.env --live-dir <live folder> --dir <rehearsal folder> --from
<UTC> --to <UTC>` follows the live test's latest fires again in a folder of its own, from a stretch already past: the
sealer runs with its clock set back over that stretch, then the scorer runs with the real clock on the same real
replies the runner would read. Nothing it makes is a seal (its MODIS rows were fetched after the time it seals at and
its digests were written after the passes). The live folder is only read, and its lock is not taken.
