/**
 * The test across the world as the evidence route serves it (`GET /api/evidence`, `fresh_test`): its protocol, and
 * for each look taken (test A with the values in use, test B with the values the decision chose) every fire's own
 * count of scores ahead of both simple methods, and per continent, per zone and over all how many scores were ahead,
 * tied and behind, judged with an interval. Beside it, the three fires of 2021 kept as the test, as recorded. Read as
 * served; nothing is computed here but positions from a fire's name and counts of fires.
 */

export interface FreshFire {
  key: string;
  continent: string | null;
  zone: string | null;
  year: string | null;
  /** The fire's tile, west, south, east, north; from the answer, or from its name on the protocol's grid. */
  box: [number, number, number, number] | null;
  ahead: number;
  judged: number;
  looks: number | null;
}

export interface Classes {
  ahead: number;
  tied: number;
  behind: number;
}

export interface Group {
  name: string;
  fires: number | null;
  classes: Classes | null;
  /** How often the estimate's stated interval held over the group's looks. */
  interval: { stated: number; held: number; looks: number } | null;
}

export interface FreshLook {
  id: 'test_a' | 'test_b';
  name: string | null;
  values: string | null;
  scored: number | null;
  inPlan: number | null;
  notScored: number;
  all: Group | null;
  byContinent: Group[];
  byZone: Group[];
  fires: FreshFire[];
}

export interface Kept {
  name: string;
  ahead: number;
  judged: number;
}

export interface FreshAnswer {
  state: string | null;
  protocolSha: string | null;
  looks: FreshLook[];
  kept: Kept[];
  example: string | null;
}

/**
 * The protocol's grid (fresh_world_v1: places of 2.5 degrees from 180 W and 90 S, cut into 5 by 5 tiles), used only
 * when the answer gives a fire's name and not its tile. A served `place_deg` and `tiles_per_side` take its place.
 */
export const FRESH_GRID = { placeDeg: 2.5, tilesPerSide: 5 };

type Obj = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** "p-122.5+37.5:2020:23": the place's south-west corner, the year, the tile's column and row from the south-west. */
export function tileOfKey(key: string, grid = FRESH_GRID): { box: [number, number, number, number]; year: string } | null {
  const m = /^p([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?):(\d{4}):(\d)(\d)$/.exec(key);
  if (!m) return null;
  const w = Number(m[1]);
  const s = Number(m[2]);
  const d = grid.placeDeg / grid.tilesPerSide;
  const i = Number(m[4]);
  const j = Number(m[5]);
  return { box: [w + i * d, s + j * d, w + (i + 1) * d, s + (j + 1) * d], year: m[3] };
}

function counts(c: Obj | null): Classes | null {
  if (!c) return null;
  const a = num(c.ahead);
  const t = num(c.tied ?? c.tie);
  const b = num(c.behind);
  return a !== null && t !== null && b !== null ? { ahead: a, tied: t, behind: b } : null;
}

/** A group's scores ahead, tied and behind: counted where the answer gives them (M30 puts them on the group, its
 * `classes` naming each score's class), or counted from `classes` when that holds the class of each score. */
function classesOf(g: Obj): Classes | null {
  const own = counts(g);
  if (own) return own;
  const c = (g.classes ?? null) as Obj | null;
  const given = counts(c);
  if (given) return given;
  if (!c) return null;
  const words = Object.values(c).filter((w): w is string => typeof w === 'string');
  if (!words.length) return null;
  return {
    ahead: words.filter((w) => w === 'ahead').length,
    tied: words.filter((w) => w === 'tie' || w === 'tied').length,
    behind: words.filter((w) => w === 'behind').length,
  };
}

function group(name: string, v: unknown): Group {
  const g = (v ?? {}) as Obj;
  const i = (g.interval ?? null) as Obj | null;
  const stated = num(i?.stated_level);
  const held = num(i?.held);
  const looks = num(i?.looks);
  return {
    name,
    fires: num(g.episodes),
    classes: classesOf(g),
    interval: stated !== null && held !== null && looks !== null ? { stated, held, looks } : null,
  };
}

function look(id: 'test_a' | 'test_b', v: unknown, names: Obj, grid: typeof FRESH_GRID): FreshLook | null {
  const o = (v ?? null) as Obj | null;
  if (!o) return null;
  const fires = arr(o.per_fire).flatMap((f): FreshFire[] => {
    const x = f as Obj;
    const key = str(x.key);
    const ahead = num(x.ahead_of_both_on);
    const judged = num(x.scores_judged);
    if (!key || ahead === null || judged === null) return [];
    const b = arr(x.box).map(num);
    const t = tileOfKey(key, grid);
    return [
      {
        key,
        continent: str(x.continent),
        zone: str(x.zone),
        year: t?.year ?? null,
        box: b.length === 4 && b.every((n) => n !== null) ? (b as [number, number, number, number]) : t?.box ?? null,
        ahead,
        judged,
        looks: num(x.scored_looks),
      },
    ];
  });
  const by = (m: unknown) => Object.entries((m ?? {}) as Obj).map(([k, g]) => group(k, g));
  return {
    id,
    name: str(o.look_name) ?? str(names[id]),
    values: str(o.values),
    scored: num(o.episodes_scored),
    inPlan: num(o.episodes_in_plan),
    notScored: num(o.not_scored) ?? 0,
    all: o.all ? group('all', o.all) : null,
    byContinent: by(o.by_continent),
    byZone: by(o.by_zone),
    fires,
  };
}

export function parseFresh(body: unknown): FreshAnswer {
  const o = (body ?? {}) as Obj;
  const f = (o.fresh_test ?? {}) as Obj;
  const names = (f.look_names ?? {}) as Obj;
  const grid = { placeDeg: num(f.place_deg) ?? FRESH_GRID.placeDeg, tilesPerSide: num(f.tiles_per_side) ?? FRESH_GRID.tilesPerSide };
  const looks = (['test_a', 'test_b'] as const).flatMap((id) => {
    const l = look(id, f[id], names, grid);
    return l ? [l] : [];
  });
  const tf = (o.test_fires ?? {}) as Obj;
  const kept = arr(tf.fires).flatMap((x): Kept[] => {
    const r = x as Obj;
    const n = (r.new ?? r) as Obj;
    const name = str(r.name);
    const a = num(n.ahead_of_both_on);
    const j = num(n.scores_judged);
    return name && a !== null && j !== null ? [{ name, ahead: a, judged: j }] : [];
  });
  return { state: str(f.state), protocolSha: str(f.protocol_sha256), looks, kept, example: str(o.example ?? f.example) };
}
