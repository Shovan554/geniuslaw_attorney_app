import { authedFetch } from './auth';

export type CaseStatus = 'open' | 'closed' | 'in_progress';

export type CaseSummary = {
  id: number;
  title: string;
  case_type: string | null;
  status: CaseStatus;
  case_number: string | null;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string | null;
  client_id: number | null;
  client_name: string | null;
  notes: string | null;
};

export type OrderSummary = {
  id: number;
  order_date: string | null;
  service_type: string | null;
  service_type_label: string;
  status: string | null;
  current_step: string | null;
  current_step_label: string | null;
  due_date: string | null;
  state: string | null;
  contract_amount: number;
  paid_amount: number;
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

export type GetCasesOpts = {
  excludeClosed?: boolean;
  limit?: number;
  clientId?: number;
};

export async function getCases(
  opts: GetCasesOpts = {},
): Promise<Result<{ cases: CaseSummary[] }>> {
  const params = new URLSearchParams();
  if (opts.excludeClosed) params.set('exclude_closed', 'true');
  if (opts.limit != null) params.set('limit', String(opts.limit));
  if (opts.clientId != null) params.set('client_id', String(opts.clientId));
  const qs = params.toString();
  return request<{ cases: CaseSummary[] }>(`/cases${qs ? `?${qs}` : ''}`);
}

export async function getCaseById(id: number): Promise<Result<CaseSummary>> {
  return request<CaseSummary>(`/cases/${id}`);
}

export async function getOrdersByCaseId(
  id: number,
): Promise<Result<{ orders: OrderSummary[] }>> {
  return request<{ orders: OrderSummary[] }>(`/cases/${id}/orders`);
}
