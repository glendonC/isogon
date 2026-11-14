import { useWorkspace } from '../../app/store';
import { CalendarScreen } from './CalendarScreen';
import { PlaceScreen } from './PlaceScreen';

/** The Calendar: choosing a place on the map, then the place's or the box's fire record as the whole screen. */
export function CalendarBeat() {
  const ws = useWorkspace();
  const c = ws.calendar;
  if (c.placesOpen) {
    return <PlaceScreen places={ws.places} currentFire={ws.currentFire} onFire={c.chooseFire} onBox={c.chooseBox} onClose={c.closePlaces} />;
  }
  return (
    <CalendarScreen
      place={c.place}
      stageMonth={c.selectedMonth ?? c.stageMonth}
      canOpen={c.canOpen}
      onOpenMonth={c.openMonth}
      onChoosePlace={c.openPlaces}
    />
  );
}
