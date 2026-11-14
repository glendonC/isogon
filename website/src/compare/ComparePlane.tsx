import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { PlaneEngine } from './planeEngine';
import type { MarkPalette } from './marks';
import type { CompareAnchor, CompareBlock, ComparePlaneProps, CompareScaleBar } from './types';
import './compare.css';

/**
 * Several terrain cut-outs on one isometric plane, drawn from the blocks it is given. It fills its parent, its
 * canvas is transparent, and it draws only when something changes. Labels and the selected mark are the design
 * system's; the page can draw its own labels at the anchors it is sent.
 */

/** The design system's data colours, read from the page so that the plane and the stage share them. */
function readPalette(el: HTMLElement): MarkPalette {
  const cs = getComputedStyle(el);
  const ink = cs.getPropertyValue('--sys-ink').trim() || cs.color;
  const role = (name: string) => cs.getPropertyValue(name).trim() || ink;
  return { modis: role('--sys-modis'), detection: role('--sys-detection'), estimate: role('--sys-estimate'), ink };
}

function DefaultLabel({ block, plate }: { block: CompareBlock; plate: boolean }) {
  const lines = block.label.lines ?? [];
  return (
    <div className={plate ? 'cmp-label__text sys-plate' : 'cmp-label__text'}>
      <div className="sys-label sys-strong">{block.label.title}</div>
      {lines.map((line, i) => (
        <div key={i} className={i < 2 ? 'sys-label' : 'sys-fine'}>
          {line}
        </div>
      ))}
    </div>
  );
}

export function ComparePlane({
  blocks,
  perRow,
  labelSpace = 88,
  onHover,
  onPick,
  onAnchors,
  renderLabel,
  labelPlate = false,
  scaleBar = true,
  ariaLabel,
  className,
}: ComparePlaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PlaneEngine | null>(null);
  const [anchors, setAnchors] = useState<CompareAnchor[]>([]);
  const [bar, setBar] = useState<CompareScaleBar | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // The latest callbacks, so the engine is made once
  const latest = useRef({ onHover, onPick, onAnchors });
  latest.current = { onHover, onPick, onAnchors };

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const engine = new PlaneEngine(canvas, readPalette(host), (next, nextBar) => {
      setAnchors(next);
      setBar(nextBar);
      latest.current.onAnchors?.(next);
    });
    engineRef.current = engine;
    const fit = () => engine.setSize(host.clientWidth, host.clientHeight, window.devicePixelRatio);
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    fit();
    return () => {
      observer.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setBlocks(blocks, { perRow, labelSpace });
  }, [blocks, perRow, labelSpace]);

  const hover = (id: string | null) => {
    if (id === hovered) return;
    setHovered(id);
    engineRef.current?.setHover(id);
    latest.current.onHover?.(id);
  };

  const under = (e: ReactPointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>): string | null => {
    const host = hostRef.current;
    const engine = engineRef.current;
    if (!host || !engine) return null;
    const r = host.getBoundingClientRect();
    return engine.pick(e.clientX - r.left, e.clientY - r.top);
  };

  const anchorOf = (id: string) => anchors.find((a) => a.id === id);

  return (
    <div
      ref={hostRef}
      className={className ? `cmp-plane ${className}` : 'cmp-plane'}
      role="group"
      aria-label={ariaLabel}
      data-pickable={onPick ? 'true' : undefined}
      data-hovering={hovered ? 'true' : undefined}
      onPointerMove={(e) => hover(under(e))}
      onPointerLeave={() => hover(null)}
      onClick={(e) => {
        const id = under(e);
        hover(id);
        if (id) latest.current.onPick?.(id);
      }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {scaleBar && bar && anchors.some((a) => a.ready) && (
        <>
          <svg className="cmp-scale" aria-hidden="true">
            <path
              d={[
                `M${bar.from.x} ${bar.from.y} L${bar.to.x} ${bar.to.y}`,
                ...bar.ticks.map(([a, b]) => `M${a.x} ${a.y} L${b.x} ${b.y}`),
              ].join(' ')}
            />
          </svg>
          <span className="cmp-scale__text sys-unit" style={{ left: Math.min(bar.from.x, bar.to.x), top: Math.max(bar.from.y, bar.to.y) }}>
            {bar.km} km
          </span>
        </>
      )}
      {blocks.map((block) => {
        const a = anchorOf(block.id);
        if (!a) return null;
        const state = block.state ?? 'idle';
        return (
          <div key={block.id} className="cmp-block" data-state={state} data-ready={a.ready ? 'true' : 'false'}>
            <button
              type="button"
              className={state === 'withheld' ? 'cmp-stop sys-sel sys-hidden' : 'cmp-stop sys-sel'}
              data-selected={state === 'selected' ? 'true' : 'false'}
              aria-pressed={state === 'selected'}
              aria-label={[block.label.title, ...(block.label.lines ?? [])].join('. ')}
              style={{ left: a.rect.left, top: a.rect.top, width: a.rect.width, height: a.rect.height }}
              onFocus={() => hover(block.id)}
              onBlur={() => hover(null)}
              onClick={(e) => {
                // A keyboard press arrives here; a pointer's click is taken by the plane itself
                e.stopPropagation();
                latest.current.onPick?.(block.id);
              }}
            />
            <div className="cmp-label" style={{ left: a.x, top: a.y }}>
              {renderLabel ? renderLabel(block, a, hovered === block.id) : <DefaultLabel block={block} plate={labelPlate} />}
            </div>
            {(block.pins ?? []).map((pin) => {
              const at = a.pins.find((p) => p.id === pin.id);
              return at && pin.text ? (
                <span key={pin.id} className="cmp-pin sys-plate sys-value" style={{ left: at.x, top: at.y }}>
                  {pin.text}
                </span>
              ) : null;
            })}
          </div>
        );
      })}
    </div>
  );
}
