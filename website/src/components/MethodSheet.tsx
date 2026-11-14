import React from 'react';

interface MethodSheetProps {
  onClose: () => void;
}

const BENCHMARK_LADDER = [
  { tier: 'T1', name: 'Equal-Area Bowtie-Deduplicated & CMR Exposure-Normalized Transfer (2012-2021)', status: 'Guaranteed Core' },
  { tier: 'T2', name: 'Clean-Room Scan-Angle Operator & Tapered-Pareto Tail Inversion (Sofiev & Kouznetsov 2026)', status: 'Physics Operator' },
  { tier: 'B4', name: 'MYD14 / VNP14IMG VZA Correction & Fusion Baseline (Zheng et al. 2026)', status: '2012+ Overlap Check' },
  { tier: 'B5', name: 'GFED5 / GFED5NRT Regional Monthly Coherence Check (Chen et al. 2026)', status: 'Macro Reference' },
  { tier: 'T3', name: 'Sensor-Conditioned Spatiotemporal Hurdle Field + Conformal Calibration', status: 'Experimental Hypothesis' },
] as const;

export const MethodSheet: React.FC<MethodSheetProps> = ({ onClose }) => {
  return (
    <div
      className="iso-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Scientific Method and Pre-Event Gate"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="iso-drawer" style={{ gridTemplateRows: '48px minmax(0, 1fr) 36px' }}>
        <div className="iso-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14.5, letterSpacing: '-0.015em' }}>
              Method · Observation Operator & Benchmark Gate
            </span>
            <span className="iso-domain-pill" style={{ height: 22, fontSize: 10.5 }}>
              Pre-Event Research Specification
            </span>
          </div>
          <button
            type="button"
            className="iso-outline-cta"
            style={{ height: 28, padding: '0 12px', fontSize: 12 }}
            onClick={onClose}
          >
            Close Sheet
          </button>
        </div>

        <div className="iso-drawer-body" style={{ justifyContent: 'flex-start', gap: 12 }}>
          <div
            style={{
              border: '1px solid var(--iso-border-subtle)',
              background: 'var(--iso-bg-page)',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ fontFamily: 'var(--iso-font-mono)', fontSize: 10.5, color: 'var(--iso-ink-muted)' }}>
              FORWARD OBSERVATION MODEL
            </div>
            <div style={{ fontFamily: 'var(--iso-font-mono)', fontSize: 13, fontWeight: 500 }}>
              y_(s,i) ~ p_s( y | H_s(x_(r,t), a_(s,i)), sigma_(s,i) )
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--iso-ink-secondary)' }}>
              At region r and time t, x_(r,t) is a reference-grid latent fire-activity field. H_s encodes sensor footprint growth, scan/track geometry, overpass timing, and cloud obstruction for instrument s (MODIS 1 km vs VIIRS 375 m).
            </div>
          </div>

          <div style={{ border: '1px solid var(--iso-border-subtle)' }}>
            <div
              style={{
                padding: '7px 12px',
                borderBottom: '1px solid var(--iso-border-subtle)',
                background: 'var(--iso-bg-subtle)',
                fontFamily: 'var(--iso-font-mono)',
                fontSize: 10.5,
                color: 'var(--iso-ink-secondary)',
              }}
            >
              ORDERED FALSIFICATION LADDER (EVALUATED ON BLOCKED HELD-OUT OVERPASSES)
            </div>
            {BENCHMARK_LADDER.map((row, idx) => (
              <div
                key={row.tier}
                style={{
                  padding: '6px 12px',
                  borderBottom: idx < BENCHMARK_LADDER.length - 1 ? '1px solid var(--iso-border-subtle)' : 'none',
                  display: 'grid',
                  gridTemplateColumns: '36px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  fontSize: 12,
                }}
              >
                <span style={{ fontFamily: 'var(--iso-font-mono)', fontWeight: 500 }}>{row.tier}</span>
                <span>{row.name}</span>
                <span
                  style={{
                    fontFamily: 'var(--iso-font-mono)',
                    fontSize: 10.5,
                    color: row.tier === 'T3' ? '#9A4E1C' : 'var(--iso-ink-muted)',
                  }}
                >
                  {row.status}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              border: '1px solid #161616',
              background: '#FAF9F6',
              padding: '10px 14px',
              fontSize: 12,
              color: 'var(--iso-ink-primary)',
              lineHeight: 1.42,
            }}
          >
            <strong>NASA Space Apps Pre-Event Compliance (Nov 12, 2026):</strong> Full interactive workspace implementation, NASA FIRMS / Earthdata ingestion, and burning-activity calendar computation begin strictly at official event start (November 14, 2026, 09:00 local time). Zero NASA observation payloads are bundled in this visual identity study.
          </div>
        </div>

        <div className="iso-drawer-footer">
          <span>Challenge: Harmonization of MODIS and VIIRS Hot Spots</span>
          <span>Absence Of Hotspot != Proof Of Zero Fire</span>
        </div>
      </aside>
    </div>
  );
};
