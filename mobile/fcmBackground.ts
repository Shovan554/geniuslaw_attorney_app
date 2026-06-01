/**
 * FCM background message handler.
 *
 * MUST be registered at the very top of the JS bundle — before any React
 * render — so it's present in the headless task that runs when an FCM
 * data message wakes a killed Android app. Imported from index.ts.
 *
 * Android grants this handler ~10 seconds. We use it to call
 * RNCallKeep.displayIncomingCall(...) — ConnectionService then takes
 * over and the OS shows the native incoming-call UI.
 *
 * iOS is unaffected: VoIP push + CallKit handle the background-wake
 * path natively via plugins/withVoipPush/VoipPushBridge.m.
 */
import { Platform } from 'react-native';

type CallPayload = {
  link_type?: string;
  call_id?: string;
  caller_name?: string;
  is_video?: string;
};

function looksLikeCallPayload(data: unknown): data is CallPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return d.link_type === 'call' && typeof d.call_id === 'string' && !!d.call_id;
}

async function displayCallKitForFcm(payload: CallPayload): Promise<void> {
  let RNCallKeep: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNCallKeep = require('react-native-callkeep').default;
  } catch (e) {
    console.warn('[fcmBackground] callkeep require failed', e);
    return;
  }
  if (!RNCallKeep) return;

  const callId = String(payload.call_id);
  const callerName = String(payload.caller_name || 'Caller');
  const isVideo = payload.is_video === '1' || payload.is_video === 'true';

  try {
    RNCallKeep.displayIncomingCall(
      callId,
      callerName,
      callerName,
      'generic',
      isVideo,
    );
  } catch (e) {
    console.warn('[fcmBackground] displayIncomingCall failed', e);
  }
}

if (Platform.OS === 'android') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async (msg: any) => {
      console.log('[fcmBackground] received', JSON.stringify(msg?.data));
      const data = msg?.data;
      if (looksLikeCallPayload(data)) {
        console.log('[fcmBackground] call payload, calling displayIncomingCall');
        await displayCallKitForFcm(data);
        console.log('[fcmBackground] displayIncomingCall done');
      } else {
        console.log('[fcmBackground] non-call payload, ignored');
      }
    });
    console.log('[fcmBackground] setBackgroundMessageHandler registered');
  } catch (e) {
    console.warn('[fcmBackground] FCM messaging not available', e);
  }
}

export {};
