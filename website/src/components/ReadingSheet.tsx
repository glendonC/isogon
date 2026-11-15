import { UnifiedDocumentViewer } from './EvidenceSheet';
import type { ViewerDocId } from './BlindScoreTable';
import type { MethodEvidence } from './MethodSheet';
import type { OverlapEvidence } from '../content/calendar';
import type { SensorModelPayload } from '../ui/useSensorModel';

export type ReadingSection = 'method' | 'sensors' | 'sources' | 'credits';

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

function docOfSection(section: ReadingSection): ViewerDocId {
  if (section === 'sensors') return 'sensors';
  if (section === 'sources' || section === 'credits') return 'sources';
  return 'method';
}

/**
 * Side-opening document viewer opened from Method and Data, Sensor geometry, Sources or the stage's imagery credit.
 */
export function ReadingSheet(props: ReadingSheetProps) {
  const { section, onSection, onClose } = props;
  if (!section) return null;

  return (
    <UnifiedDocumentViewer
      open
      initialDoc={docOfSection(section)}
      scrollCredits={section === 'credits'}
      onClose={onClose}
      onDocChange={(doc) => {
        if (doc === 'method' || doc === 'sensors' || doc === 'sources') {
          onSection(doc);
        }
      }}
      methodEvidence={props.evidence}
      imageryCredit={props.imageryCredit}
      verticalExaggeration={props.verticalExaggeration}
      apiBase={props.apiBase}
      regionId={props.regionId}
      regionName={props.regionName}
      sensorModel={props.sensorModel}
      overlap={props.overlap}
      overlapPlace={props.overlapPlace}
    />
  );
}
