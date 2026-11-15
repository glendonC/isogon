/**
 * The median brightness (linear luminance, 0 to 1) of RGBA pixels: how dark a picture of the ground is,
 * for the night's lift (the night grade keeps dark ground as it is and caps bright ground, so a
 * picture that is mostly dark ground draws darker by night than its mean says).
 */
export function medianLumaOf(rgba: Uint8ClampedArray | Uint8Array): number {
  const n = Math.floor(rgba.length / 4);
  if (n === 0) return 0;
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) lum[i] = 0.2126 * lin(rgba[i * 4]) + 0.7152 * lin(rgba[i * 4 + 1]) + 0.0722 * lin(rgba[i * 4 + 2]);
  lum.sort();
  return lum[Math.floor(n / 2)];
}
