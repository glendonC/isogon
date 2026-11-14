import { useEffect, useState } from 'react';
import type { NormalizedSensorDiagnostics } from '../stage/types';
import { plainText } from './plainText';

const API_BASE: string = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8788';

export type SensorModelSource = NormalizedSensorDiagnostics['source'];

export interface SensorModelPayload {
  raw: unknown;
  source: SensorModelSource;
  /** The run the computed gates describe (`benchmark_gates_run_id`), or null for the static file. */
  gatesRunId: string | null;
}

export type GateKind = 'computed' | 'design_target' | 'unknown';
export type GateStatus = 'passed' | 'failed' | 'not evaluated';

/** A benchmark gate (CONTRACT amendment after batch 2, terrain-assets T11). */
export interface Gate {
  id: string;
  title: string;
  kind: GateKind;
  status: GateStatus;
  /** What the gate requires, in plain words. */
  criterion: string;
  /** The computed result in plain words; empty for a design target. */
  metric: string;
}

function readStatus(raw: unknown): GateStatus {
  const s = String(raw ?? '').toUpperCase();
  if (s === 'PASSED' || s === 'PASS') return 'passed';
  if (s === 'FAILED' || s === 'FAIL') return 'failed';
  // Missing or NOT_EVALUATED: neither pass nor fail.
  return 'not evaluated';
}

/** "[0.90, 1.10]" to "0.90 to 1.10"; drops the "run <id>: " prefix the backend puts on run metrics. */
function tidy(text: string): string {
  return plainText(text)
    .replace(/^run [^:]+:\s*/i, '')
    .replace(/\[\s*([-\d.%]+)\s*,\s*([-\d.%]+)\s*\]/g, '$1 to $2')
    .trim();
}

export function readGates(raw: unknown): Gate[] {
  if (!raw || typeof raw !== 'object') return [];
  const list = (raw as Record<string, unknown>).benchmark_gates;
  if (!Array.isArray(list)) return [];
  return list
    .filter((g): g is Record<string, unknown> => Boolean(g) && typeof g === 'object')
    .map((g) => {
      const kind: GateKind = g.kind === 'computed' || g.kind === 'design_target' ? g.kind : 'unknown';
      return {
        id: String(g.gate_id ?? g.id ?? g.title ?? ''),
        title: tidy(String(g.title ?? '')).replace(/\s*\((modelled self-check)\)\s*$/i, ''),
        kind,
        // A gate without a kind is a typed-in literal from an older backend: never a result.
        status: kind === 'computed' ? readStatus(g.status) : 'not evaluated',
        criterion: tidy(String(g.criterion ?? '')),
        metric: kind === 'computed' ? tidy(String(g.metric ?? '')) : '',
      };
    });
}

export function findGate(gates: readonly Gate[], idPrefix: string): Gate | null {
  return gates.find((g) => g.id.startsWith(idPrefix)) ?? null;
}

/**
 * The sensor model for the run on screen: `/api/sensor-model?run_id=<run>`, so the run-level gates (G1, G5)
 * describe that run. Falls back to the generated file in the build, where those gates are not evaluated.
 */
export function useSensorModel(runId: string | null | undefined): SensorModelPayload | null {
  const [payload, setPayload] = useState<SensorModelPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = runId ? `?run_id=${encodeURIComponent(runId)}` : '';
    const endpoints: Array<{ url: string; source: SensorModelSource }> = [
      { url: `${API_BASE}/api/sensor-model${query}`, source: 'api' },
      { url: '/generated/fields/sensor_model_diagnostics.json', source: 'static_artifact' },
    ];
    void (async () => {
      for (const ep of endpoints) {
        try {
          const res = await fetch(ep.url, { signal: controller.signal });
          if (!res.ok) continue;
          const raw: unknown = await res.json();
          if (controller.signal.aborted) return;
          const id = (raw as Record<string, unknown> | null)?.benchmark_gates_run_id;
          setPayload({ raw, source: ep.source, gatesRunId: typeof id === 'string' ? id : null });
          return;
        } catch {
          // Try the next source.
        }
      }
    })();
    return () => controller.abort();
  }, [runId]);

  return payload;
}
