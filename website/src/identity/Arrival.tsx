import './identity.css';

export interface ArrivalProps {
  /** The place being arrived at, by its name. */
  name: string;
  /** Where it is, "40.05 N  121.18 W". */
  coord?: string | null;
  /** The place's own ground is drawn: the veil lifts and the name goes. */
  landed: boolean;
}

/**
 * The arrival at a place: until the place's own ground is drawn, a veil holds the screen with the place's name and
 * where it is, so the old place's ground never stands under the new place's name; once it is drawn the veil lifts and
 * the name goes with it.
 */
export function Arrival({ name, coord, landed }: ArrivalProps) {
  return (
    <div className="id-arrival" data-landed={landed ? 'true' : 'false'} role="status" aria-live="polite">
      <div className="id-arrival__veil" aria-hidden="true" />
      <div className="id-arrival__say">
        <p className="id-arrival__name">{name}</p>
        {coord && <p className="id-arrival__coord">{coord}</p>}
      </div>
    </div>
  );
}
