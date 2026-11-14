// Verified Fabio Crameri Scientific Colour Maps v8.0 (cmcrameri 256-entry RGB float derivations)
// Zero invented ramps. Fixed domain [0, 80] MW/km^2 across time and A/B observers.

export type SequentialColormapId = 'lipari' | 'batlow';
export type DivergingColormapId = 'roma';

export const LIPARI_32: readonly string[] = [
  '#031326', '#061D35', '#092844', '#0F3455', '#193F63', '#27496F', '#385277', '#48597A',
  '#545C7A', '#5E5D79', '#685E77', '#715F74', '#7C6071', '#86606F', '#91616C', '#9D6269',
  '#AB6365', '#B86462', '#C6665F', '#D46B5E', '#E07460', '#E77F64', '#EA8B6A', '#E99771',
  '#E7A178', '#E6AC81', '#E5B68B', '#E7C197', '#EACDA5', '#F0DBB7', '#F6E8C9', '#FDF5DA',
];

export const BATLOW_32: readonly string[] = [
  '#011959', '#08255B', '#0D315D', '#0F3C5F', '#114460', '#144C62', '#175362', '#1D5B62',
  '#246160', '#2D675D', '#386C58', '#447052', '#52744A', '#5F7843', '#6C7C3C', '#798035',
  '#8A842F', '#99882C', '#A98C2C', '#B98F32', '#CA923C', '#D89448', '#E49756', '#EF9B67',
  '#F7A179', '#FCA78E', '#FDADA0', '#FDB3B1', '#FDB9C2', '#FCBFD6', '#FBC6E8', '#FACCFA',
];

export const ROMA_32: readonly string[] = [
  '#7E1700', '#862C06', '#8F3C0C', '#974D13', '#9E5A19', '#A4671E', '#AA7324', '#B1822C',
  '#B89034', '#BF9F40', '#C6AE4F', '#CCBE62', '#D1CF7B', '#D2DC93', '#CFE5A8', '#C7E9BA',
  '#B9EAC9', '#A9E7D2', '#95E0D6', '#81D7D7', '#69C9D5', '#57BCD2', '#47AECD', '#3CA1C8',
  '#3394C3', '#2C85BD', '#2779B7', '#236CB2', '#1E5FAC', '#194FA5', '#11409F', '#033198',
];

export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RgbTuple {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function buildLut256(stops: readonly string[]): Uint8ClampedArray {
  const parsed = stops.map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);
  const maxIdx = parsed.length - 1;
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * maxIdx;
    const i0 = Math.floor(t);
    const i1 = Math.min(maxIdx, i0 + 1);
    const f = t - i0;
    const c0 = parsed[i0];
    const c1 = parsed[i1];
    lut[i * 3] = Math.round(c0.r + (c1.r - c0.r) * f);
    lut[i * 3 + 1] = Math.round(c0.g + (c1.g - c0.g) * f);
    lut[i * 3 + 2] = Math.round(c0.b + (c1.b - c0.b) * f);
  }
  return lut;
}

export const LUT_LIPARI_256 = buildLut256(LIPARI_32);
export const LUT_BATLOW_256 = buildLut256(BATLOW_32);
export const LUT_ROMA_256 = buildLut256(ROMA_32);

export function sampleSequentialCss(map: SequentialColormapId, norm: number): string {
  const lut = map === 'lipari' ? LUT_LIPARI_256 : LUT_BATLOW_256;
  const idx = Math.max(0, Math.min(255, Math.round(norm * 255))) * 3;
  return `rgb(${lut[idx]}, ${lut[idx + 1]}, ${lut[idx + 2]})`;
}

export function buildCssLinearGradient(stops: readonly string[], direction = 'to right'): string {
  return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

export const CRAMERI_NINE_STOPS = {
  lipari: ['#031326', '#183E61', '#525B7A', '#785F72', '#A56267', '#D86E5E', '#E99973', '#E7C398', '#FDF5DA'],
  batlow: ['#011959', '#114360', '#226061', '#4D734D', '#828231', '#BE9035', '#F19D6B', '#FDB4B4', '#FACCFA'],
  roma: ['#7E1700', '#9D5818', '#B68C32', '#D0CA72', '#C0EAC3', '#79D2D7', '#399DC7', '#226AB1', '#033198'],
} as const;
