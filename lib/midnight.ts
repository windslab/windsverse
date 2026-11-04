import { SYSTEM_ACTOR, staleCheckIns } from './model';
import { Fault } from './engine';
import { commit, read } from './store';
/** Runs from the Cron Trigger; quiet when nobody is left checked in from before midnight. */
export async function midnightCheckout() {
  for (let attempt = 0; ; attempt++) {
    const loaded = await read();
    if (!loaded.control || !staleCheckIns(loaded.state).length) return;
    try {
      await commit(
        loaded,
        SYSTEM_ACTOR,
        'attendance.midnight',
        {},
        loaded.control.revision,
        crypto.randomUUID(),
      );
      return;
    } catch (e) {
      // Someone saved in the same moment: read again and retry.
      if (!(e instanceof Fault) || e.status !== 409 || attempt >= 4) throw e;
    }
  }
}
