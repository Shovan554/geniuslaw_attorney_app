import { authedFetch } from './auth';

export type CallStatus =
  | 'initiated'
  | 'ringing'
  | 'answered'
  | 'rejected'
  | 'missed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type CallDirection = 'incoming' | 'outgoing';

export type CallHistoryItem = {
  id: string;
  direction: CallDirection;
  other_party_user_id: number;
  other_party_name: string;
  other_party_email: string | null;
  case_id: number | null;
  case_title: string | null;
  status: CallStatus;
  is_video: boolean;
  started_at: number;
  answered_at: number | null;
  ended_at: number | null;
  duration_seconds: number | null;
  end_reason: string | null;
};

export type CallableClient = {
  id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  last_logged_in: string | null;
};

export type InitiateCallResponse = {
  call_id: string;
  daily_room_url: string;
  daily_meeting_token: string;
  callee_name: string;
  is_video: boolean;
};

export type AcceptCallResponse = {
  call_id: string;
  daily_room_url: string;
  daily_meeting_token: string;
  is_video: boolean;
};

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function request<T>(path: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const res = await authedFetch(path, init);
    if (!res) return { ok: false, message: 'Not signed in.' };
    const json = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      const detail = json?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail) && detail[0]?.msg
            ? detail[0].msg
            : `Request failed (${res.status})`;
      return { ok: false, message };
    }
    return { ok: true, data: json as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error.';
    return { ok: false, message };
  }
}

export async function getCallHistory(): Promise<Result<{ calls: CallHistoryItem[] }>> {
  return request<{ calls: CallHistoryItem[] }>('/calls/history');
}

export async function getCallableClients(): Promise<Result<{ clients: CallableClient[] }>> {
  return request<{ clients: CallableClient[] }>('/calls/callable-clients');
}

export async function initiateCall(
  calleeUserId: number,
  caseId?: number | null,
  isVideo: boolean = false,
): Promise<Result<InitiateCallResponse>> {
  return request<InitiateCallResponse>('/calls/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callee_user_id: calleeUserId,
      case_id: caseId ?? null,
      is_video: isVideo,
    }),
  });
}

export async function acceptCall(callId: string): Promise<Result<AcceptCallResponse>> {
  return request<AcceptCallResponse>(`/calls/${callId}/accept`, { method: 'POST' });
}

export async function endCall(
  callId: string,
  endReason: string,
): Promise<Result<{ ok: boolean; status: CallStatus }>> {
  return request<{ ok: boolean; status: CallStatus }>(`/calls/${callId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ end_reason: endReason }),
  });
}

export async function deleteCall(callId: string): Promise<Result<{ ok: boolean }>> {
  return request<{ ok: boolean }>(`/calls/${callId}`, { method: 'DELETE' });
}
