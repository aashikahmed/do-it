"use client";

// Client-side wrappers for server actions: a dropped connection, a deploy mid-session or a
// proxy error throws instead of returning. Turn every throw into a normal error result so
// buttons never get stuck in a busy state.
import * as A from "@/app/actions";

const OFFLINE = "Couldn't reach the server. Check your connection and try again.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic passthrough
function wrap<F extends (...args: any[]) => Promise<any>>(fn: F): F {
  return (async (...args: Parameters<F>) => {
    try {
      return await fn(...args);
    } catch (e) {
      console.error(e);
      return { ok: false, error: OFFLINE };
    }
  }) as F;
}

export const saveProfile = wrap(A.saveProfile);
export const createPact = wrap(A.createPact);
export const joinPact = wrap(A.joinPact);
export const leavePact = wrap(A.leavePact);
export const startNextRound = wrap(A.startNextRound);
export const checkIn = wrap(A.checkIn);
export const updateCheckIn = wrap(A.updateCheckIn);
export const undoCheckIn = wrap(A.undoCheckIn);
export const nudge = wrap(A.nudge);
export const applyFreeze = wrap(A.applyFreeze);
export const callMiss = wrap(A.callMiss);
export const savePushSubscription = wrap(A.savePushSubscription);
export const removePushSubscription = wrap(A.removePushSubscription);
export const sendTestPush = wrap(A.sendTestPush);
export const setUploadedAvatar = wrap(A.setUploadedAvatar);
export const restoreGoogleAvatar = wrap(A.restoreGoogleAvatar);
export const removeAvatar = wrap(A.removeAvatar);
