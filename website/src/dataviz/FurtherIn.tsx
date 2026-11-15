import { useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A sheet's result first, its full table one step further in: the lead, then one word that opens the rest. With no
 * lead (the route did not give the figures) the full content shows at once.
 */
export function FurtherIn({ lead, more, children }: { lead: ReactNode | null; more: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!lead) return <>{children}</>;
  return (
    <>
      <div className="dv-sheet-lead">{lead}</div>
      <button type="button" className="dv-further" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? `Hide ${more}` : `Show ${more}`}
      </button>
      {open ? children : null}
    </>
  );
}
