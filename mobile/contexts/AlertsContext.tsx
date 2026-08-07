import { createContext, type ReactNode, useContext } from 'react';

import { useAlertsState, type AlertsState } from '../hooks/useAlerts';

const AlertsContext = createContext<AlertsState | null>(null);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const state = useAlertsState();
  return <AlertsContext.Provider value={state}>{children}</AlertsContext.Provider>;
}

// Rendering outside the provider (e.g. AppHeader on an unauthed screen) is a
// no-op rather than a crash.
const EMPTY_STATE: AlertsState = {
  items: [],
  loading: false,
  error: null,
  unreadCount: 0,
  refresh: async () => {},
  markRead: async () => {},
  dismiss: async () => {},
};

export function useAlerts(): AlertsState {
  return useContext(AlertsContext) ?? EMPTY_STATE;
}
