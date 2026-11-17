import { acceptCall, endCall } from './calls';
import { acceptProntoCall, endProntoCall } from './pronto';

/**
 * Incoming calls reach the attorney app from two backends that share the
 * same CallKit / ConnectionService UI:
 *   - GeniusLaw: a client calling their attorney (`calls` table, attorney backend)
 *   - Pronto:    a consumer intake call (`pronto_calls`, Pronto backend)
 *
 * The native layer only hands JS the call UUID, so try GeniusLaw first and
 * fall back to Pronto on 404. IDs are UUIDs in both tables — no collision.
 */

export type CallScreenParams = {
  id: string;
  url: string;
  token: string;
  name: string;
  video: '0' | '1';
  pronto?: '1';
};

export type AcceptIncomingResult =
  | { ok: true; params: CallScreenParams }
  | { ok: false; message: string };

export async function acceptIncomingCall(callId: string): Promise<AcceptIncomingResult> {
  const gl = await acceptCall(callId);
  if (gl.ok) {
    return {
      ok: true,
      params: {
        id: gl.data.call_id,
        url: gl.data.daily_room_url,
        token: gl.data.daily_meeting_token,
        name: gl.data.caller_name || 'Client',
        video: gl.data.is_video ? '1' : '0',
      },
    };
  }
  if (gl.status !== 404) return { ok: false, message: gl.message };

  const pr = await acceptProntoCall(callId);
  if (!pr.ok) return { ok: false, message: pr.message };
  return {
    ok: true,
    params: {
      id: pr.data.call_id,
      url: pr.data.daily_room_url,
      token: pr.data.daily_meeting_token,
      name: pr.data.client_name,
      video: pr.data.is_video ? '1' : '0',
      pronto: '1',
    },
  };
}

export async function declineIncomingCall(callId: string): Promise<void> {
  const gl = await endCall(callId, 'declined');
  if (gl.ok || gl.status !== 404) return;
  await endProntoCall(callId, 'declined');
}
