import { router } from 'expo-router';
import { Alert } from 'react-native';

import { startProntoTestCall } from './pronto';

// In-memory registry of CallKit UUIDs that belong to the test-call demo. The
// global answerCall/endCall listeners in callKit.ts consult this so a test
// ring never hits the real accept/decline backend endpoints.
type TestCallInfo = { isVideo: boolean; clientName: string };
const TEST_CALLS = new Map<string, TestCallInfo>();

export function markTestCall(callUUID: string, info: TestCallInfo): void {
  TEST_CALLS.set(callUUID, info);
}

export function isTestCall(callUUID: string): boolean {
  return TEST_CALLS.has(callUUID);
}

export function clearTestCall(callUUID: string): void {
  TEST_CALLS.delete(callUUID);
}

/**
 * Show a real native CallKit / ConnectionService incoming-call screen locally
 * (no push). Requires RNCallKeep.setup() to have run — initCallKit() does this
 * on auth-layout mount for every signed-in user, so it's available pre-enrollment.
 */
export function displayTestIncomingCall(
  callUUID: string,
  callerName: string,
  isVideo: boolean,
): void {
  let RNCallKeep: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNCallKeep = require('react-native-callkeep').default;
  } catch (e) {
    console.warn('[testCall] callkeep require failed', e);
    return;
  }
  if (!RNCallKeep) return;
  try {
    RNCallKeep.displayIncomingCall(callUUID, callerName, callerName, 'generic', isVideo);
  } catch (e) {
    console.warn('[testCall] displayIncomingCall failed', e);
  }
}

/**
 * Called from the global CallKit answerCall handler when the answered UUID is
 * a test call. Mints the throwaway Daily room and routes into the call screen
 * in test mode. Caller is responsible for releasing the CallKit entry
 * (callKit.ts calls endCallKit after this resolves).
 *
 * NOTE: we intentionally do NOT call clearTestCall here. The native CallKit
 * dismiss (triggered by endCallKit in the answer branch) fires an endCall /
 * handleEnd event. Leaving the registry entry in place ensures isTestCall()
 * returns true for that event, so the endCall/handleEnd test branch clears it
 * and returns — never calling endProntoCall on the real backend.
 */
export async function handleTestCallAnswer(callUUID: string): Promise<void> {
  const info = TEST_CALLS.get(callUUID);
  const isVideo = info?.isVideo ?? true;
  const name = info?.clientName ?? 'John Doe';

  const res = await startProntoTestCall(callUUID, isVideo);
  if (!res.ok) {
    Alert.alert('Test call failed', res.message);
    return;
  }
  router.push({
    pathname: '/(auth)/calls/[id]',
    params: {
      id: res.data.call_id,
      url: res.data.daily_room_url,
      token: res.data.daily_meeting_token,
      name,
      video: isVideo ? '1' : '0',
      pronto: '1',
      test: '1',
    },
  });
}
