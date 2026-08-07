/**
 * Normalizes the raw CaseCheck jsonb columns on `orders` into something renderable.
 *
 * The backend passes both columns through untouched (see `models/order.py`), for the
 * same reason as `history`: the staff portal owns their shape and a strict
 * server-side model would 500 the endpoint the first time a field is added. All the
 * tolerance lives here, where it is unit-tested.
 *
 * `casecheck_identity_details` — [{ key, value }], eight fields in practice.
 * `casecheck_updates`          — [{ id, text, report, created_at, created_by,
 *                                  report_send_status, report_sent_at, ... }]
 *
 * IMPORTANT: `text` is the internal analyst write-up (it carries "flagged for review"
 * notes and unverified inferences). Only `report` — the client-facing write-up — is
 * ever surfaced, and an update with no report is a draft that is dropped entirely.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// ---------------------------------------------------------------------------
// Identity details
// ---------------------------------------------------------------------------

/** How the value should be presented — plain text, a link, or a dialable number. */
export type IdentityValueKind = 'text' | 'url' | 'phone';

export type IdentityRow = {
  label: string;
  value: string;
  kind: IdentityValueKind;
};

const URL_RE = /^https?:\/\/\S+$/i;
// Contact values look like "(951) 777-3147" or "(928) 753-0713 · dept07@court.gov".
// Requiring a parenthesized area code keeps case numbers like "4:2026cv05034" out.
const PHONE_RE = /\(\d{3}\)\s*\d{3}-\d{4}/;

function classifyValue(value: string): IdentityValueKind {
  if (URL_RE.test(value)) return 'url';
  if (PHONE_RE.test(value)) return 'phone';
  return 'text';
}

/**
 * Court identity fields, in the order the portal wrote them, with blanks removed.
 *
 * Blank values are common — an order can carry a case number and court with no
 * county, department contact, or search website — and rendering "—" eight times
 * reads as broken rather than incomplete.
 */
export function normalizeIdentityDetails(raw: unknown): IdentityRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: IdentityRow[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const label = asTrimmedString(entry.key);
    const value = asTrimmedString(entry.value);
    if (!label || !value) continue;
    rows.push({ label, value, kind: classifyValue(value) });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Report body
// ---------------------------------------------------------------------------

export type ReportSection = {
  /** null for text that appears before any heading, or a report with no headings. */
  heading: string | null;
  body: string;
};

// Headings are short shouted labels: SUMMARY, CASE ACTIVITY, WHAT THIS MEANS,
// NEXT STEPS. The length cap stops a shouted sentence from being read as one.
const MAX_HEADING_LENGTH = 40;

function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > MAX_HEADING_LENGTH) return false;
  // Must contain a letter, and must be unchanged by uppercasing.
  if (!/[A-Za-z]/.test(trimmed)) return false;
  return trimmed === trimmed.toUpperCase();
}

/**
 * Splits a report into its headed sections.
 *
 * Reports are plain text with all-caps heading lines separated by blank lines. A
 * report with no recognizable headings comes back as a single untitled section, so
 * callers never need a separate code path for the unstructured case.
 */
export function parseReportSections(report: string): ReportSection[] {
  if (!report || !report.trim()) return [];

  const sections: ReportSection[] = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    // A heading with nothing under it carries no information.
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of report.split('\n')) {
    if (isHeadingLine(line)) {
      flush();
      heading = line.trim();
    } else {
      buffer.push(line);
    }
  }
  flush();

  return sections;
}

// ---------------------------------------------------------------------------
// Updates
// ---------------------------------------------------------------------------

export type CasecheckUpdate = {
  /** Stable React key — the portal's uuid when present. */
  id: string;
  sections: ReportSection[];
  /** Epoch ms, or null when the row has no parseable timestamp. */
  timestamp: number | null;
  timestampLabel: string;
  author: string | null;
  isSent: boolean;
};

function parseTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function formatTimestamp(ms: number | null): string {
  if (ms == null) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Client-facing CaseCheck reports, newest first.
 *
 * Updates with no `report` are drafts the analyst has not published — they are
 * dropped rather than shown empty. The internal `text` field is deliberately not
 * carried onto the returned object.
 */
export function normalizeCasecheckUpdates(raw: unknown): CasecheckUpdate[] {
  if (!Array.isArray(raw)) return [];

  const rows: CasecheckUpdate[] = [];
  raw.forEach((entry, idx) => {
    if (!isRecord(entry)) return;
    const report = typeof entry.report === 'string' ? entry.report : '';
    if (!report.trim()) return;

    const timestamp = parseTimestamp(entry.created_at);
    const id = asTrimmedString(entry.id) || `casecheck-update-${idx}`;
    const author = asTrimmedString(entry.created_by) || null;

    rows.push({
      id,
      sections: parseReportSections(report),
      timestamp,
      timestampLabel: formatTimestamp(timestamp),
      author,
      isSent: asTrimmedString(entry.report_send_status).toLowerCase() === 'sent',
    });
  });

  // Newest first. Rows with no timestamp sink to the bottom rather than jumping
  // to the top, which is what treating null as 0 would do.
  return rows.sort((a, b) => (b.timestamp ?? -Infinity) - (a.timestamp ?? -Infinity));
}
