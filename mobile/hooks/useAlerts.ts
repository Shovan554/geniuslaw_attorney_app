import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  dismissAlert,
  listAlerts,
  markAlertRead,
  type AttorneyAlert,
} from '../lib/alertsApi';
import { attachReceivedListener } from '../lib/notifications';

const POLL_MS = 30_000;

export type AlertsState = {
  items: AttorneyAlert[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
  refresh: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  dismiss: (id: number) => Promise<void>;
};

/**
 * Alerts state for the whole app.
 *
 * The attorney app has no Supabase client, so where the Clients app subscribes
 * to realtime we poll instead — every 30s, and only while foregrounded, so a
 * backgrounded app makes no requests. Foregrounding refetches immediately.
 */
export function useAlertsState(): AlertsState {
  const [items, setItems] = useState<AttorneyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const res = await listAlerts();
    if (!mounted.current) return;
    if (res.ok) {
      setItems(res.data.notifications ?? []);
      setError(null);
    } else {
      // Keep whatever we already showed — a transient blip shouldn't blank the list.
      setError(res.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => void refresh(), POLL_MS);
    };
    const stopPolling = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    void refresh();
    if (AppState.currentState === 'active') startPolling();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void refresh();
        startPolling();
      } else {
        stopPolling();
      }
    });

    // A push landing in-app should update the badge immediately, not on the
    // next 30s tick.
    const pushSub = attachReceivedListener(() => void refresh());

    return () => {
      mounted.current = false;
      stopPolling();
      sub.remove();
      pushSub.remove();
    };
  }, [refresh]);

  const markRead = useCallback(async (id: number) => {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n,
      ),
    );
    // Best-effort. A failure is corrected by the next poll.
    await markAlertRead(id);
  }, []);

  const dismiss = useCallback(async (id: number) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    await dismissAlert(id);
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.is_read).length, [items]);

  return { items, loading, error, unreadCount, refresh, markRead, dismiss };
}
