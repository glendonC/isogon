// Run with: npm test. At a reveal the hidden satellite's detections are drawn once: through the pass
// laid on after scoring. The frame's own pass of that satellite, which the page un-marks when it lays
// the detections on, stays a pass kept from the model, so its footprints are not drawn a second time
// and the estimate at that pass keeps the frames of the cells the model declared.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeObserverDataset } from './types.ts';

const BBOX = [-121.44, 39.86, -120.92, 40.24];
const fp = (lon, lat, code) => [lon, lat, 0.4, 0.4, 0, 5.0, 50, code];

function frame(i, sensor, extra) {
  return {
    frame: i,
    timestamp_utc: `2012-08-11T0${i % 10}:00:00Z`,
    is_day: false,
    sensor,
    passes: [{ sensor, sensor_code: sensor === 'VIIRS_SNPP' ? 4 : 0, footprint_count: 0 }],
    footprints: [],
    ...extra,
  };
}

const sensorCodes = { 0: 'MODIS_TERRA', 4: 'VIIRS_SNPP' };

test('a revealed frame draws its detections once, through the pass laid on', () => {
  const revealed = frame(1, 'VIIRS_SNPP', {
    epistemic_regime: 'viirs_overpass',
    held_out: false,
    revealed: true,
    footprints: [fp(-121.2, 40.0, 4), fp(-121.1, 40.05, 4)],
  });
  revealed.passes.push({ sensor: 'VIIRS_SNPP', sensor_code: 4, revealed_after_scoring: true, footprint_count: 2 });
  const ds = normalizeObserverDataset(
    { source: 'firms', sensor_codes: sensorCodes, frames: [frame(0, 'MODIS_TERRA', { epistemic_regime: 'modis_overpass' }), revealed] },
    BBOX,
  );
  const passes = ds.frames[1];
  const own = passes.find((sp) => !sp.revealed);
  const laidOn = passes.find((sp) => sp.revealed);
  assert.equal(laidOn.footprints.length, 2);
  assert.equal(own.hidden, true);
});

test('a look laid on a hidden frame leaves the rest of the frame as it was', () => {
  const looked = frame(1, 'VIIRS_SNPP', {
    epistemic_regime: 'viirs_overpass_held_out',
    held_out: true,
    footprints: [fp(-121.2, 40.0, 4)],
  });
  looked.passes.push({ sensor: 'VIIRS_SNPP', sensor_code: 4, revealed_by_a_look: true, footprint_count: 1 });
  const ds = normalizeObserverDataset({ source: 'firms', sensor_codes: sensorCodes, frames: [looked] }, BBOX);
  const passes = ds.frames[1];
  assert.equal(passes.find((sp) => !sp.revealed).hidden, true);
  assert.equal(passes.find((sp) => sp.revealed).revealedByLook, true);
});

test('a pass of another satellite on the same frame is not hidden by a reveal', () => {
  const both = frame(0, 'MODIS_TERRA', { epistemic_regime: 'modis_overpass', footprints: [fp(-121.2, 40.0, 0), fp(-121.1, 40.0, 4)] });
  both.passes.push({ sensor: 'VIIRS_SNPP', sensor_code: 4, revealed_after_scoring: true, footprint_count: 1 });
  const ds = normalizeObserverDataset({ source: 'firms', sensor_codes: sensorCodes, frames: [both] }, BBOX);
  const modis = ds.frames[0].find((sp) => sp.family === 'modis');
  assert.equal(modis.hidden, undefined);
  assert.equal(modis.footprints.length, 1);
});
