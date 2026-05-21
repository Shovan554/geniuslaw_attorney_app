import { useEffect, useState } from 'react';

const CURRENT_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? '';
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();

type State = {
  latestVersion: string | null;
  isOutdated: boolean;
  loading: boolean;
};

export function useAppVersion() {
  const [state, setState] = useState<State>({
    latestVersion: null,
    isOutdated: false,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/app/version`);
        if (!res.ok) throw new Error('version fetch failed');
        const data: { version: string } = await res.json();
        if (cancelled) return;
        const latest = data.version?.trim();
        if (!latest) {
          setState({ latestVersion: null, isOutdated: false, loading: false });
          return;
        }
        setState({
          latestVersion: latest,
          isOutdated: !!CURRENT_VERSION && latest !== CURRENT_VERSION.trim(),
          loading: false,
        });
      } catch {
        if (!cancelled) setState({ latestVersion: null, isOutdated: false, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...state, currentVersion: CURRENT_VERSION };
}
