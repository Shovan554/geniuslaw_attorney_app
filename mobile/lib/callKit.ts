import { router } from 'expo-router';
import { Alert, NativeModules, Platform } from 'react-native';

import {
  acceptProntoCall,
  endProntoCall,
  registerProntoFcmToken,
  registerProntoVoipToken,
} from './pronto';
import { clearTestCall, handleTestCallAnswer, isTestCall } from './testCall';

const APP_NAME = 'GeniusLaw Attorney';
const IOS_BUNDLE_ID = 'com.geniuslaw.attorney';
const ANDROID_PACKAGE = 'com.geniuslaw.attorney';

let initialised = false;

/**
 * Wire CallKit + PushKit on iOS / RNCallKeep + FCM on Android. Idempotent.
 *
 * Native modules are required lazily so the app still boots in a dev
 * client that pre-dates the EAS rebuild. Falls back to JS-only in-app
 * polling (the existing /attorney/pronto/calls/active list) until a
 * proper dev client is installed.
 *
 * Acceptance routes to /(auth)/calls/[id]?pronto=1 — the existing
 * Daily call screen the in-app Join Call card already uses.
 */
export async function initCallKit(_userId: number): Promise<void> {
  if (initialised) return;
  if (Platform.OS === 'android') {
    initialised = true;
    await initAndroidCalls();
    return;
  }
  if (Platform.OS !== 'ios') return;
  initialised = true;

  const callKeepNative = (NativeModules as Record<string, unknown>).RNCallKeep;
  const voipNative = (NativeModules as Record<string, unknown>).RNVoipPushNotificationManager;
  console.log(
    '[callKit] native modules present — RNCallKeep:',
    !!callKeepNative,
    'RNVoipPushNotificationManager:',
    !!voipNative,
  );
  if (!callKeepNative || !voipNative) {
    console.warn(
      '[callKit] iOS native modules not in this binary yet — rebuild via EAS / npx expo run:ios to enable CallKit.',
    );
    return;
  }

  let RNCallKeep: any;
  let VoipPushNotification: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNCallKeep = require('react-native-callkeep').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    VoipPushNotification = require('react-native-voip-push-notification').default;
  } catch (err) {
    console.warn('[callKit] shim require failed', err);
    return;
  }
  if (!RNCallKeep || !VoipPushNotification) {
    console.warn('[callKit] shim default exports missing — skipping init');
    return;
  }

  try {
    await RNCallKeep.setup({
      ios: {
        appName: APP_NAME,
        supportsVideo: true,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: false,
      },
      android: {
        alertTitle: APP_NAME,
        alertDescription: 'GeniusLaw Attorney needs permission to manage calls',
        cancelButton: 'Cancel',
        okButton: 'OK',
        additionalPermissions: [],
      },
    });
  } catch (err) {
    console.warn('[callKit] setup failed', err);
    return;
  }

  RNCallKeep.addEventListener('answerCall', async ({ callUUID }: { callUUID: string }) => {
    console.log('[callKit] answerCall', callUUID);
    if (isTestCall(callUUID)) {
      await handleTestCallAnswer(callUUID);
      endCallKit(callUUID);
      return;
    }
    try {
      const res = await acceptProntoCall(callUUID);
      if (!res.ok) throw new Error(res.message);
      router.push({
        pathname: '/(auth)/calls/[id]',
        params: {
          id: res.data.call_id,
          url: res.data.daily_room_url,
          token: res.data.daily_meeting_token,
          name: res.data.client_name,
          video: res.data.is_video ? '1' : '0',
          pronto: '1',
        },
      });
    } catch (e: any) {
      Alert.alert('Could not accept call', e?.message || 'Please try again.');
      RNCallKeep.endCall(callUUID);
    }
  });

  RNCallKeep.addEventListener('endCall', async ({ callUUID }: { callUUID: string }) => {
    console.log('[callKit] endCall', callUUID);
    if (isTestCall(callUUID)) {
      clearTestCall(callUUID);
      return;
    }
    try {
      await endProntoCall(callUUID, 'declined');
    } catch {
      // best-effort
    }
  });

  RNCallKeep.addEventListener('didDisplayIncomingCall', (info: unknown) => {
    console.log('[callKit] displayed', info);
  });

  // VoIP token capture. The VoipPushBridge native bridge (plugins/withVoipPush)
  // owns the sole PKPushRegistry and forwards credentials to RNVoipPushNotificationManager.
  // Listener MUST be attached BEFORE register or the buffered token is dropped.
  VoipPushNotification.addEventListener(
    'didLoadWithEvents',
    (events: Array<{ name: string; data: unknown }>) => {
      for (const e of events) {
        if (
          e.name === VoipPushNotification.RNVoipPushRemoteNotificationsRegisteredEvent &&
          typeof e.data === 'string' &&
          e.data.length > 0
        ) {
          submitVoipToken(e.data).catch((err: unknown) =>
            console.warn('[callKit] register (replayed) failed', err),
          );
        }
      }
    },
  );

  VoipPushNotification.addEventListener('register', (token: string) => {
    console.log(
      '[callKit] VoIP register event fired — token length:',
      typeof token === 'string' ? token.length : `<${typeof token}>`,
    );
    if (typeof token === 'string' && token.length > 0) {
      submitVoipToken(token).catch((e: unknown) =>
        console.warn('[callKit] register failed', e),
      );
    }
  });
}

async function submitVoipToken(voipToken: string): Promise<void> {
  if (Platform.OS !== 'ios') return;
  console.log(
    '[callKit] submitting VoIP token to backend — environment:',
    __DEV__ ? 'sandbox' : 'production',
    'token prefix:',
    voipToken.slice(0, 8),
  );
  const res = await registerProntoVoipToken(voipToken, {
    environment: __DEV__ ? 'sandbox' : 'production',
    bundleId: IOS_BUNDLE_ID,
  });
  if (!res.ok) {
    console.warn('[callKit] voip token register failed', res.message);
    return;
  }
  console.log('[callKit] voip token registered');
}

// ---------- Android: FCM token + ConnectionService wiring ----------

async function initAndroidCalls(): Promise<void> {
  const callKeepNative = (NativeModules as Record<string, unknown>).RNCallKeep;
  if (!callKeepNative) {
    console.warn(
      '[callKit] Android: RNCallKeep native module missing — rebuild via EAS / npx expo run:android',
    );
    return;
  }

  let RNCallKeep: any;
  let messaging: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    RNCallKeep = require('react-native-callkeep').default;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    messaging = require('@react-native-firebase/messaging').default;
  } catch (err) {
    console.warn('[callKit] Android: shim require failed', err);
    return;
  }
  if (!RNCallKeep || !messaging) {
    console.warn('[callKit] Android: shim default exports missing');
    return;
  }

  // Our own post-accept end-call shouldn't be reported as a decline.
  const acceptedCallUUIDs = new Set<string>();

  const handleAnswer = async (callUUID: string) => {
    console.log('[callKit] (android) answerCall', callUUID);
    if (isTestCall(callUUID)) {
      try { RNCallKeep.backToForeground(); } catch {}
      try { RNCallKeep.setCurrentCallActive(callUUID); } catch {}
      await handleTestCallAnswer(callUUID);
      try { RNCallKeep.endCall(callUUID); } catch {}
      return;
    }
    try {
      RNCallKeep.backToForeground();
    } catch (e) {
      console.warn('[callKit] (android) backToForeground failed', e);
    }
    try {
      RNCallKeep.setCurrentCallActive(callUUID);
    } catch (e) {
      console.warn('[callKit] (android) setCurrentCallActive failed', e);
    }
    acceptedCallUUIDs.add(callUUID);
    try {
      const res = await acceptProntoCall(callUUID);
      if (!res.ok) throw new Error(res.message);
      router.push({
        pathname: '/(auth)/calls/[id]',
        params: {
          id: res.data.call_id,
          url: res.data.daily_room_url,
          token: res.data.daily_meeting_token,
          name: res.data.client_name,
          video: res.data.is_video ? '1' : '0',
          pronto: '1',
        },
      });
    } catch (e: any) {
      console.warn('[callKit] (android) accept failed', e);
      try {
        RNCallKeep.endCall(callUUID);
      } catch (endErr) {
        console.warn('[callKit] (android) cleanup endCall failed', endErr);
      }
      Alert.alert('Could not accept call', e?.message || 'Please try again.');
    }
  };

  const handleEnd = async (callUUID: string) => {
    if (isTestCall(callUUID)) {
      clearTestCall(callUUID);
      return;
    }
    if (acceptedCallUUIDs.has(callUUID)) {
      acceptedCallUUIDs.delete(callUUID);
      console.log('[callKit] (android) endCall ignored (post-accept)', callUUID);
      return;
    }
    console.log('[callKit] (android) endCall', callUUID);
    try {
      await endProntoCall(callUUID, 'declined');
    } catch (e) {
      console.warn('[callKit] (android) endCall API failed', e);
    }
  };

  // Attach listeners BEFORE setup() so didLoadWithEvents replays land.
  RNCallKeep.addEventListener(
    'didLoadWithEvents',
    (events: Array<{ name: string; data: any }>) => {
      console.log('[callKit] (android) didLoadWithEvents', events?.length ?? 0);
      for (const ev of events || []) {
        if (ev?.name === 'RNCallKeepPerformAnswerCallAction' && ev?.data?.callUUID) {
          handleAnswer(String(ev.data.callUUID));
        } else if (ev?.name === 'RNCallKeepPerformEndCallAction' && ev?.data?.callUUID) {
          handleEnd(String(ev.data.callUUID));
        }
      }
    },
  );
  RNCallKeep.addEventListener('answerCall', ({ callUUID }: { callUUID: string }) =>
    handleAnswer(callUUID),
  );
  RNCallKeep.addEventListener('endCall', ({ callUUID }: { callUUID: string }) =>
    handleEnd(callUUID),
  );

  try {
    await RNCallKeep.setup({
      ios: {
        appName: APP_NAME,
        supportsVideo: true,
        maximumCallGroups: '1',
        maximumCallsPerCallGroup: '1',
        includesCallsInRecents: false,
      },
      android: {
        alertTitle: APP_NAME,
        alertDescription: 'GeniusLaw Attorney needs permission to manage calls',
        cancelButton: 'Cancel',
        okButton: 'OK',
        additionalPermissions: [],
        foregroundService: {
          channelId: 'com.geniuslaw.attorney.calls',
          channelName: 'Incoming calls',
          notificationTitle: 'Call in progress',
        },
      },
    });
  } catch (err) {
    console.warn('[callKit] Android: setup failed', err);
    return;
  }

  try {
    await messaging().requestPermission();
  } catch (e) {
    console.warn('[callKit] Android: notification permission denied', e);
  }

  try {
    const token: string = await messaging().getToken();
    if (token) {
      submitFcmToken(token).catch((e: unknown) =>
        console.warn('[callKit] (android) fcm token register failed', e),
      );
    }
  } catch (e) {
    console.warn('[callKit] Android: getToken failed', e);
  }

  messaging().onTokenRefresh((token: string) => {
    submitFcmToken(token).catch((e: unknown) =>
      console.warn('[callKit] (android) fcm token refresh register failed', e),
    );
  });

  messaging().onMessage(async (msg: any) => {
    console.log('[callKit] (android) fcm onMessage', JSON.stringify(msg?.data));
    const data = msg?.data;
    if (data?.link_type === 'call' && data?.call_id) {
      const callId = String(data.call_id);
      const callerName = String(data.caller_name || 'Caller');
      const isVideo = data.is_video === '1' || data.is_video === 'true';
      console.log('[callKit] (android) displayIncomingCall →', callId, callerName, 'video=', isVideo);
      try {
        RNCallKeep.displayIncomingCall(
          callId,
          callerName,
          callerName,
          'generic',
          isVideo,
        );
      } catch (e) {
        console.warn('[callKit] (android) displayIncomingCall failed', e);
      }
    } else {
      console.log('[callKit] (android) onMessage non-call payload, ignored');
    }
  });
}

async function submitFcmToken(fcmToken: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  const res = await registerProntoFcmToken(fcmToken, {
    packageName: ANDROID_PACKAGE,
  });
  if (!res.ok) {
    console.warn('[callKit] (android) fcm token register failed', res.message);
    return;
  }
  console.log('[callKit] (android) fcm token registered');
}

/**
 * Pull the Android activity to the foreground. Used by the meeting screen
 * on mount to re-issue the activity-launch while CallKeep's phoneCall
 * foreground service is still alive.
 */
export function bringAppForward(): void {
  if (Platform.OS !== 'android') return;
  const callKeepNative = (NativeModules as Record<string, unknown>).RNCallKeep;
  if (!callKeepNative) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNCallKeep = require('react-native-callkeep').default;
    RNCallKeep?.backToForeground?.();
  } catch (e) {
    console.warn('[callKit] backToForeground failed', e);
  }
}

/**
 * Tear down the CallKeep entry once the call screen has mounted.
 *
 * iOS: releases the CallKit audio session and resumes future VoIP
 * delivery — Apple throttles apps that don't end pushes promptly.
 * Android: ends the ConnectionService call.
 */
export function endCallKit(callUUID: string): void {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
  const callKeepNative = (NativeModules as Record<string, unknown>).RNCallKeep;
  if (!callKeepNative) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RNCallKeep = require('react-native-callkeep').default;
    RNCallKeep?.endCall?.(callUUID);
  } catch (e) {
    console.warn('[callKit] endCall failed', e);
  }
}
