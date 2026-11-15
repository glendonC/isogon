import { Component, type ReactNode } from 'react';
import { isStageWebGLError } from '../stage/stageErrors';

type Failure = 'unavailable' | 'failed' | 'other';

interface StageBoundaryState {
  failed: Failure | null;
}

const KEEPS = 'The words, the Record and the sheets still work.';

/** One plain sentence for each way the picture can fail: by the stage's named error, else any other. */
const SAID: Record<Failure, string> = {
  unavailable: `This browser has no WebGL2, so the 3D picture of the ground is not drawn here. ${KEEPS}`,
  failed: `This browser has WebGL2, but the 3D picture of the ground could not start, so it is not drawn here. ${KEEPS}`,
  other: `The 3D picture of the ground stopped on an error, so it is not drawn here. ${KEEPS}`,
};

/**
 * The 3D picture's own boundary: when the browser cannot draw it, one plain sentence stands in its place, naming why
 * (the stage's named WebGL error, `stage/stageErrors.ts`), and the rest of the page (the guide, the Record, the sheets)
 * keeps working.
 */
export class StageBoundary extends Component<{ children: ReactNode }, StageBoundaryState> {
  state: StageBoundaryState = { failed: null };

  static getDerivedStateFromError(error: unknown): StageBoundaryState {
    return { failed: isStageWebGLError(error) ? error.reason : 'other' };
  }

  componentDidCatch(error: unknown) {
    console.warn('The 3D picture could not be drawn:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="iso-stage-failed" role="note">
        <p>{SAID[this.state.failed]}</p>
      </div>
    );
  }
}
