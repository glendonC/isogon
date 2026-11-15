import type { ReactNode } from 'react';
import type { BlindTest, ModelStatus } from '../content/realRuns';
import { plainBackendText } from './BlindScoreTable';
import { UnifiedDocumentViewer } from './EvidenceSheet';

/** Readable note helper preserved for compatibility. */
export function plainNote(note: string): string {
  return plainBackendText(note);
}

interface DebriefProps {
  score: BlindTest;
  model: ModelStatus | null;
  place: string;
  onBack: () => void;
  /** The next step (a round of Play), when this place has one. */
  onNext: (() => void) | null;
  onEvidence: () => void;
  /** Terra's morning pass check, when there is one. */
  terra: ReactNode | null;
  terraOpen: boolean;
  onToggleTerra: () => void;
}

/**
 * Side-opening document viewer focused on "The Scores" after revealing the hidden satellite.
 */
export function Debrief({
  score,
  model,
  place,
  onBack,
  onNext,
  terra,
  terraOpen,
  onToggleTerra,
}: DebriefProps) {
  return (
    <UnifiedDocumentViewer
      open
      initialDoc="scores"
      onClose={onBack}
      score={score}
      model={model}
      place={place}
      onNext={onNext}
      terra={terra}
      terraOpen={terraOpen}
      onToggleTerra={onToggleTerra}
    />
  );
}
