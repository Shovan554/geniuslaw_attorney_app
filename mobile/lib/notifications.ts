import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Router } from 'expo-router';
import type * as NotificationsType from 'expo-notifications';

import { resolveCtaRoutes } from './alertRouting';
import { ctaForLink, routeForGenre } from './alerts';
import { refreshAccessToken } from './auth';

const PRONTO_API_URL = process.env.EXPO_PUBLIC_PRONTO_API_URL;
const ACCESS_KEY = 'gla_access_token';
const DEVICE_ID_KEY = 'gla_device_id';

/**
 * Plain string, NOT a union: the push payload mirrors the notification row's
 * link_type verbatim, and the portal inserts types this build has never seen.
 */
export type NotificationLinkType = string;

export type NotificationData = {
  notification_id?: number;
  genre?: string;
  link_type?: NotificationLinkType | null;
  link_id?: number | null;
  /**
   * Set for link types keyed by uuid rather than a serial id — currently only
   * retainer agreements ("RA"), where it holds retainer_history.id.
   */
  link_uuid?: string | null;
};

// expo-notifications is a native module. If the dev client was built before
// expo-notifications was installed, requiring it at module-load time crashes
// the whole app. Load it lazily so the rest of the app boots and push
// becomes a graceful no-op until the native side is rebuilt.
type NotificationsModule = typeof NotificationsType;

let cached: NotificationsModule | null | undefined;
let handlerInstalled = false;

function loadNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
    return null;
  }
  if (!handlerInstalled) {
    try {
      cached.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
      handlerInstalled = true;
    } catch {
      // Some platforms (web) don't support handlers — ignore.
    }
  }
  return cached;
}

async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

async function ensurePermissions(N: NotificationsModule): Promise<boolean> {
  const existing = await N.getPermissionsAsync();
  if (existing.status === 'granted') return true;
  if (!existing.canAskAgain) return false;
  const next = await N.requestPermissionsAsync();
  return next.status === 'granted';
}

async function ensureAndroidChannel(N: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') return;
  await N.setNotificationChannelAsync('default', {
    name: 'default',
    importance: N.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#C9A84C',
  });
}

async function postPushToken(body: {
  expo_token: string;
  platform: 'ios' | 'android';
  device_id: string;
}): Promise<boolean> {
  if (!PRONTO_API_URL) {
    console.warn('[push] EXPO_PUBLIC_PRONTO_API_URL not configured');
    return false;
  }
  let token = await SecureStore.getItemAsync(ACCESS_KEY);
  if (!token) return false;

  const url = `${PRONTO_API_URL}/attorney/pronto/push-tokens`;
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  };

  let res = await fetch(url, init);
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) return false;
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${refreshed}` },
    });
  }
  return res.ok;
}

/**
 * Registers the device for push notifications and posts the Expo token to the
 * Pronto backend. Safe to call multiple times — backend upserts on
 * (attorney_id, device_id). Returns true on success.
 */
export async function registerForPushNotifications(): Promise<boolean> {
  console.log('[push] registerForPushNotifications: start');
  const N = loadNotifications();
  if (!N) {
    console.warn(
      '[push] expo-notifications native module not available — rebuild the dev client to enable push.',
    );
    return false;
  }
  if (Platform.OS === 'web') {
    console.log('[push] skipped: web platform');
    return false;
  }

  const granted = await ensurePermissions(N);
  console.log('[push] permission granted:', granted);
  if (!granted) return false;

  await ensureAndroidChannel(N);

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId;

  console.log('[push] projectId:', projectId);
  if (!projectId) {
    console.warn('[push] missing projectId in expo config');
    return false;
  }

  let expoToken: string;
  try {
    const result = await N.getExpoPushTokenAsync({ projectId });
    expoToken = result.data;
    console.log('[push] got expo token:', expoToken);
  } catch (e) {
    console.warn('[push] getExpoPushTokenAsync failed:', e);
    return false;
  }

  const deviceId = await getDeviceId();
  const platform: 'ios' | 'android' = Platform.OS === 'android' ? 'android' : 'ios';

  const ok = await postPushToken({ expo_token: expoToken, platform, device_id: deviceId });
  console.log('[push] backend registration:', ok ? 'ok' : 'failed', 'device', deviceId);
  return ok;
}

export async function routeFromNotificationData(
  router: Router,
  data: NotificationData,
): Promise<void> {
  // The one genre that outranks link_type: the backend documents genre as the
  // routing contract for test runs, so honor it even if link_type drifts.
  if (data.genre === 'pronto_test') {
    router.push(routeForGenre('pronto_test') as never);
    return;
  }

  // link_id-level routing first — same table the in-app alert modal's CTA
  // uses, so tapping a push lands exactly where "View case" would. One
  // mapping, not two.
  const cta = ctaForLink(
    data.link_type ?? null,
    data.link_id ?? null,
    data.link_uuid ?? null,
  );
  if (cta) {
    // Order and CaseCheck CTAs need a case lookup before they can name a
    // route; every other CTA resolves without touching the network.
    const routes = await resolveCtaRoutes(cta, data.genre ?? null);
    for (const route of routes) router.push(route as never);
    return;
  }

  // No usable link_type: fall back to the genre's own section rather than
  // dumping a case alert on the Pronto tab.
  router.push(routeForGenre(data.genre ?? null) as never);
}

type Subscription = { remove: () => void };

/**
 * Listens for tap-on-push events. Returns a subscription with .remove().
 * Returns a no-op subscription when the native module isn't available.
 */
export function attachTapListener(router: Router): Subscription {
  const N = loadNotifications();
  if (!N) return { remove: () => {} };

  const handled = new Set<string>();
  const handle = (response: NotificationsType.NotificationResponse) => {
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    const data = (response.notification.request.content.data ?? {}) as NotificationData;
    void routeFromNotificationData(router, data);
  };

  // Cold-start: app was launched by tapping a notification. The listener
  // below attaches after mount, so the launch response is gone by then —
  // fetch it explicitly and dedupe via identifier.
  N.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) handle(response);
    })
    .catch(() => {});

  return N.addNotificationResponseReceivedListener(handle);
}

/**
 * Fires whenever a push is *delivered* while the app is running, tapped or not.
 * The alerts poll runs every 30s; this closes that window so the bell badge
 * updates the moment a notification lands. No-op without the native module.
 */
export function attachReceivedListener(onReceived: () => void): Subscription {
  const N = loadNotifications();
  if (!N) return { remove: () => {} };
  return N.addNotificationReceivedListener(() => onReceived());
}
