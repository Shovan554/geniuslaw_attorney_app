import { request, type Result } from './pronto';

/**
 * One row of attorney_notifications.
 *
 * genre and link_type are `string`, not unions: the main portal inserts values
 * this build predates, and they must deserialize rather than blow up. See
 * iconForGenre / ctaForLink in lib/alerts.ts for how unknowns are rendered.
 */
export type AttorneyAlert = {
  id: number;
  genre: string;
  short_description: string;
  long_description: string;
  link_type: string | null;
  link_id: number | null;
  link_uuid: string | null;
  is_read: boolean;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
};

export type AlertListResponse = { notifications: AttorneyAlert[] };

/** Non-dismissed alerts, newest first. The backend already excludes pronto_test. */
export async function listAlerts(): Promise<Result<AlertListResponse>> {
  return request<AlertListResponse>('GET', '/attorney/pronto/notifications');
}

export async function markAlertRead(id: number): Promise<Result<{ success: boolean }>> {
  return request<{ success: boolean }>('POST', `/attorney/pronto/notifications/${id}/read`);
}

export async function dismissAlert(id: number): Promise<Result<{ success: boolean }>> {
  return request<{ success: boolean }>('POST', `/attorney/pronto/notifications/${id}/dismiss`);
}
