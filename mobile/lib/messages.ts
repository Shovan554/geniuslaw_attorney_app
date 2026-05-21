import { authedFetch } from './auth';

export type ConversationSummary = {
  id: string;
  client_id: number | null;
  client_name: string | null;
  client_email: string | null;
  last_message_preview: string | null;
  last_message_at: number | null;
  unread_count: number;
  created_at: number;
  updated_at: number;
};

export type MessageItem = {
  id: string;
  conversation_id: string;
  sender_user_id: number;
  sender_role: string;
  sender_name: string | null;
  body_text: string | null;
  message_type: string;
  created_at: number;
};

export type MessageableClient = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  last_logged_in: string | null;
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
            ? String(detail[0].msg)
            : `Request failed (${res.status})`;
      return { ok: false, message };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Network error' };
  }
}

export async function getConversations(): Promise<Result<{ conversations: ConversationSummary[] }>> {
  return request<{ conversations: ConversationSummary[] }>('/messages/conversations');
}

export async function createConversation(clientId: number): Promise<Result<ConversationSummary>> {
  return request<ConversationSummary>('/messages/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  });
}

export async function getMessages(
  conversationId: string,
  opts: { limit?: number; before?: number } = {},
): Promise<Result<{ messages: MessageItem[] }>> {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.before) params.set('before', String(opts.before));
  const qs = params.toString();
  return request<{ messages: MessageItem[] }>(
    `/messages/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`,
  );
}

export async function sendMessage(
  conversationId: string,
  bodyText: string,
): Promise<Result<MessageItem>> {
  return request<MessageItem>(`/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body_text: bodyText }),
  });
}

export async function markRead(conversationId: string): Promise<Result<{ ok: boolean }>> {
  return request<{ ok: boolean }>(`/messages/conversations/${conversationId}/read`, {
    method: 'POST',
  });
}

export async function deleteConversation(conversationId: string): Promise<Result<{ ok: boolean }>> {
  return request<{ ok: boolean }>(`/messages/conversations/${conversationId}`, {
    method: 'DELETE',
  });
}

export async function getMessageableClients(): Promise<Result<{ clients: MessageableClient[] }>> {
  return request<{ clients: MessageableClient[] }>('/messages/messageable-clients');
}
