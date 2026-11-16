/**
 * Every word the identity's pieces print, in one place, so the product lane changes them in one edit.
 * Figures are never typed here: a label that holds a number takes it from the data and has a plain form without it.
 */

export const WORDS = {
  brand: 'Isogon',
  entryLine:
    "NASA's fire record jumps in 2012, when a sharper satellite joined. Isogon puts every year on one scale, then hides that satellite and tests how well each fire can be rebuilt without it.",
  play: 'Play',
  explore: 'Explore',
  search: 'Search',
  stop: 'The story plays by itself along the bottom. Any key stops it.',
  links: { search: 'Search', method: 'Method', sources: 'Sources', menu: 'Menu' },
  /** The one menu at the top right: the documents and the sound. */
  menu: { label: 'Menu', close: 'Close' },
  /** The documents the menu lists, by the names the reading view gives them (components/EvidenceSheet.tsx). */
  docs: {
    fire: 'This fire',
    tests: 'Every test',
    sealed: 'Sealed before the pass',
    method: 'Method',
    sensors: 'Sensor geometry',
    sources: 'Sources',
  },
  /** While a picture of the world (its code or its data) is still on its way over the network. */
  waitEarth: 'Loading every year of fire on Earth',
  waitWorld: 'Loading',
  /** The level above a place on the path, the Earth's years; the first screen's "Explore the Earth" goes there. */
  earth: 'The Earth',
  /** The bottom edge while the visitor goes by themselves: the way back one level, and the places one level on. */
  moves: {
    label: 'Where to go from here',
    back: (to: string) => `Back to ${to}`,
    start: 'the start',
    earth: 'the Earth',
    fire: 'the fire',
    turn: 'your turn',
    choosePlace: 'Choose a place',
    otherPlace: 'Choose another place',
    turnOn: 'Pick squares yourself',
    key: 'Esc',
  },
  story: {
    world: 'Start',
    jump: 'The jump',
    place: 'One place',
    fire: 'One fire',
    tested: 'Tested fires',
    live: 'Live',
    turn: 'Your turn',
  },
};

/** "Fire on Earth, 2000 to 2025", from the record's own first and last years; plain when they are not known. */
export function entryTitle(firstYear?: number | null, lastYear?: number | null) {
  if (firstYear != null && lastYear != null) return `Fire on Earth, ${firstYear} to ${lastYear}`;
  return 'Fire on Earth';
}
