import { openingStart } from '../../app/places';
import { useWorkspace } from '../../app/store';
import { PlaceScreen } from './PlaceScreen';
import { TheRecord } from './TheRecord';

export interface CalendarBeatProps {
  /** The guide speaks on the Record: the Record leaves its own sentences and its closing action to it. */
  guideSpeaks?: boolean;
}

/**
 * The Record of a place and, over it, choosing a place. The month marked in the grid is the month of the fire the
 * stage holds or is opening; before any run it is the month of the fire the registry opens the place on.
 */
export function CalendarBeat({ guideSpeaks = false }: CalendarBeatProps) {
  const ws = useWorkspace();
  const c = ws.calendar;
  if (c.placesOpen) {
    return <PlaceScreen places={ws.places} currentFire={ws.currentFire} onFire={c.chooseFire} onBox={c.chooseBox} onClose={c.closePlaces} />;
  }
  const opensOn = c.place.kind === 'region' ? openingStart(ws.places, c.place.regionId)?.slice(0, 7) ?? null : null;
  return (
    <TheRecord
      place={c.place}
      markedMonth={c.selectedMonth ?? c.stageMonth ?? opensOn}
      canOpen={c.canOpen}
      onOpenMonth={c.openMonth}
      onClose={ws.run.active ? ws.openModel : null}
      guideSpeaks={guideSpeaks}
    />
  );
}
