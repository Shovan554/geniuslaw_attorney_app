import * as SecureStore from 'expo-secure-store';
import { authedFetch, getStoredUser, PublicUser } from './auth';

const USER_KEY = 'gla_user';

export type AttorneyProfile = {
  id: number;
  firm_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  bar_number: string | null;
  title: string | null;
  bio: string | null;
  status: string | null;
  firm_name: string | null;
};

export type AttorneyProfileUpdate = Partial<{
  full_name: string;
  email: string;
  phone: string;
  address: string;
  bar_number: string;
  bio: string;
}>;

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function request<T>(
  method: 'GET' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<Result<T>> {
  try {
    const res = await authedFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

export async function getAttorneyMe(): Promise<Result<AttorneyProfile>> {
  return request<AttorneyProfile>('GET', '/attorneys/me');
}

export async function updateAttorneyMe(
  updates: AttorneyProfileUpdate,
): Promise<Result<AttorneyProfile>> {
  const result = await request<AttorneyProfile>('PATCH', '/attorneys/me', updates);
  if (result.ok) {
    const stored = await getStoredUser();
    if (stored) {
      const next: PublicUser = {
        ...stored,
        email: result.data.email ?? stored.email,
        full_name: result.data.full_name ?? stored.full_name,
      };
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(next));
    }
  }
  return result;
}
