import { BurningCalendar } from '../../components/BurningCalendar';
import { API_BASE } from '../../lib/api';
import { useWorkspace } from '../../app/store';
import { Action } from '../Action';

/** The Calendar: the place's fire record; a month with a real run opens it on the terrain. */
export function CalendarBeat() {
  const ws = useWorkspace();
  const { run, calendar, place } = ws;
  return (
    <>
      <h2 className="iso-step__title">Pick a month to replay</h2>
      <BurningCalendar
        apiBase={API_BASE}
        regionId={place.regionId}
        area={place.area}
        calendar={calendar.state}
        run={{ realStart: run.realStart, pendingStart: run.pendingStart, failed: run.failed }}
        stageMonth={calendar.stageMonth}
        selectedMonth={calendar.selectedMonth}
        onSelectMonth={calendar.selectMonth}
        onOpenArea={calendar.openArea}
      />
      <div className="iso-step__foot">
        <Action label={run.span ? `Replay ${run.span}` : 'Replay this run'} onClick={() => ws.goStep('fire')} disabled={!run.active} />
      </div>
    </>
  );
}
