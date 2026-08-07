import { authedFetch } from './auth';

export type RetainerSummary = {
  id: string;
  created_at: string | null;
  name: string;
  matter_type: string | null;
  envelope_status: string;
  flat_fee: number | null;
  /** Raw jsonb from the staff portal — normalize with `formatPaymentTerms`. */
  payment_terms: unknown;
  rep_type: string | null;
  state: string | null;
  firm_name: string | null;
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

export async function getRetainers(): Promise<
  Result<{ retainers: RetainerSummary[] }>
> {
  return request<{ retainers: RetainerSummary[] }>('/retainers');
}

export async function getRetainerById(
  id: string
): Promise<Result<RetainerSummary>> {
  return request<RetainerSummary>(`/retainers/${encodeURIComponent(id)}`);
}
