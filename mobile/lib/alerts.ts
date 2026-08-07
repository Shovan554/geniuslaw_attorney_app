import { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** Accent used by alert affordances — the "Read" pill and the detail CTA. */
export const ALERT_ACCENT = '#2596be';

const DEFAULT_ICON: IoniconName = 'notifications-outline';

/**
 * genre -> icon. Keyed by plain string, NOT a union: the main portal inserts
 * genres this build has never seen, and they must still render. Adding proper
 * support for a new genre is one entry here.
 */
const GENRE_ICON: Record<string, IoniconName> = {
  casecheck: 'shield-checkmark-outline',
  cases: 'briefcase-outline',
  orders: 'receipt-outline',
  pronto: 'flash-outline',
  pronto_direct_call: 'call-outline',
  pronto_test: 'megaphone-outline',
  // Retainer *acceptance* — the gate on the Pronto screen.
  retainer: 'document-text-outline',
  // Retainer *agreements* — the portal writes this one uppercase ("RA").
  ra: 'document-text-outline',
};

/**
 * Portal values are not consistently cased — the retainer-agreement genre and
 * link_type both arrive as "RA" while every other value is lowercase. Match the
 * exact key first so nothing existing shifts, then retry folded.
 */
function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  return map[key] ?? map[key.toLowerCase()];
}

export function iconForGenre(genre: string): IoniconName {
  return lookup(GENRE_ICON, genre) ?? DEFAULT_ICON;
}

export type Cta = {
  label: string;
  /** Ready to push, or null when the destination needs a lookup first. */
  route: string | null;
  /** Order whose case must be resolved before the nested route can be built. */
  orderId?: number;
  /** Screen to open on top of that order, e.g. 'casecheck'. */
  orderSubroute?: string;
};

/**
 * link_type -> CTA. An unknown link type yields null, which renders no button
 * at all — better a missing action than a button that navigates nowhere.
 */
const LINK_CTA: Record<
  string,
  (linkId: number | null, linkUuid: string | null) => Cta
> = {
  cases: (id) => ({
    label: id == null ? 'View cases' : 'View case',
    // cases/[id] cannot render without an id — fall back to the case list.
    route: id == null ? '/(auth)/cases' : `/(auth)/cases/${id}`,
  }),
  orders: (id) => ({
    label: id == null ? 'View cases' : 'View order',
    // The order screen lives under its case, but an alert carries only the
    // order id — route stays null until resolveCtaRoutes looks the case up.
    route: id == null ? '/(auth)/cases' : null,
    orderId: id ?? undefined,
  }),
  // CaseCheck alerts carry the same order id, one screen deeper.
  casecheck: (id) => ({
    label: id == null ? 'View cases' : 'View CaseCheck',
    route: id == null ? '/(auth)/cases' : null,
    orderId: id ?? undefined,
    orderSubroute: 'casecheck',
  }),
  // Retainer agreements are the one link type keyed by uuid rather than a
  // numeric id: link_id is always null and link_uuid holds retainer_history.id.
  ra: (_id, uuid) => ({
    label: 'View retainer',
    route: uuid ? `/(auth)/retainers/${uuid}` : '/(auth)/retainers',
  }),
  request: (id) => ({
    label: 'View request',
    // pronto-activity/[id] cannot render without an id.
    route: id == null ? '/(auth)/pronto' : `/(auth)/pronto-activity/${id}`,
  }),
  call: () => ({ label: 'Go to Pronto', route: '/(auth)/pronto' }),
  signing: () => ({ label: 'View signing', route: '/(auth)/pronto' }),
  payment: () => ({ label: 'View payments', route: '/(auth)/pronto-transactions' }),
  test_call: () => ({ label: 'Open test call', route: '/(auth)/pronto-test' }),
};

export function ctaForLink(
  linkType: string | null,
  linkId: number | null,
  linkUuid: string | null = null,
): Cta | null {
  if (!linkType) return null;
  const build = lookup(LINK_CTA, linkType);
  return build ? build(linkId, linkUuid) : null;
}

/** Where a genre's alerts live when there is no usable link_type. */
const GENRE_ROUTE: Record<string, string> = {
  cases: '/(auth)/cases',
  // Orders and CaseCheck have no standalone list screen of their own — both
  // are reached through a case.
  orders: '/(auth)/cases',
  casecheck: '/(auth)/cases',
  pronto: '/(auth)/pronto',
  pronto_direct_call: '/(auth)/pronto',
  pronto_test: '/(auth)/pronto-test',
  // Retainer acceptance is gated on the Pronto screen itself.
  retainer: '/(auth)/pronto',
  // Retainer agreements have a list screen of their own to land on.
  ra: '/(auth)/retainers',
};

/**
 * Genre-level landing spot, used when link_type is missing or unrecognized.
 * Unlike ctaForLink this never returns null — a tapped push has to open
 * something, and the Pronto tab is the safe default.
 */
export function routeForGenre(genre: string | null): string {
  if (!genre) return '/(auth)/pronto';
  return lookup(GENRE_ROUTE, genre) ?? '/(auth)/pronto';
}

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w`;
  return new Date(iso).toLocaleDateString();
}
