import { useEffect, type ReactNode } from 'react';
import { useWorldKeys } from '../world/keys';
import { WORDS } from './words.ts';
import './identity.css';

export interface SideMenuItem {
  id: string;
  label: string;
}

export interface SideMenuProps {
  open: boolean;
  onClose: () => void;
  /** The documents, by name, in the order the reading view lists them. */
  items: SideMenuItem[];
  onPick: (id: string) => void;
  /** Under the list: the sound control. */
  footer?: ReactNode;
}

/**
 * The page's one menu: from the word at the top right a panel slides in from the right with the documents as a list of
 * plain words and the sound under them; the screen stays in view at the left. Choosing a document opens the reading
 * view with the same list in the same place, the document beside it. Escape, Close or a click on the screen closes it.
 */
export function SideMenu({ open, onClose, items, onPick, footer }: SideMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);
  // Over a picture of the world its keys come first: the menu takes Escape before the picture does.
  useWorldKeys(
    (e) => {
      if (e.key !== 'Escape') return false;
      onClose();
      return true;
    },
    'screen',
    open,
  );
  if (!open) return null;
  return (
    <div className="id-menu" role="presentation">
      <button type="button" className="id-menu__scrim" aria-label={WORDS.menu.close} tabIndex={-1} onClick={onClose} />
      <nav className="id-menu__panel" aria-label={WORDS.menu.label}>
        <button type="button" className="id-menu__close" onClick={onClose} autoFocus>
          {WORDS.menu.close}
        </button>
        <div className="id-menu__list">
          {items.map((it) => (
            <button key={it.id} type="button" className="id-menu__item" onClick={() => onPick(it.id)}>
              {it.label}
            </button>
          ))}
        </div>
        {footer && <div className="id-menu__foot">{footer}</div>}
      </nav>
    </div>
  );
}
