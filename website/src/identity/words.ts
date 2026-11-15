/**
 * Every word the identity's pieces print, in one place, so the product lane changes them in one edit.
 * Figures are never typed here: a label that holds a number takes it from the data and has a plain form without it.
 */

export const WORDS = {
  brand: 'Isogon',
  entryLine: 'Two NASA satellite sensors, MODIS and VIIRS, on one scale.',
  play: 'Play',
  explore: 'Explore',
  stop: 'Click or press any key to stop',
  links: { search: 'Search', method: 'Method', sources: 'Sources' },
  story: {
    world: 'World',
    jump: 'The jump',
    place: 'One place',
    fire: 'One fire',
    tested: 'Tested fires',
    live: 'Live',
  },
};

/** "Fire on Earth, 2000 to 2025", from the record's own first and last years; plain when they are not known. */
export function entryTitle(firstYear?: number | null, lastYear?: number | null) {
  if (firstYear != null && lastYear != null) return `Fire on Earth, ${firstYear} to ${lastYear}`;
  return 'Fire on Earth';
}
