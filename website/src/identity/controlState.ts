/**
 * The page's one control, as data: the class it carries in each state, the attributes a reader needs, and the sound
 * it asks for. The component in Control.tsx only renders what these return, so the states are tested here.
 *
 * States: rest, hover, keyboard focus and pressed come from the pointer and the keyboard (CSS); selected and disabled
 * are props. A disabled control says why, in words, to every reader.
 */

export type ControlVariant = 'primary' | 'secondary';
export type ControlIcon = 'arrow' | 'play' | 'pause' | 'download' | 'none';
export type ControlSound = 'hover' | 'press';

/** The one class every control carries, so an existing button is swapped by adding it. */
export const CONTROL_CLASS = 'id-control';

export interface ControlState {
  variant?: ControlVariant;
  selected?: boolean;
  disabled?: boolean;
  /** Why the control cannot be used now. Required in practice when disabled; shown on hover and read aloud. */
  reason?: string | null;
}

export function controlClass({ variant = 'secondary', selected = false, disabled = false }: ControlState, extra?: string) {
  const parts = [CONTROL_CLASS, `${CONTROL_CLASS}--${variant}`];
  if (selected) parts.push(`${CONTROL_CLASS}--selected`);
  if (disabled) parts.push(`${CONTROL_CLASS}--disabled`);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

export function controlAria({ selected, disabled, reason }: ControlState) {
  const aria: Record<string, string | boolean | undefined> = {};
  if (selected !== undefined) aria['aria-pressed'] = selected;
  if (disabled) {
    aria['aria-disabled'] = true;
    if (reason) aria.title = reason;
  }
  return aria;
}

/** The glyph the badge carries on hover. Every control leads on with an arrow unless its action has its own glyph. */
export function badgeGlyph(icon: ControlIcon | undefined): Exclude<ControlIcon, 'none'> {
  return icon && icon !== 'none' ? icon : 'arrow';
}

type SoundHook = (sound: ControlSound) => void;
let soundHook: SoundHook = () => {};

/**
 * The control's two sounds go through one hook so the sound engine is wired in one line where the page starts:
 * setControlSound((s) => { if (s === 'press') playCue('step'); }). Until then the hook is silent.
 */
export function setControlSound(hook: SoundHook | null) {
  soundHook = hook ?? (() => {});
}

export function controlSound(sound: ControlSound, state: ControlState = {}) {
  if (state.disabled) return;
  soundHook(sound);
}
