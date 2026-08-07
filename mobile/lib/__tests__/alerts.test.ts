import {
  ALERT_ACCENT,
  ctaForLink,
  formatRelativeTime,
  iconForGenre,
  routeForGenre,
} from '../alerts';

describe('iconForGenre', () => {
  it('maps known genres to their own icon', () => {
    expect(iconForGenre('pronto')).toBe('flash-outline');
    expect(iconForGenre('retainer')).toBe('document-text-outline');
    expect(iconForGenre('cases')).toBe('briefcase-outline');
    expect(iconForGenre('orders')).toBe('receipt-outline');
    expect(iconForGenre('casecheck')).toBe('shield-checkmark-outline');
  });

  // Retainer-agreement alerts arrive with an uppercase genre, unlike every
  // other value the portal writes.
  it('maps the uppercase retainer-agreement genre', () => {
    expect(iconForGenre('RA')).toBe('document-text-outline');
    expect(iconForGenre('ra')).toBe('document-text-outline');
  });

  // The extensibility contract: the portal will insert genres this app has
  // never heard of. They must render, not crash.
  it('falls back to the generic bell for an unknown genre', () => {
    expect(iconForGenre('case')).toBe('notifications-outline');
    expect(iconForGenre('')).toBe('notifications-outline');
  });
});

describe('ctaForLink', () => {
  // Retainer agreements are keyed by uuid: link_id is always null and
  // link_uuid holds retainer_history.id.
  it('routes a retainer-agreement alert straight to that retainer', () => {
    expect(
      ctaForLink('RA', null, 'b49f7a08-2b39-43b6-bd06-0c2405732335'),
    ).toEqual({
      label: 'View retainer',
      route: '/(auth)/retainers/b49f7a08-2b39-43b6-bd06-0c2405732335',
    });
  });

  it('accepts the retainer link type in either casing', () => {
    expect(ctaForLink('ra', null, 'abc-123')?.route).toBe('/(auth)/retainers/abc-123');
    expect(ctaForLink('RA', null, 'abc-123')?.route).toBe('/(auth)/retainers/abc-123');
  });

  it('falls back to the retainer list when the alert carries no uuid', () => {
    // Pushes sent by a Pronto build that predates link_uuid land here.
    expect(ctaForLink('RA', null, null)).toEqual({
      label: 'View retainer',
      route: '/(auth)/retainers',
    });
    expect(ctaForLink('RA', null)).toEqual({
      label: 'View retainer',
      route: '/(auth)/retainers',
    });
  });

  it('ignores link_uuid for link types that key off a numeric id', () => {
    expect(ctaForLink('cases', 2218, 'some-uuid')?.route).toBe('/(auth)/cases/2218');
  });

  it('routes a request alert to that request detail screen', () => {
    expect(ctaForLink('request', 145)).toEqual({
      label: 'View request',
      route: '/(auth)/pronto-activity/145',
    });
  });

  it('routes a case alert straight to that case', () => {
    expect(ctaForLink('cases', 2218)).toEqual({
      label: 'View case',
      route: '/(auth)/cases/2218',
    });
  });

  it('falls back to the case list for a case alert with no id', () => {
    expect(ctaForLink('cases', null)).toEqual({
      label: 'View cases',
      route: '/(auth)/cases',
    });
  });

  // The order screen is nested under its case, which the alert does not carry,
  // so the CTA defers its route to resolveCtaRoute.
  it('leaves an order route unresolved and hands back the order id', () => {
    expect(ctaForLink('orders', 90)).toEqual({
      label: 'View order',
      route: null,
      orderId: 90,
    });
  });

  it('falls back to the case list for an order alert with no id', () => {
    expect(ctaForLink('orders', null)).toEqual({
      label: 'View cases',
      route: '/(auth)/cases',
      orderId: undefined,
    });
  });

  it('marks a casecheck alert as an order sub-route', () => {
    expect(ctaForLink('casecheck', 90)).toEqual({
      label: 'View CaseCheck',
      route: null,
      orderId: 90,
      orderSubroute: 'casecheck',
    });
  });

  it('routes payment alerts to the transactions screen', () => {
    expect(ctaForLink('payment', null)).toEqual({
      label: 'View payments',
      route: '/(auth)/pronto-transactions',
    });
  });

  it('routes call and signing alerts to the Pronto screen', () => {
    expect(ctaForLink('call', null)?.route).toBe('/(auth)/pronto');
    expect(ctaForLink('signing', 7)?.route).toBe('/(auth)/pronto');
  });

  // A request row with no link_id cannot render pronto-activity/[id].
  it('falls back to the Pronto screen for a request with no id', () => {
    expect(ctaForLink('request', null)).toEqual({
      label: 'View request',
      route: '/(auth)/pronto',
    });
  });

  // The other half of the extensibility contract: never a dead button.
  it('returns null for unknown or absent link types', () => {
    expect(ctaForLink('document', 3)).toBeNull();
    expect(ctaForLink(null, null)).toBeNull();
    expect(ctaForLink('', 1)).toBeNull();
  });
});

describe('routeForGenre', () => {
  it('sends each known genre to its own section', () => {
    expect(routeForGenre('cases')).toBe('/(auth)/cases');
    // Orders have no list screen of their own — a case is the nearest section.
    expect(routeForGenre('orders')).toBe('/(auth)/cases');
    expect(routeForGenre('casecheck')).toBe('/(auth)/cases');
    expect(routeForGenre('pronto')).toBe('/(auth)/pronto');
    expect(routeForGenre('pronto_direct_call')).toBe('/(auth)/pronto');
    expect(routeForGenre('pronto_test')).toBe('/(auth)/pronto-test');
    expect(routeForGenre('retainer')).toBe('/(auth)/pronto');
  });

  // "retainer" (the acceptance gate) and "RA" (retainer agreements) are two
  // different features that must not collapse into one destination.
  it('sends retainer-agreement alerts to the retainers list, not Pronto', () => {
    expect(routeForGenre('RA')).toBe('/(auth)/retainers');
    expect(routeForGenre('ra')).toBe('/(auth)/retainers');
    expect(routeForGenre('retainer')).toBe('/(auth)/pronto');
  });

  // Unlike ctaForLink this must never return null — a tapped push has to land
  // somewhere, so an unseen genre falls back to Pronto.
  it('falls back to the Pronto tab for an unknown or absent genre', () => {
    expect(routeForGenre('newsletter')).toBe('/(auth)/pronto');
    expect(routeForGenre('')).toBe('/(auth)/pronto');
    expect(routeForGenre(null)).toBe('/(auth)/pronto');
  });
});

describe('formatRelativeTime', () => {
  const base = new Date('2026-08-06T12:00:00.000Z').getTime();

  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(base);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  const ago = (ms: number) => new Date(base - ms).toISOString();

  it('shows "now" under a minute', () => {
    expect(formatRelativeTime(ago(30 * 1000))).toBe('now');
  });

  it('shows minutes under an hour', () => {
    expect(formatRelativeTime(ago(5 * 60 * 1000))).toBe('5m');
  });

  it('shows hours under a day', () => {
    expect(formatRelativeTime(ago(3 * 60 * 60 * 1000))).toBe('3h');
  });

  it('shows days under a week', () => {
    expect(formatRelativeTime(ago(2 * 24 * 60 * 60 * 1000))).toBe('2d');
  });

  it('shows weeks under five weeks', () => {
    expect(formatRelativeTime(ago(3 * 7 * 24 * 60 * 60 * 1000))).toBe('3w');
  });

  it('falls back to an absolute date beyond five weeks', () => {
    const old = ago(60 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(old)).toBe(new Date(old).toLocaleDateString());
  });

  it('returns empty string for an unparseable timestamp', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });

  it('never returns a negative duration for a future timestamp', () => {
    expect(formatRelativeTime(new Date(base + 60 * 1000).toISOString())).toBe('now');
  });
});

describe('ALERT_ACCENT', () => {
  it('is a hex color', () => {
    expect(ALERT_ACCENT).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
