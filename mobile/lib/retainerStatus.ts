/**
 * Presentation helpers for `retainer_history` rows.
 *
 * Two columns here are owned by the staff portal rather than this app:
 * `envelope_status` (a free-text DocuSign status) and `payment_terms` (jsonb).
 * Both are treated defensively — an unrecognized status still renders a sensible
 * pill, and an unfamiliar payment-terms shape still renders readable lines —
 * so a portal change never needs an app release to look right.
 */
import { Ionicons } from '@expo/vector-icons';
import type React from 'react';
import type { AppColors } from '../constants/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

export type RetainerStatusMeta = {
  label: string;
  icon: IoniconsName;
  fg: string;
  bg: string;
};

const GOLD_TINT = 'rgba(184,146,74,0.14)';
const SUCCESS_TINT = 'rgba(76,175,125,0.14)';
const DANGER_TINT = 'rgba(224,82,82,0.12)';

function titleCase(raw: string): string {
  return raw
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join(' ');
}

export function retainerStatusMeta(
  status: string | null | undefined,
  colors: AppColors,
): RetainerStatusMeta {
  const normalized = (status ?? '').toLowerCase().trim();

  switch (normalized) {
    case 'completed':
    case 'signed':
      return {
        label: normalized === 'signed' ? 'Signed' : 'Completed',
        icon: 'checkmark-done-outline',
        fg: colors.success,
        bg: SUCCESS_TINT,
      };
    case 'sent':
      return {
        label: 'Sent',
        icon: 'paper-plane-outline',
        fg: colors.accent,
        bg: colors.accentTint,
      };
    case 'delivered':
    case 'viewed':
      return {
        label: normalized === 'viewed' ? 'Viewed' : 'Delivered',
        icon: 'mail-open-outline',
        fg: colors.accent,
        bg: colors.accentTint,
      };
    case 'queued':
      return {
        label: 'Queued',
        icon: 'time-outline',
        fg: colors.gold,
        bg: GOLD_TINT,
      };
    case 'created':
    case 'draft':
      return {
        label: normalized === 'draft' ? 'Draft' : 'Created',
        icon: 'document-outline',
        fg: colors.gold,
        bg: GOLD_TINT,
      };
    case 'voided':
      return {
        label: 'Voided',
        icon: 'close-circle-outline',
        fg: colors.danger,
        bg: DANGER_TINT,
      };
    case 'declined':
      return {
        label: 'Declined',
        icon: 'hand-left-outline',
        fg: colors.danger,
        bg: DANGER_TINT,
      };
    default:
      return {
        label: normalized ? titleCase(normalized) : 'Pending',
        icon: 'hourglass-outline',
        fg: colors.textMuted,
        bg: 'rgba(138,140,152,0.12)',
      };
  }
}

/**
 * `matter_type` / `rep_type` are stored as slugs. Title-casing alone gets most
 * of them right but mangles the few that are abbreviations or legal terms —
 * "loss_mit" is not "Loss Mit" and "prose" is *pro se*, not "Prose".
 *
 * Live values as of Aug 2026: full_service, prose, hoa, dual_track,
 * forbearance, loss_mit.
 */
const KNOWN_LABELS: Record<string, string> = {
  loss_mit: 'Loss Mitigation',
  loss_mitigation: 'Loss Mitigation',
  dual_track: 'Dual Track',
  full_service: 'Full Service',
  forbearance: 'Forbearance',
  hoa: 'HOA',
  prose: 'Pro Se',
  pro_se: 'Pro Se',
};

/** Humanize a stored slug. Returns null when there is nothing to show. */
export function formatSlug(raw: string | null | undefined): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  return KNOWN_LABELS[value.toLowerCase()] ?? titleCase(value);
}

/** `2500` → `$2,500.00`; missing or unparseable → `—`. */
export function formatAmount(raw: unknown): string {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** `2026-08-03T…` → `Aug 3, 2026`; missing or unparseable → `—`. */
export function formatRetainerDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // A bare `YYYY-MM-DD` parses as UTC midnight, which renders as the previous
  // day west of Greenwich. Pin it to local midnight instead.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const ms = new Date(normalized).getTime();
  if (!Number.isFinite(ms)) return '—';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '—';
  }
}

export type PaymentTermLine = {
  /** Null when the line is a bare value with nothing to label it. */
  label: string | null;
  value: string;
};

/** Keys that carry the money on a term object, in preference order. */
const AMOUNT_KEYS = ['amount', 'value', 'price', 'fee', 'total', 'payment'];
/** Keys that carry a percentage instead of a dollar figure. */
const PERCENT_KEYS = ['percent', 'percentage', 'pct'];
/**
 * Keys that describe what the money is for, most specific first.
 *
 * `due_event` / `term_type` / `term_order` are the shape the portal actually
 * writes today, e.g.
 *   { amount: 500, due_date: null, due_event: "Upon Completion of Research",
 *     term_type: "event", term_order: 1 }
 */
const LABEL_KEYS = [
  'label',
  'name',
  'title',
  'description',
  'due_event',
  'milestone',
  'due_date',
  'due',
  'when',
  'date',
  // Last resort: `type` / `term_type` only say which of the fields above holds
  // the real label, so they lose to every one of them.
  'type',
  'term_type',
  'term',
];
/** Label keys whose value is a date and should be rendered as one. */
const DATE_LABEL_KEYS = new Set(['due_date', 'date', 'when', 'due']);
/** Keys that only order the terms — never worth showing as a label or value. */
const NOISE_KEYS = new Set(['term_order', 'order', 'sort_order', 'id']);
/** An object key whose numeric value should read as currency. */
const MONETARY_KEY = /(amount|fee|price|total|payment|deposit|balance|down|retainer|cost)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstKey(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function firstLabel(obj: Record<string, unknown>): string | null {
  for (const key of LABEL_KEYS) {
    const value = text(obj[key]);
    if (!value) continue;
    if (DATE_LABEL_KEYS.has(key)) {
      const asDate = formatRetainerDate(value);
      // A "due" that isn't a date ("on completion") stays as written.
      return asDate === '—' ? titleCase(value) : `Due ${asDate}`;
    }
    return key === 'type' || key === 'term_type' ? titleCase(value) : value;
  }
  return null;
}

/** Render a leaf value, using currency only when the key implies money. */
function scalar(value: unknown, key?: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return key && MONETARY_KEY.test(key) ? formatAmount(value) : String(value);
  }
  if (typeof value === 'string') return text(value);
  return null;
}

function percent(raw: unknown): string | null {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return `${n}%`;
}

function lineFromObject(obj: Record<string, unknown>): PaymentTermLine | null {
  const label = firstLabel(obj);

  const amount = firstKey(obj, AMOUNT_KEYS);
  if (amount !== undefined) {
    const rendered =
      typeof amount === 'number' || typeof amount === 'string'
        ? formatAmount(amount)
        : null;
    // A non-numeric "amount" (e.g. "on completion") is still worth showing.
    const value = rendered !== '—' && rendered !== null ? rendered : text(amount);
    if (value) return { label, value };
  }

  const pct = firstKey(obj, PERCENT_KEYS);
  if (pct !== undefined) {
    const value = percent(pct);
    if (value) return { label, value };
  }

  // No recognized money key — fall back to the object's own readable entries.
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (NOISE_KEYS.has(key)) continue;
    const rendered = scalar(value, key);
    if (rendered) parts.push(`${titleCase(key)}: ${rendered}`);
  }
  if (parts.length > 0) return { label: null, value: parts.join(' · ') };

  return label ? { label: null, value: label } : null;
}

/**
 * Normalize the `payment_terms` jsonb into renderable lines.
 *
 * Tolerated shapes:
 *   [{ label, amount }, …]   [{ description, percent }, …]   ["50% up front", …]
 *   { down_payment: 1000, monthly: 250 }   "Flat fee, due on signing"   2500
 */
export function formatPaymentTerms(raw: unknown): PaymentTermLine[] {
  if (raw === null || raw === undefined) return [];

  if (typeof raw === 'string') {
    const value = text(raw);
    return value ? [{ label: null, value }] : [];
  }

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? [{ label: null, value: formatAmount(raw) }] : [];
  }

  if (Array.isArray(raw)) {
    // The portal writes an explicit `term_order`; honour it so a two-payment
    // schedule reads in the order the client actually pays.
    const ordered = [...raw]
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => {
        const ao = isRecord(a.entry) ? Number(a.entry.term_order) : NaN;
        const bo = isRecord(b.entry) ? Number(b.entry.term_order) : NaN;
        const aValid = Number.isFinite(ao);
        const bValid = Number.isFinite(bo);
        if (aValid && bValid && ao !== bo) return ao - bo;
        if (aValid !== bValid) return aValid ? -1 : 1;
        return a.index - b.index;
      })
      .map((e) => e.entry);

    const lines: PaymentTermLine[] = [];
    for (const entry of ordered) {
      if (isRecord(entry)) {
        const line = lineFromObject(entry);
        if (line) lines.push(line);
        continue;
      }
      const value = scalar(entry);
      if (value) lines.push({ label: null, value });
    }
    return lines;
  }

  if (isRecord(raw)) {
    const lines: PaymentTermLine[] = [];
    for (const [key, value] of Object.entries(raw)) {
      if (NOISE_KEYS.has(key)) continue;
      const rendered = scalar(value, key);
      if (rendered) lines.push({ label: titleCase(key), value: rendered });
    }
    return lines;
  }

  return [];
}
