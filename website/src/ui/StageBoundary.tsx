import { Component, type ReactNode } from 'react';

interface StageBoundaryState {
  failed: boolean;
}

/**
 * The 3D picture's own boundary: when the browser cannot draw it (WebGL off, or lost), one plain sentence stands in
 * its place and the rest of the page (the guide, the Record, the sheets) keeps working.
 */
export class StageBoundary extends Component<{ children: ReactNode }, StageBoundaryState> {
  state: StageBoundaryState = { failed: false };

  static getDerivedStateFromError(): StageBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('The 3D picture could not be drawn:', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="iso-stage-failed" role="note">
        <p>
          This browser could not draw the 3D picture of the ground (WebGL is off or failed), so the fire is not drawn
          here. The words, the Record and the sheets still work.
        </p>
      </div>
    );
  }
}
