import { authedFetch } from './auth';

export type PracticeArea = {
  id: number;
  name: string;
  pre_retainer_required: boolean;
};

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

/** The full catalog of selectable practice areas. */
export async function listPracticeAreas(): Promise<Result<PracticeArea[]>> {
  return request<PracticeArea[]>('GET', '/attorneys/practice-areas');
}

/** Replace the attorney's selected practice areas with `names`. Returns the
 * saved comma-separated string the server persisted. */
export async function savePracticeAreas(
  names: string[],
): Promise<Result<{ practice_areas: string }>> {
  return request<{ practice_areas: string }>('PATCH', '/attorneys/me/practice-areas', {
    names,
  });
}

/** Parse the attorney's stored comma-separated `practice_areas` string into a
 * trimmed, non-empty list of names. */
export function parsePracticeAreas(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
