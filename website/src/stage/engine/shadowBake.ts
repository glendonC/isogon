import * as THREE from 'three';

/**
 * One-time sun shadow bake for a heightfield.
 *
 * The sun is fixed per region (it is fitted to the shading already present in the imagery), so the
 * shadow of the terrain on itself never changes while a region is on screen. Instead of marching
 * the heightfield in every terrain fragment every frame, the march runs once into a small texture:
 * R = soft shadow factor (1 lit, 0 fully shadowed) with a distance-based penumbra.
 */
const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uDem;
uniform float uDemRes;
uniform vec2 uElevRange;
uniform float uReliefScale; // world units per metre of elevation
uniform vec2 uSlabSize;     // world size of the slab (east-west, north-south)
uniform vec3 uSunDir;      // stage world space, pointing toward the sun
uniform float uPenumbra;   // larger = sharper edge

varying vec2 vUv;

float demHeight(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0)) * (uDemRes - 1.0);
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(uDemRes - 1.0));
  float inv = 1.0 / uDemRes;
  float h00 = texture2D(uDem, (i0 + 0.5) * inv).r;
  float h10 = texture2D(uDem, (vec2(i1.x, i0.y) + 0.5) * inv).r;
  float h01 = texture2D(uDem, (vec2(i0.x, i1.y) + 0.5) * inv).r;
  float h11 = texture2D(uDem, (i1 + 0.5) * inv).r;
  float elev = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  float span = max(350.0, uElevRange.y - uElevRange.x);
  return clamp(elev - uElevRange.x, 0.0, span * 1.15) * uReliefScale;
}

// Elevation in metres, as the data holds it
float demElev(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.0), vec2(1.0)) * (uDemRes - 1.0);
  vec2 i0 = floor(c);
  vec2 f = c - i0;
  vec2 i1 = min(i0 + vec2(1.0), vec2(uDemRes - 1.0));
  float inv = 1.0 / uDemRes;
  float h00 = texture2D(uDem, (i0 + 0.5) * inv).r;
  float h10 = texture2D(uDem, (vec2(i1.x, i0.y) + 0.5) * inv).r;
  float h01 = texture2D(uDem, (vec2(i0.x, i1.y) + 0.5) * inv).r;
  float h11 = texture2D(uDem, (i1 + 0.5) * inv).r;
  return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
}

// Level ground: within most of a post in every direction the elevation changes by a few
// centimetres at most. The elevation sources in use level their lakes, and nothing else in
// them is that level, so this is where a lake is. 1 on level ground, 0 elsewhere.
float levelGround(vec2 uv) {
  float reach = 0.7 / (uDemRes - 1.0);
  float e0 = demElev(uv);
  float worst = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7853982;
    worst = max(worst, abs(demElev(uv + vec2(cos(a), sin(a)) * reach) - e0));
  }
  return 1.0 - smoothstep(0.05, 0.12, worst);
}

void main() {
  vec3 sun = normalize(uSunDir);
  float horiz = max(length(sun.xz), 1e-4);
  // uv step and height gain per world unit travelled horizontally toward the sun
  vec2 uvPerUnit = vec2(sun.x / uSlabSize.x, -sun.z / uSlabSize.y) / horiz;
  float risePerUnit = sun.y / horiz;

  float y0 = demHeight(vUv) + 0.004;
  float maxRelief = max(350.0, uElevRange.y - uElevRange.x) * 1.15 * uReliefScale;
  // The ray is clear of all terrain once it is above the highest possible relief
  float tMax = min(22.0, (maxRelief - y0) / max(risePerUnit, 1e-3));

  float lit = 1.0;
  const int STEPS = 112;
  for (int i = 1; i <= STEPS; i++) {
    float s = float(i) / float(STEPS);
    float t = tMax * s * (0.35 + 0.65 * s);
    vec2 uv = vUv + uvPerUnit * t;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float clearance = (y0 + risePerUnit * t) - demHeight(uv);
    lit = min(lit, uPenumbra * clearance / max(t, 0.02) + 0.5);
    if (lit <= 0.0) break;
  }
  lit = smoothstep(0.0, 1.0, clamp(lit, 0.0, 1.0));
  gl_FragColor = vec4(lit, levelGround(vUv), lit, 1.0);
}
`;

export class SunShadowBaker {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly quad: THREE.Mesh;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.material = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      uniforms: {
        uDem: { value: null },
        uDemRes: { value: 512 },
        uElevRange: { value: new THREE.Vector2(0, 1000) },
        uReliefScale: { value: 0.001 },
        uSlabSize: { value: new THREE.Vector2(14.8, 10.8) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uPenumbra: { value: 9.0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /**
   * Renders one heightfield's sun shadow factor (red) and its level ground (green: 1 where the
   * elevation is level, which is a lake) into a new texture and returns its target.
   */
  public bake(
    demTexture: THREE.Texture,
    demGridRes: number,
    minElevM: number,
    maxElevM: number,
    reliefScale: number,
    slabWidth: number,
    slabDepth: number,
    sunDirStage: THREE.Vector3,
    size = 1024,
  ): THREE.WebGLRenderTarget {
    const target = new THREE.WebGLRenderTarget(size, size, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    target.texture.wrapS = THREE.ClampToEdgeWrapping;
    target.texture.wrapT = THREE.ClampToEdgeWrapping;
    target.texture.colorSpace = THREE.NoColorSpace;

    const u = this.material.uniforms;
    u.uDem.value = demTexture;
    u.uDemRes.value = demGridRes;
    (u.uElevRange.value as THREE.Vector2).set(minElevM, maxElevM);
    u.uReliefScale.value = reliefScale;
    (u.uSlabSize.value as THREE.Vector2).set(slabWidth, slabDepth);
    (u.uSunDir.value as THREE.Vector3).copy(sunDirStage);

    const prevTarget = this.renderer.getRenderTarget();
    const prevAutoClear = this.renderer.autoClear;
    this.renderer.autoClear = true;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(prevTarget);
    this.renderer.autoClear = prevAutoClear;
    return target;
  }

  public dispose(): void {
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
