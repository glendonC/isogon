import { lazy, Suspense, useRef } from 'react';
import { openingStart } from '../../app/places';
import { useWorkspace } from '../../app/store';
import { TheRecord } from './TheRecord';

const PlaceScreen = lazy(() =>
  import('./PlaceScreen').then((m) => ({ default: m.PlaceScreen })),
);

export interface CalendarBeatProps {
  /** The guide speaks on the Record: the Record leaves its own sentences and its closing action to it. */
  guideSpeaks?: boolean;
}

/**
 * The Record of a place and, over it, choosing a place. The month marked in the grid is the month of the fire the
 * stage holds or is opening; before any run it is the month of the fire the registry opens the place on. Leaving
 * the choice of a place without choosing returns to where it was opened from.
 */
export function CalendarBeat({ guideSpeaks = false }: CalendarBeatProps) {
  const ws = useWorkspace();
  const c = ws.calendar;
  // Whether the Record has been on screen since this step opened. The choice of a place opened from the Record goes
  // back to the Record; opened from the fire, with the Record never shown, it goes back to the fire.
  const recordSeen = useRef(false);
  if (!c.placesOpen) recordSeen.current = true;
  if (c.placesOpen) {
    const back = () => {
      c.closePlaces();
      if (!recordSeen.current && ws.run.active) ws.openModel();
    };
    return (
      <Suspense fallback={null}>
        <PlaceScreen places={ws.places} currentFire={ws.currentFire} onFire={c.chooseFire} onBox={c.chooseBox} onClose={back} />
      </Suspense>
    );
  }
  const opensOn = c.place.kind === 'region' ? openingStart(ws.places, c.place.regionId)?.slice(0, 7) ?? null : null;
  // Before the registry answers, and with no fire on the stage or picked, the month the page opens on is not known yet
  const markWaits = c.place.kind === 'region' && !c.selectedMonth && !c.stageMonth && opensOn === null && ws.places.places.length === 0;
  // A box's record is read from the route the registry names for any box (`box_calendar.route` of the registry's
  // answer, kept whole by the page's reader though its type does not name the field yet)
  const route = (ws.places.boxCalendar as { route?: unknown } | null)?.route;
  const place = c.place.kind === 'box' ? { ...c.place, route: typeof route === 'string' ? route : null } : c.place;
  return (
    <TheRecord
      place={place}
      markedMonth={c.selectedMonth ?? c.stageMonth ?? opensOn}
      canOpen={c.canOpen}
      onOpenMonth={c.openMonth}
      onClose={ws.run.active ? ws.openModel : null}
      guideSpeaks={guideSpeaks}
      markWaits={markWaits}
    />
  );
}
