/**
 * Whether nothing of a pass is drawn: no footprint, no scan cell, no spacecraft.
 *
 * A pass is hidden when the run says so (a real run with a satellite held out marks its hidden
 * passes), or when the page has VIIRS switched off and the pass is a VIIRS one. A pass the page laid
 * on after a look or a reveal is never hidden: its detections were handed to the page to be shown,
 * and a round keeps VIIRS switched off while its looks come in.
 */
export interface PassShownFlags {
  family: string;
  /** The run marks the pass as kept from the model. */
  hidden?: boolean;
  /** The page laid the pass on after scoring or after a look. */
  revealed?: boolean;
}

export function passIsHidden(pass: PassShownFlags, holdoutViirs: boolean): boolean {
  if (pass.revealed) return false;
  return pass.hidden === true || (holdoutViirs && pass.family === 'viirs');
}
