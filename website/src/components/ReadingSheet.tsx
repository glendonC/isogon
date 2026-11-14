import { useEffect, useRef } from 'react';
import { useDialogFocus } from '../ui/useDialogFocus';
import { MethodSheet, type MethodEvidence } from './MethodSheet';
import { Credits, SourcesSheet } from './SourcesSheet';
import { SensorDiagnosticModal } from '../stage/SensorDiagnosticModal';
import type { OverlapEvidence } from '../content/calendar';
import type { SensorModelPayload } from '../ui/useSensorModel';

export type ReadingSection = 'method' | 'sensors' | 'sources' | 'credits';

const SECTIONS: ReadonlyArray<{ id: ReadingSection; label: string }> = [
  { id: 'method', label: 'Method' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'sources', label: 'Sources' },
  { id: 'credits', label: 'Credits' },
];

interface ReadingSheetProps {
  section: ReadingSection | null;
  onSection: (s: ReadingSection) => void;
  onClose: () => void;
  evidence: MethodEvidence;
  imageryCredit: string;
  verticalExaggeration: number | null;
  apiBase: string;
  regionId: string;
  regionName: string;
  sensorModel: SensorModelPayload | null;
  overlap: OverlapEvidence | null;
  overlapPlace: string | null;
}

/**
 * The one place to read about the product: method, sensor physics, data and sources, credits. Opened from the top
 * bar's single reading entry, and from the imagery credit on the stage.
 */
export function ReadingSheet(props: ReadingSheetProps) {
  const { section, onSection, onClose } = props;
  const open = section !== null;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useDialogFocus(open, sheetRef, closeRef);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!section) return null;

  return (
    <div className="iso-backdrop iso-backdrop--center" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="iso-sheet iso-reading"
        data-section={section}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Method, sensors, sources and credits"
      >
        <div className="iso-sheet__head">
          <nav className="iso-reading__nav" aria-label="Sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="iso-sel iso-reading__tab"
                data-active={section === s.id ? 'true' : 'false'}
                aria-current={section === s.id ? 'page' : undefined}
                onClick={() => onSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <button ref={closeRef} type="button" className="iso-key" onClick={onClose}>
            <kbd>Esc</kbd>
            <span>Close</span>
          </button>
        </div>

        {section === 'method' && (
          <MethodSheet
            open
            embedded
            onClose={onClose}
            evidence={props.evidence}
            imageryCredit={props.imageryCredit}
            verticalExaggeration={props.verticalExaggeration}
          />
        )}
        {section === 'sensors' && (
          <SensorDiagnosticModal open embedded onClose={onClose} model={props.sensorModel} overlap={props.overlap} overlapPlace={props.overlapPlace} />
        )}
        {section === 'sources' && (
          <SourcesSheet
            open
            embedded
            onClose={onClose}
            apiBase={props.apiBase}
            regionId={props.regionId}
            regionName={props.regionName}
            imageryCredit={props.imageryCredit}
          />
        )}
        {section === 'credits' && (
          <div className="iso-sources">
            <Credits imageryCredit={props.imageryCredit} />
          </div>
        )}
      </div>
    </div>
  );
}
