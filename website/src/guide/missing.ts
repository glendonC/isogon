import type { StageMissingFile } from '../stage/earthCutawayTypes';
import { listAnd } from './formats.ts';

const FILE_NAMES: Record<StageMissingFile, string> = {
  elevation: 'elevation',
  imagery: 'imagery',
  field: 'power across the ground',
  estimate: 'estimate',
};

/**
 * What the stage shows in place of the files of the run that did not load (its telemetry's `missingFiles`), in one
 * sentence: flat ground for the elevation, one plain tone for the imagery, the power and the estimate not drawn.
 */
export function missingLine(files: readonly StageMissingFile[] | null | undefined): string | null {
  if (!files || files.length === 0) return null;
  const has = (f: StageMissingFile) => files.includes(f);
  const names = (['elevation', 'imagery', 'field', 'estimate'] as const).filter(has).map((f) => FILE_NAMES[f]);
  const ground = [has('elevation') ? 'flat' : null, has('imagery') ? 'in one plain tone' : null].filter(Boolean);
  // The power and the estimate are simply not drawn; the satellites' own detections still are.
  const absent = (['field', 'estimate'] as const).filter(has).map((f) => FILE_NAMES[f]);
  const shown: string[] = [];
  if (ground.length > 0) shown.push(`the ground is drawn ${ground.join(' and ')}`);
  if (absent.length > 0) {
    if (ground.length > 0) shown.push(`the ${listAnd(absent)} ${absent.length > 1 ? 'are' : 'is'} not drawn`);
    else shown.push(absent.length > 1 ? 'neither is drawn' : 'it is not drawn');
  }
  const list = listAnd(names);
  if (!list) return null;
  return `This fire's ${list} did not load, so ${shown.join(', and ')}.`;
}
