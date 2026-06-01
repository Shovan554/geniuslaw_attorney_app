import { authedFetch } from './auth';

export type VaultSetupBundle = {
  setup_intent_client_secret: string;
  ephemeral_key: string;
  customer_id: string;
  publishable_key: string;
};

export type VaultCard = { brand: string; last4: string };

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

export async function createSetupBundle(): Promise<Result<VaultSetupBundle>> {
  return call<VaultSetupBundle>('POST', '/attorneys/me/vault/setup');
}

// Backend returns `null` (HTTP 200) when no card is on file.
export async function getSavedCard(): Promise<Result<VaultCard | null>> {
  return call<VaultCard | null>('GET', '/attorneys/me/vault/card');
}
