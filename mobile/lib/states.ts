import { authedFetch } from './auth';

export type USState = { code: string; name: string };

/** The selectable jurisdictions: 50 states + DC, alphabetical by name. */
export const US_STATES: USState[] = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'DC', name: 'District of Columbia' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
];

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function request<T>(
  method: 'PATCH',
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

/** Replace the attorney's licensed states with `codes`. Returns the saved JSON
 * object the server persisted (e.g. `{"AZ":"","CA":""}`). */
export async function saveStates(
  codes: string[],
): Promise<Result<{ states: Record<string, string> }>> {
  return request<{ states: Record<string, string> }>('PATCH', '/attorneys/me/states', {
    states: codes,
  });
}

/** Parse the stored `states` value into a Set of selected USPS codes.
 *
 * Tolerant of every shape the column has held: a JSON string or a parsed
 * object, with values that are empty strings (`{"AZ":""}`), bar numbers
 * (`{"NJ":"12345"}`), or booleans (`{"CA":true}`). A key counts as selected
 * unless its value is explicitly `false`. */
export function parseStates(
  value: string | Record<string, unknown> | null | undefined,
): Set<string> {
  let obj: Record<string, unknown> = {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value || '{}');
      if (parsed && typeof parsed === 'object') obj = parsed;
    } catch {
      obj = {};
    }
  } else if (value && typeof value === 'object') {
    obj = value;
  }

  const set = new Set<string>();
  for (const [key, v] of Object.entries(obj)) {
    if (v === false) continue;
    set.add(key.trim().toUpperCase());
  }
  return set;
}
