import { authedFetch } from './auth';

export type OnboardingStatus = {
  pronto_enabled: boolean;
  kyc_verified: boolean;
  has_card: boolean;
  terms_accepted: boolean;
  practices_selected: boolean;
  connect_ready: boolean;
};

export type KycSessionBundle = {
  session_id: string;
  ephemeral_key_secret: string;
  publishable_key: string;
};

export type KycRefreshResult = { kyc_verified: boolean; status: string };

export type ConnectStartResult = { status: 'ready' | 'pending'; url?: string };

export type ConnectRefreshResult = { status: 'ready' | 'pending' | 'none' };

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function call<T>(method: 'GET' | 'POST', path: string): Promise<Result<T>> {
  try {
    const res = await authedFetch(path, { method });
    if (!res) return { ok: false, message: 'Not signed in.' };
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const detail = json?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail) && detail[0]?.msg
            ? String(detail[0].msg)
            : `Request failed (${res.status})`;
      return { ok: false, message };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Network error' };
  }
}

export async function getOnboardingStatus(): Promise<Result<OnboardingStatus>> {
  return call<OnboardingStatus>('GET', '/attorneys/me/onboarding');
}

export async function createKycSession(): Promise<Result<KycSessionBundle>> {
  return call<KycSessionBundle>('POST', '/attorneys/me/kyc/session');
}

export async function refreshKycStatus(): Promise<Result<KycRefreshResult>> {
  return call<KycRefreshResult>('POST', '/attorneys/me/kyc/refresh');
}

export async function acceptProntoTerms(): Promise<Result<{ terms_accepted: boolean }>> {
  return call<{ terms_accepted: boolean }>('POST', '/attorneys/me/pronto-terms/accept');
}

export async function connectStart(): Promise<Result<ConnectStartResult>> {
  return call<ConnectStartResult>('POST', '/attorneys/me/connect/start');
}

export async function connectRefresh(): Promise<Result<ConnectRefreshResult>> {
  return call<ConnectRefreshResult>('POST', '/attorneys/me/connect/refresh');
}
