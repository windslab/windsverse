import { SYSTEM_ACTOR, staleCheckIns } from './model';
import { Fault } from './engine';
import { commit, read } from './store';
import { isMemberCode } from './member-code';
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

/** Gives cards made before codes were random a random code; quiet once none are left. */
export async function recodeMembers() {
  for (let attempt = 0; ; attempt++) {
    const loaded = await read();
    if (!loaded.control || loaded.state.members.every((m) => isMemberCode(m.code))) return false;
    try {
      await commit(
        loaded,
        SYSTEM_ACTOR,
        'member.recode',
        {},
        loaded.control.revision,
        crypto.randomUUID(),
      );
      return true;
    } catch (e) {
      if (!(e instanceof Fault) || e.status !== 409 || attempt >= 4) throw e;
    }
  }
}
