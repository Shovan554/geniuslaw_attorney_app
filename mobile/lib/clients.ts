import { authedFetch } from './auth';

export type ClientSummary = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  case_count: number;
};

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function request<T>(path: string): Promise<Result<T>> {
  try {
    const res = await authedFetch(path);
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

export async function getClients(): Promise<Result<{ clients: ClientSummary[] }>> {
  return request<{ clients: ClientSummary[] }>('/clients');
}

export async function getClientById(id: number): Promise<Result<ClientSummary>> {
  return request<ClientSummary>(`/clients/${id}`);
}
