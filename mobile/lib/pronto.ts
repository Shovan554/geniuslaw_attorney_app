import * as SecureStore from 'expo-secure-store';
import { refreshAccessToken } from './auth';

const PRONTO_API_URL = process.env.EXPO_PUBLIC_PRONTO_API_URL;
const ACCESS_KEY = 'gla_access_token';

export type Availability = {
  attorney_id: number;
  pronto_enabled: boolean;
  pronto_available: boolean;
  pronto_available_since: string | null;
  retainer_acceptance_required: boolean;
};

export type RetainerTerms = {
  active_version: number;
  retainer_body: string;
  attorney_terms: string;
  accepted: boolean;
};

export type PracticeArea = {
  id: number;
  name: string;
  pre_retainer_required: boolean;
};

export type ProntoRetainer = {
  id: number;
  attorney_id: number;
  practice_area_id: number;
  practice_area_name: string;
  fee_amount_cents: number;
  fee_currency: string;
  retainer_path: string | null;
  retainer_filename: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RetainerUpload = {
  uri: string;
  name: string;
  practiceAreaId: number;
  feeAmountCents: number;
  feeCurrency?: string;
  active?: boolean;
};

export type RetainerUpdate = {
  feeAmountCents?: number;
  feeCurrency?: string;
  active?: boolean;
};

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function prontoFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!PRONTO_API_URL) {
    return null;
  }
  let token = await SecureStore.getItemAsync(ACCESS_KEY);
  if (!token) return null;

  const buildHeaders = (t: string): HeadersInit => ({
    ...(init.headers ?? {}),
    Authorization: `Bearer ${t}`,
  });

  let res = await fetch(`${PRONTO_API_URL}${path}`, { ...init, headers: buildHeaders(token) });
  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed) return res;

  res = await fetch(`${PRONTO_API_URL}${path}`, { ...init, headers: buildHeaders(refreshed) });
  return res;
}

async function request<T>(
  method: 'GET' | 'PATCH' | 'POST',
  path: string,
  body?: unknown,
): Promise<Result<T>> {
  if (!PRONTO_API_URL) {
    return { ok: false, message: 'Pronto API URL is not configured.' };
  }
  try {
    const res = await prontoFetch(path, {
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

export async function getProntoAvailability(): Promise<Result<Availability>> {
  return request<Availability>('GET', '/attorney/pronto/availability');
}

export async function setProntoAvailability(available: boolean): Promise<Result<Availability>> {
  return request<Availability>('PATCH', '/attorney/pronto/availability', {
    pronto_available: available,
  });
}

export async function getRetainerTerms(): Promise<Result<RetainerTerms>> {
  return request<RetainerTerms>('GET', '/attorney/pronto/retainer-terms');
}

export async function acceptRetainerTerms(
  version: number,
): Promise<Result<{ accepted: boolean; version: number }>> {
  return request<{ accepted: boolean; version: number }>(
    'POST',
    '/attorney/pronto/retainer-terms/accept',
    { version },
  );
}

export async function setProntoEnrollment(enabled: boolean): Promise<Result<Availability>> {
  return request<Availability>('PATCH', '/attorney/pronto/enrollment', {
    pronto_enabled: enabled,
  });
}

export async function listProntoPracticeAreas(): Promise<Result<PracticeArea[]>> {
  return request<PracticeArea[]>('GET', '/attorney/pronto/practice-areas');
}

export async function listProntoRetainers(): Promise<Result<ProntoRetainer[]>> {
  return request<ProntoRetainer[]>('GET', '/attorney/pronto/retainers');
}

export async function getProntoRetainer(id: number): Promise<Result<ProntoRetainer>> {
  return request<ProntoRetainer>('GET', `/attorney/pronto/retainers/${id}`);
}

export async function uploadProntoRetainer(
  upload: RetainerUpload,
): Promise<Result<ProntoRetainer>> {
  if (!PRONTO_API_URL) return { ok: false, message: 'Pronto API URL is not configured.' };
  const form = new FormData();
  form.append('file', {
    uri: upload.uri,
    name: upload.name,
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  } as unknown as Blob);
  form.append('practice_area_id', String(upload.practiceAreaId));
  form.append('fee_amount_cents', String(upload.feeAmountCents));
  form.append('fee_currency', upload.feeCurrency ?? 'USD');
  form.append('active', String(upload.active ?? true));

  try {
    const res = await prontoFetch('/attorney/pronto/retainers', {
      method: 'POST',
      body: form as unknown as BodyInit,
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
            : `Upload failed (${res.status})`;
      return { ok: false, message };
    }
    return { ok: true, data: json as ProntoRetainer };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Network error' };
  }
}

export async function updateProntoRetainer(
  id: number,
  patch: RetainerUpdate,
): Promise<Result<ProntoRetainer>> {
  const body: Record<string, unknown> = {};
  if (patch.feeAmountCents !== undefined) body.fee_amount_cents = patch.feeAmountCents;
  if (patch.feeCurrency !== undefined) body.fee_currency = patch.feeCurrency;
  if (patch.active !== undefined) body.active = patch.active;
  return request<ProntoRetainer>('PATCH', `/attorney/pronto/retainers/${id}`, body);
}

export async function getProntoRetainerUrl(
  id: number,
): Promise<Result<{ url: string; expires_in: number }>> {
  return request<{ url: string; expires_in: number }>(
    'GET',
    `/attorney/pronto/retainers/${id}/url`,
  );
}

export type PendingSigningStatus = 'client_signed' | 'attorney_signed';

export type PendingSigning = {
  id: number;
  retainer_id: number;
  client_id: number;
  client_name: string | null;
  client_bucket: string;
  practice_area_name: string;
  status: PendingSigningStatus;
  fee_amount_cents: number;
  fee_currency: string;
  signed_at: string;
  attorney_signed_at: string | null;
  client_signed_doc_url: string;
  expires_in: number;
};

export type AttorneyCancelReason =
  | 'payment_not_received'
  | 'client_unreachable'
  | 'conflict'
  | 'other';

export type CountersignResult = {
  signing_id: number;
  attorney_signed_doc_url: string;
  attorney_signed_at: string;
  status: 'attorney_signed';
  expires_in: number;
};

export async function listPendingSignings(): Promise<Result<PendingSigning[]>> {
  return request<PendingSigning[]>('GET', '/attorney/pronto/signings/pending');
}

export type SigningHistoryItem = {
  id: number;
  retainer_id: number;
  client_id: number;
  client_name: string | null;
  practice_area_name: string;
  status: string;
  fee_amount_cents: number;
  fee_currency: string;
  signed_at: string;
  attorney_signed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'attorney' | 'client' | null;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  doc_url: string | null;
  expires_in: number;
};

export async function listSigningHistory(): Promise<Result<SigningHistoryItem[]>> {
  return request<SigningHistoryItem[]>('GET', '/attorney/pronto/signings/history');
}

export async function getSigning(id: number): Promise<Result<PendingSigning>> {
  return request<PendingSigning>('GET', `/attorney/pronto/signings/${id}`);
}

export async function countersignSigning(
  id: number,
  signatureB64: string,
): Promise<Result<CountersignResult>> {
  return request<CountersignResult>(
    'POST',
    `/attorney/pronto/signings/${id}/countersign`,
    { signature_b64: signatureB64 },
  );
}

export async function cancelAttorneySigning(
  id: number,
  reason: AttorneyCancelReason,
  note?: string,
): Promise<Result<PendingSigning>> {
  return request<PendingSigning>(
    'POST',
    `/attorney/pronto/signings/${id}/cancel`,
    { reason, note: note && note.trim() ? note.trim() : null },
  );
}

// ---------------------------------------------------------------------------
// Pronto calls (Daily.co)
// ---------------------------------------------------------------------------

export type ProntoCallStatus =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'rejected'
  | 'missed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ProntoActiveCall = {
  call_id: string;
  // For retainer-gated calls. null for direct calls.
  signing_id: number | null;
  // For direct calls (pre_retainer_required = false). null for retainer-gated.
  practice_area_id: number | null;
  client_id: number;
  client_name: string;
  practice_area_name: string;
  status: ProntoCallStatus;
  is_video: boolean;
  started_at: string;
};

export async function listProntoActiveCalls(): Promise<Result<{ calls: ProntoActiveCall[] }>> {
  return request<{ calls: ProntoActiveCall[] }>('GET', '/attorney/pronto/calls/active');
}

export type AcceptProntoCallResult = {
  call_id: string;
  signing_id: number | null;
  practice_area_id: number | null;
  daily_room_url: string;
  daily_meeting_token: string;
  is_video: boolean;
  client_name: string;
};

export async function acceptProntoCall(
  callId: string,
): Promise<Result<AcceptProntoCallResult>> {
  return request<AcceptProntoCallResult>(
    'POST',
    `/attorney/pronto/calls/${callId}/accept`,
  );
}

export async function getProntoCallStatus(
  callId: string,
): Promise<Result<{ ok: boolean; status: ProntoCallStatus }>> {
  return request<{ ok: boolean; status: ProntoCallStatus }>(
    'GET',
    `/pronto/calls/${callId}/status`,
  );
}

export async function endProntoCall(
  callId: string,
  endReason: string,
): Promise<Result<{ ok: boolean; status: ProntoCallStatus; requires_wrap_up: boolean }>> {
  return request<{ ok: boolean; status: ProntoCallStatus; requires_wrap_up: boolean }>(
    'POST',
    `/pronto/calls/${callId}/end`,
    { end_reason: endReason },
  );
}

export async function wrapUpProntoCall(
  callId: string,
  outcome: 'completed' | 'not_completed',
): Promise<Result<{ ok: boolean; signing_status: string }>> {
  return request<{ ok: boolean; signing_status: string }>(
    'POST',
    `/pronto/calls/${callId}/wrap-up`,
    { outcome },
  );
}

// ---------------------------------------------------------------------------
// Push token registration (iOS PushKit/CallKit + Android FCM)
// ---------------------------------------------------------------------------

export async function registerProntoVoipToken(
  voipToken: string,
  opts?: { environment?: 'sandbox' | 'production'; bundleId?: string },
): Promise<Result<{ success: boolean }>> {
  return request<{ success: boolean }>(
    'POST',
    '/attorney/pronto/voip-tokens',
    {
      voip_token: voipToken,
      environment: opts?.environment ?? 'production',
      bundle_id: opts?.bundleId,
    },
  );
}

export async function deleteProntoVoipToken(
  voipToken: string,
): Promise<Result<{ success: boolean }>> {
  if (!PRONTO_API_URL) {
    return { ok: false, message: 'Pronto API URL is not configured.' };
  }
  const res = await prontoFetch('/attorney/pronto/voip-tokens', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ voip_token: voipToken }),
  });
  if (!res) return { ok: false, message: 'Not signed in.' };
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    return { ok: false, message: json?.detail || `Failed (${res.status})` };
  }
  return { ok: true, data: json };
}

export async function registerProntoFcmToken(
  fcmToken: string,
  opts?: { packageName?: string; deviceId?: string },
): Promise<Result<{ success: boolean }>> {
  return request<{ success: boolean }>(
    'POST',
    '/attorney/pronto/fcm-tokens',
    {
      fcm_token: fcmToken,
      package_name: opts?.packageName,
      device_id: opts?.deviceId,
    },
  );
}

export async function deleteProntoFcmToken(
  fcmToken: string,
): Promise<Result<{ success: boolean }>> {
  if (!PRONTO_API_URL) {
    return { ok: false, message: 'Pronto API URL is not configured.' };
  }
  const res = await prontoFetch('/attorney/pronto/fcm-tokens', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fcm_token: fcmToken }),
  });
  if (!res) return { ok: false, message: 'Not signed in.' };
  const json = await res.json().catch(() => ({} as any));
  if (!res.ok) {
    return { ok: false, message: json?.detail || `Failed (${res.status})` };
  }
  return { ok: true, data: json };
}

// ---------------------------------------------------------------------------
// Pronto payment history (incoming retainer payments for this attorney)
// ---------------------------------------------------------------------------

export type ProntoTransactionStatus = 'completed' | 'refunded';

export type ProntoTransaction = {
  id: number;
  client_name: string;
  amount_cents: number;
  refund_cents: number;
  net_cents: number;
  status: ProntoTransactionStatus;
  created_at: string;
  description: string | null;
};

export type ProntoTransactionsSummary = {
  currency: string;
  total_net_cents: number;
  month_net_cents: number;
  transactions: ProntoTransaction[];
};

export async function listProntoTransactions(): Promise<Result<ProntoTransactionsSummary>> {
  return request<ProntoTransactionsSummary>('GET', '/attorney/pronto/transactions');
}

// ---------------------------------------------------------------------------
// Uber-style dispatch — open requests + first-come accept
// ---------------------------------------------------------------------------

export type OpenRequest = {
  id: number;
  client_name: string;
  client_state: string | null;
  client_email: string | null;
  client_phone: string | null;
  practice_area_name: string;
  fee_amount_cents: number;
  fee_currency: string;
  signed_at: string | null;
  paid_at: string | null;
  attempt_count: number;
};

export async function listOpenRequests(): Promise<Result<OpenRequest[]>> {
  return request<OpenRequest[]>('GET', '/attorney/pronto/requests/open');
}

export type AcceptRequestResult = {
  request_id: number;
  status: string;
  client_id: number;
  client_name: string;
  practice_area_name: string;
  accepted_at: string | null;
};

export async function acceptProntoRequest(
  id: number,
): Promise<Result<AcceptRequestResult>> {
  return request<AcceptRequestResult>('POST', `/attorney/pronto/requests/${id}/accept`);
}

export type AttorneyRequestStatus =
  | 'accepted'
  | 'in_call'
  | 'completed'
  | 'cancelled';

export type AttorneyRequestItem = {
  id: number;
  client_id: number;
  client_name: string;
  practice_area_name: string;
  status: AttorneyRequestStatus;
  fee_amount_cents: number;
  fee_currency: string;
  accepted_at: string | null;
  in_call_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'client' | 'attorney' | null;
  final_retainer_text: string | null;
  has_retainer_doc: boolean;
};

export async function listMyProntoRequests(): Promise<Result<AttorneyRequestItem[]>> {
  return request<AttorneyRequestItem[]>('GET', '/attorney/pronto/requests');
}

export type RetainerDocUrl = { url: string };

// Signed URL to the completed retainer PDF (stored in the client's bucket).
export async function getProntoRetainerDocUrl(
  requestId: number,
): Promise<Result<RetainerDocUrl>> {
  return request<RetainerDocUrl>(
    'GET',
    `/attorney/pronto/requests/${requestId}/retainer-url`,
  );
}

// ---------------------------------------------------------------------------
// Pronto request detail (recent-activity detail view)
// ---------------------------------------------------------------------------

export type ProntoRequestPayment = {
  amount_cents: number;
  refund_cents: number;
  net_cents: number;
  status: 'completed' | 'refunded';
  paid_at: string | null;
};

export type ProntoRequestDetail = {
  id: number;
  client_id: number;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  practice_area_name: string;
  status: string;
  fee_amount_cents: number;
  fee_currency: string;
  accepted_at: string | null;
  in_call_at: string | null;
  completed_at: string | null;
  has_retainer_doc: boolean;
  pre_retainer_required: boolean;
  payment: ProntoRequestPayment | null;
};

export async function getProntoRequestDetail(
  id: number,
): Promise<Result<ProntoRequestDetail>> {
  return request<ProntoRequestDetail>('GET', `/attorney/pronto/requests/${id}/detail`);
}
