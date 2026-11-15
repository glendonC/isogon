import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  type Pass,
} from 'postprocessing';

/**
 * Scene-referred HDR conventions for the stage.
 *
 * Every stage material writes scene-linear radiance with no tone curve and no sRGB encode. The unit
 * is the reference light of the terrain: under light 1.0 the imagery shows its own colors (the
 * terrain shader passes it through the inverse of the tone curve below). Lit ground is held under
 * a ceiling of 1.5, and only the white-hot core of a flaming front is above the bloom threshold.
 *
 * ACES Filmic tone mapping and the sRGB encode happen exactly once, in the last pass of the composer.
 */
export interface HdrPipelineOptions {
  /** Linear exposure multiplier applied before the ACES curve. */
  exposure?: number;
  /** Scene-linear luminance where bloom starts. Kept above 1.0 so lit surfaces never bloom. */
  bloomThreshold?: number;
  /** Width of the soft knee above the threshold. */
  bloomSmoothing?: number;
  bloomIntensity?: number;
  /** Mipmap blur radius, 0..1. */
  bloomRadius?: number;
  /** Number of mip levels in the bloom pyramid. */
  bloomLevels?: number;
  /** MSAA samples for the HDR scene buffer (clamped to what the context supports). */
  msaaSamples?: number;
}

export const HDR_DEFAULTS: Required<HdrPipelineOptions> = {
  exposure: 1.0,
  bloomThreshold: 1.7,
  bloomSmoothing: 0.3,
  bloomIntensity: 0.85,
  bloomRadius: 0.7,
  bloomLevels: 7,
  msaaSamples: 4,
};

export const MAX_STAGE_PIXEL_RATIO = 2;
export const MIN_STAGE_PIXEL_RATIO = 0.5;

export function resolveStagePixelRatio(): number {
  const raw = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(MAX_STAGE_PIXEL_RATIO, Math.max(1, raw));
}

export class HdrPipeline {
  public readonly composer: EffectComposer;
  public readonly renderPass: RenderPass;
  public readonly bloom: BloomEffect;
  public readonly toneMapping: ToneMappingEffect;
  public readonly finalPass: EffectPass;

  private readonly renderer: THREE.WebGLRenderer;
  private cssWidth = 1;
  private cssHeight = 1;
  private pixelRatio = 1;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    options: HdrPipelineOptions = {},
  ) {
    const opts = { ...HDR_DEFAULTS, ...options };
    this.renderer = renderer;

    // The composer owns tone mapping and output encoding. The renderer must not apply either to
    // materials drawn into the HDR buffer.
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = opts.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: opts.msaaSamples,
      depthBuffer: true,
      stencilBuffer: false,
    });

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,
      luminanceThreshold: opts.bloomThreshold,
      luminanceSmoothing: opts.bloomSmoothing,
      intensity: opts.bloomIntensity,
      radius: opts.bloomRadius,
      levels: opts.bloomLevels,
    });

    this.toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });

    // Bloom is added in scene-linear space, then the one and only tone curve and sRGB encode run.
    this.finalPass = new EffectPass(camera, this.bloom, this.toneMapping);
    // Half a code value of noise on the encoded output, so slow gradients (sky, haze, the floor)
    // do not step in an 8 bit frame. It is added last, at display precision, for every pixel.
    this.finalPass.dithering = true;
    this.composer.addPass(this.finalPass);
  }

  /** Inserts a pass after the scene render and before bloom and tone mapping. */
  public insertScenePass(pass: Pass): void {
    const finalIndex = this.composer.passes.indexOf(this.finalPass);
    this.composer.addPass(pass, finalIndex >= 0 ? finalIndex : undefined);
  }

  public get exposure(): number {
    return this.renderer.toneMappingExposure;
  }

  public set exposure(value: number) {
    this.renderer.toneMappingExposure = Math.max(0.01, value);
  }

  /** Drawing buffer height in device pixels. */
  public get drawingBufferHeight(): number {
    return Math.max(1, Math.round(this.cssHeight * this.pixelRatio));
  }

  /**
   * Resizes the canvas drawing buffer and every HDR buffer. Call when the host element or the
   * device pixel ratio changes. Returns true when something actually changed.
   */
  public setSize(cssWidth: number, cssHeight: number, pixelRatio: number): boolean {
    const w = Math.max(1, Math.floor(cssWidth));
    const h = Math.max(1, Math.floor(cssHeight));
    // (below 1 only when the stage draws at a smaller render scale on a slow machine)
    const pr = Math.min(MAX_STAGE_PIXEL_RATIO, Math.max(MIN_STAGE_PIXEL_RATIO, pixelRatio));
    if (w === this.cssWidth && h === this.cssHeight && Math.abs(pr - this.pixelRatio) < 1e-3) {
      return false;
    }
    this.cssWidth = w;
    this.cssHeight = h;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.composer.setSize(w, h, false);
    return true;
  }

  public render(deltaSeconds: number): void {
    this.composer.render(deltaSeconds);
  }

  public dispose(): void {
    this.composer.dispose();
  }
}
