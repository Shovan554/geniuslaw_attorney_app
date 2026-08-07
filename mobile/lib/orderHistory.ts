/**
 * Normalizes the raw `orders.history` jsonb into something renderable.
 *
 * The backend passes those rows through untouched (see `models/order.py`) because
 * the staff portal has written several shapes into that column over the years and a
 * strict server-side model would 500 the endpoint the first time a new one appears.
 * All the tolerance lives here instead, where it is unit-tested.
 *
 * Shapes seen in production:
 *   { action, changes: { field: { from, to } }, comment, timestamp, user_name }  — audit row
 *   { action: 'note', comment, timestamp, user_name, pinned?, urgent? }          — manual note
 *   { description, by, date }                                                    — legacy row
 */

export type HistoryAccent = 'success' | 'danger' | 'gold' | 'accent';

export type ChangeLine = {
  /** Human-readable field name, e.g. "Case Manager". */
  field: string;
  /** Previous value, or null when the field was empty. */
  from: string | null;
  to: string;
  /** "transition" renders `from → to`; "set" renders just the new value. */
  kind: 'transition' | 'set';
};

export type HistoryEntry = {
  key: string;
  action: string;
  actionLabel: string;
  accent: HistoryAccent;
  author: string;
  /** Epoch ms, or null when the row has no parseable timestamp. */
  timestamp: number | null;
  timestampLabel: string;
  pinned: boolean;
  urgent: boolean;
  changes: ChangeLine[];
  comment: string | null;
  description: string | null;
  /** True when the row says nothing beyond who touched it and when. */
  isEmpty: boolean;
};

/** Fields the step timeline above the feed already shows. */
const SKIPPED_CHANGE_FIELDS = new Set(['current_step']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse a history timestamp to epoch ms.
 *
 * Some rows carry both a "+00:00" offset and a trailing "Z"
 * ("2026-05-21T22:29:02.034920+00:00Z"), which `new Date()` rejects outright. Dropping
 * the redundant "Z" leaves a valid ISO string pointing at the same instant.
 */
export function parseHistoryTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  if (/[+-]\d{2}:?\d{2}Z$/.test(trimmed)) {
    candidates.push(trimmed.slice(0, -1));
  }

  for (const candidate of candidates) {
    const ms = new Date(candidate).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

export function formatHistoryTimestamp(ms: number | null): string {
  if (ms == null) return 'Unknown date';
  try {
    const d = new Date(ms);
    const date = d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${date} · ${time}`;
  } catch {
    return 'Unknown date';
  }
}

function titleCase(raw: string): string {
  return raw
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

/**
 * "case_manager_id" → "Case Manager". The trailing `_id` is dropped because the
 * portal writes the resolved display name into the change, not the id.
 */
function fieldLabel(field: string): string {
  const stripped = field.replace(/_id$/, '');
  return titleCase(stripped || field);
}

/** Render a change value, treating null/empty as absent. */
function changeValue(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return raw.trim() ? raw : null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  try {
    return JSON.stringify(raw);
  } catch {
    return null;
  }
}

export function describeChanges(changes: unknown): ChangeLine[] {
  if (!isRecord(changes)) return [];
  const lines: ChangeLine[] = [];

  for (const [field, raw] of Object.entries(changes)) {
    if (SKIPPED_CHANGE_FIELDS.has(field)) continue;

    // Tolerate `{ field: "value" }` in place of `{ field: { to: "value" } }`.
    const hasFromTo = isRecord(raw) && ('to' in raw || 'from' in raw);
    const to = changeValue(hasFromTo ? (raw as Record<string, unknown>).to : raw);
    const from = hasFromTo
      ? changeValue((raw as Record<string, unknown>).from)
      : null;

    if (to === null) continue;
    lines.push({
      field: fieldLabel(field),
      from,
      to,
      kind: hasFromTo && 'from' in (raw as Record<string, unknown>) ? 'transition' : 'set',
    });
  }

  return lines;
}

export function historyAccentKey(action: unknown): HistoryAccent {
  switch (String(action ?? '').toLowerCase().trim()) {
    case 'create':
      return 'success';
    case 'delete':
      return 'danger';
    case 'note':
      return 'gold';
    default:
      return 'accent';
  }
}

function readText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.trim() ? raw : null;
}

function toEntry(raw: Record<string, unknown>, index: number): HistoryEntry {
  const action = String(raw.action ?? '').trim();
  const timestamp =
    parseHistoryTimestamp(raw.timestamp) ?? parseHistoryTimestamp(raw.date);
  const changes = describeChanges(raw.changes);
  const comment = readText(raw.comment);
  const description = readText(raw.description);
  const author = readText(raw.user_name) ?? readText(raw.by) ?? 'System';

  return {
    key: `${index}-${String(raw.timestamp ?? raw.date ?? '')}`,
    action,
    actionLabel: action ? titleCase(action) : 'Update',
    accent: historyAccentKey(action),
    author,
    timestamp,
    timestampLabel: formatHistoryTimestamp(timestamp),
    pinned: raw.pinned === true,
    urgent: raw.urgent === true,
    changes,
    comment,
    description,
    isEmpty: changes.length === 0 && !comment && !description,
  };
}

/**
 * Normalize and order the feed: pinned entries first, then newest first. Rows with
 * no usable timestamp sink to the bottom rather than claiming the top slot.
 */
export function normalizeHistory(raw: unknown): HistoryEntry[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((row, index) => (isRecord(row) ? toEntry(row, index) : null))
    .filter((e): e is HistoryEntry => e !== null)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.timestamp ?? 0) - (a.timestamp ?? 0);
    });
}
