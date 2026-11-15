import { useSyncExternalStore } from 'react';
import { isSoundOn, setSound, subscribeSound } from './engine.ts';
import './sound.css';

export interface SoundControlProps {
  className?: string;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * One visible control to turn atmosphere sound on or off.
 * Off until clicked; the visitor's choice is remembered across visits.
 */
export function SoundControl({ className }: SoundControlProps) {
  const on = useSyncExternalStore(subscribeSound, isSoundOn, getServerSnapshot);

  return (
    <button
      type="button"
      className={className ? `iso-sound-ctl ${className}` : 'iso-sound-ctl'}
      data-on={on ? 'true' : 'false'}
      aria-pressed={on}
      onClick={() => setSound(!on)}
    >
      <span className="iso-sound-ctl__mark" aria-hidden="true" />
      <span>{on ? 'Sound on' : 'Sound off'}</span>
    </button>
  );
}
