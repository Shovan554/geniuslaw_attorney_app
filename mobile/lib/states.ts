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

/** Replace the attorney's licensed states with `states`, a map of USPS code ->
 * bar number (empty string is allowed). Returns the saved JSON object the
 * server persisted (e.g. `{"CA":"4321","NJ":""}`). */
export async function saveStates(
  states: Record<string, string>,
): Promise<Result<{ states: Record<string, string> }>> {
  return request<{ states: Record<string, string> }>('PATCH', '/attorneys/me/states', {
    states,
  });
}

/** Parse the stored `states` value into a map of USPS code -> bar number.
 *
 * Tolerant of every shape the column has held: a JSON string or a parsed
 * object, with values that are bar numbers (`{"NJ":"12345"}`), empty strings
 * (`{"AZ":""}`), or booleans (`{"CA":true}`). Non-string values normalize to an
 * empty bar number; a value of `false` drops the key entirely (deselected). */
export function parseStatesMap(
  value: string | Record<string, unknown> | null | undefined,
): Record<string, string> {
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

  const map: Record<string, string> = {};
  for (const [key, v] of Object.entries(obj)) {
    if (v === false) continue;
    map[key.trim().toUpperCase()] = typeof v === 'string' ? v : '';
  }
  return map;
}
