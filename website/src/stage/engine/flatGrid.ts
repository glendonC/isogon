/**
 * A unit grid lying flat (x east, z south, y up), filled straight into typed arrays: the same vertices,
 * normals, coordinates and triangles as three.js's PlaneGeometry(1, 1, n, n) turned a quarter turn about
 * x, without its arrays of numbers and its matrix pass, which for the terrain's 1024 by 1024 vertices
 * cost a slow machine most of a second.
 */
export interface FlatGridArrays {
  position: Float32Array;
  normal: Float32Array;
  uv: Float32Array;
  index: Uint32Array;
}

export function flatGridArrays(segments: number): FlatGridArrays {
  const n = Math.max(1, Math.floor(segments));
  const row = n + 1;
  const count = row * row;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const step = 1 / n;
  for (let iy = 0; iy <= n; iy++) {
    const z = iy * step - 0.5;
    const v = 1 - iy / n;
    for (let ix = 0; ix <= n; ix++) {
      const k = iy * row + ix;
      position[k * 3] = ix * step - 0.5;
      position[k * 3 + 1] = 0;
      position[k * 3 + 2] = z;
      normal[k * 3 + 1] = 1;
      uv[k * 2] = ix / n;
      uv[k * 2 + 1] = v;
    }
  }
  const index = new Uint32Array(n * n * 6);
  let o = 0;
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const a = ix + row * iy;
      const b = ix + row * (iy + 1);
      const c = ix + 1 + row * (iy + 1);
      const d = ix + 1 + row * iy;
      index[o++] = a;
      index[o++] = b;
      index[o++] = d;
      index[o++] = b;
      index[o++] = c;
      index[o++] = d;
    }
  }
  return { position, normal, uv, index };
}
