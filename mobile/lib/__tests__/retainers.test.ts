import { lightColors } from '../../constants/theme';
import {
  formatAmount,
  formatPaymentTerms,
  formatRetainerDate,
  formatSlug,
  retainerStatusMeta,
} from '../retainerStatus';

const colors = lightColors;

describe('retainerStatusMeta', () => {
  it('maps completed and signed to the success pill', () => {
    expect(retainerStatusMeta('completed', colors)).toMatchObject({
      label: 'Completed',
      fg: colors.success,
    });
    expect(retainerStatusMeta('signed', colors)).toMatchObject({
      label: 'Signed',
      fg: colors.success,
    });
  });

  it('maps in-flight statuses to the accent pill', () => {
    expect(retainerStatusMeta('sent', colors)).toMatchObject({
      label: 'Sent',
      fg: colors.accent,
    });
    expect(retainerStatusMeta('delivered', colors)).toMatchObject({
      label: 'Delivered',
      fg: colors.accent,
    });
    expect(retainerStatusMeta('viewed', colors)).toMatchObject({
      label: 'Viewed',
      fg: colors.accent,
    });
  });

  it('maps queued and draft states to the gold pill', () => {
    expect(retainerStatusMeta('queued', colors)).toMatchObject({
      label: 'Queued',
      fg: colors.gold,
    });
    expect(retainerStatusMeta('created', colors)).toMatchObject({
      label: 'Created',
      fg: colors.gold,
    });
    expect(retainerStatusMeta('draft', colors)).toMatchObject({
      label: 'Draft',
      fg: colors.gold,
    });
  });

  it('maps voided and declined to the danger pill', () => {
    expect(retainerStatusMeta('voided', colors)).toMatchObject({
      label: 'Voided',
      fg: colors.danger,
    });
    expect(retainerStatusMeta('declined', colors)).toMatchObject({
      label: 'Declined',
      fg: colors.danger,
    });
  });

  it('ignores casing and surrounding whitespace', () => {
    expect(retainerStatusMeta('  COMPLETED ', colors).label).toBe('Completed');
    expect(retainerStatusMeta('Voided', colors).label).toBe('Voided');
  });

  it('title-cases an unknown status rather than dropping it', () => {
    // The staff portal can add statuses without an app release.
    expect(retainerStatusMeta('partially_signed', colors).label).toBe(
      'Partially Signed',
    );
    expect(retainerStatusMeta('authoritativecopy', colors).label).toBe(
      'Authoritativecopy',
    );
  });

  it('falls back to Pending for empty or missing statuses', () => {
    expect(retainerStatusMeta('', colors).label).toBe('Pending');
    expect(retainerStatusMeta(null, colors).label).toBe('Pending');
    expect(retainerStatusMeta(undefined, colors).label).toBe('Pending');
  });

  it('always returns a usable icon', () => {
    for (const status of ['completed', 'sent', 'queued', 'voided', 'whatever', '']) {
      expect(typeof retainerStatusMeta(status, colors).icon).toBe('string');
    }
  });
});

describe('formatSlug', () => {
  // Every matter_type / rep_type value present in production as of Aug 2026.
  it('expands the stored slugs to real labels', () => {
    expect(formatSlug('loss_mit')).toBe('Loss Mitigation');
    expect(formatSlug('dual_track')).toBe('Dual Track');
    expect(formatSlug('full_service')).toBe('Full Service');
    expect(formatSlug('forbearance')).toBe('Forbearance');
  });

  it('keeps abbreviations and legal terms intact', () => {
    // Title-casing alone would give "Hoa" and "Prose".
    expect(formatSlug('hoa')).toBe('HOA');
    expect(formatSlug('prose')).toBe('Pro Se');
    expect(formatSlug('pro_se')).toBe('Pro Se');
  });

  it('ignores casing and whitespace', () => {
    expect(formatSlug('  LOSS_MIT ')).toBe('Loss Mitigation');
    expect(formatSlug('HOA')).toBe('HOA');
  });

  it('title-cases a slug it has never seen', () => {
    expect(formatSlug('short_sale')).toBe('Short Sale');
    expect(formatSlug('bankruptcy')).toBe('Bankruptcy');
  });

  it('returns null when there is nothing to show', () => {
    expect(formatSlug(null)).toBeNull();
    expect(formatSlug(undefined)).toBeNull();
    expect(formatSlug('')).toBeNull();
    expect(formatSlug('   ')).toBeNull();
  });
});

describe('formatAmount', () => {
  it('formats numbers as USD currency', () => {
    expect(formatAmount(2500)).toBe('$2,500.00');
    expect(formatAmount(0)).toBe('$0.00');
    expect(formatAmount(1234.5)).toBe('$1,234.50');
  });

  it('accepts the string form PostgREST returns for numeric columns', () => {
    expect(formatAmount('2500.00')).toBe('$2,500.00');
  });

  it('renders a dash for missing or unparseable values', () => {
    expect(formatAmount(null)).toBe('—');
    expect(formatAmount(undefined)).toBe('—');
    expect(formatAmount('not a number')).toBe('—');
    expect(formatAmount({})).toBe('—');
  });
});

describe('formatRetainerDate', () => {
  it('formats an ISO timestamp', () => {
    expect(formatRetainerDate('2026-08-03T14:22:00.000Z')).toMatch(/2026/);
  });

  it('renders a dash for missing or invalid input', () => {
    expect(formatRetainerDate(null)).toBe('—');
    expect(formatRetainerDate(undefined)).toBe('—');
    expect(formatRetainerDate('')).toBe('—');
    expect(formatRetainerDate('nonsense')).toBe('—');
  });
});

describe('formatPaymentTerms', () => {
  it('returns nothing for empty input', () => {
    expect(formatPaymentTerms(null)).toEqual([]);
    expect(formatPaymentTerms(undefined)).toEqual([]);
    expect(formatPaymentTerms('')).toEqual([]);
    expect(formatPaymentTerms('   ')).toEqual([]);
    expect(formatPaymentTerms([])).toEqual([]);
    expect(formatPaymentTerms({})).toEqual([]);
  });

  it('passes a plain string through', () => {
    expect(formatPaymentTerms('Flat fee, due on signing')).toEqual([
      { label: null, value: 'Flat fee, due on signing' },
    ]);
  });

  it('renders a bare number as currency', () => {
    expect(formatPaymentTerms(2500)).toEqual([{ label: null, value: '$2,500.00' }]);
  });

  // The shape the staff portal writes today, taken from live rows.
  it('renders the production term shape, labelling by due_event', () => {
    expect(
      formatPaymentTerms([
        {
          amount: 500.0,
          due_date: null,
          due_event: 'Upon Completion of Research',
          term_type: 'event',
          term_order: 1,
        },
      ]),
    ).toEqual([{ label: 'Upon Completion of Research', value: '$500.00' }]);
  });

  it('orders production terms by term_order, not array position', () => {
    expect(
      formatPaymentTerms([
        { amount: 2500, due_event: 'Prior to Filing', term_type: 'event', term_order: 2 },
        { amount: 1000, due_event: 'Upon Execution', term_type: 'event', term_order: 1 },
      ]),
    ).toEqual([
      { label: 'Upon Execution', value: '$1,000.00' },
      { label: 'Prior to Filing', value: '$2,500.00' },
    ]);
  });

  it('keeps array order when term_order is absent', () => {
    expect(
      formatPaymentTerms([
        { label: 'Second', amount: 2 },
        { label: 'First', amount: 1 },
      ]),
    ).toEqual([
      { label: 'Second', value: '$2.00' },
      { label: 'First', value: '$1.00' },
    ]);
  });

  it('falls back to a due date when the term has no due_event', () => {
    expect(
      formatPaymentTerms([{ amount: 750, due_date: '2026-09-01', term_type: 'date' }]),
    ).toEqual([{ label: 'Due Sep 1, 2026', value: '$750.00' }]);
  });

  it('falls back to term_type when neither due_event nor due_date is set', () => {
    expect(formatPaymentTerms([{ amount: 900, term_type: 'flat_fee' }])).toEqual([
      { label: 'Flat Fee', value: '$900.00' },
    ]);
  });

  it('never surfaces term_order as a label or value', () => {
    const lines = formatPaymentTerms([{ term_order: 1, schedule: 'monthly' }]);
    expect(JSON.stringify(lines)).not.toMatch(/term.?order/i);
    expect(lines).toEqual([{ label: null, value: 'Schedule: monthly' }]);
  });

  it('renders an array of labelled amounts', () => {
    expect(
      formatPaymentTerms([
        { label: 'Due at signing', amount: 1250 },
        { label: 'Due on filing', amount: 1250 },
      ]),
    ).toEqual([
      { label: 'Due at signing', value: '$1,250.00' },
      { label: 'Due on filing', value: '$1,250.00' },
    ]);
  });

  it('accepts alternate label and amount keys', () => {
    expect(formatPaymentTerms([{ description: 'Retainer', value: '500' }])).toEqual([
      { label: 'Retainer', value: '$500.00' },
    ]);
    expect(formatPaymentTerms([{ type: 'Deposit', total: 750 }])).toEqual([
      { label: 'Deposit', value: '$750.00' },
    ]);
  });

  it('renders percentage-based terms', () => {
    expect(
      formatPaymentTerms([
        { label: 'Up front', percent: 50 },
        { label: 'On completion', percentage: '50' },
      ]),
    ).toEqual([
      { label: 'Up front', value: '50%' },
      { label: 'On completion', value: '50%' },
    ]);
  });

  it('keeps a non-numeric amount as text instead of showing a dash', () => {
    expect(formatPaymentTerms([{ label: 'Balance', amount: 'on completion' }])).toEqual(
      [{ label: 'Balance', value: 'on completion' }],
    );
  });

  it('renders an array of plain strings', () => {
    expect(formatPaymentTerms(['50% up front', '50% on completion'])).toEqual([
      { label: null, value: '50% up front' },
      { label: null, value: '50% on completion' },
    ]);
  });

  it('renders a plain object as labelled rows, currency only for money keys', () => {
    expect(
      formatPaymentTerms({ down_payment: 1000, monthly_amount: 250, months: 6 }),
    ).toEqual([
      { label: 'Down Payment', value: '$1,000.00' },
      { label: 'Monthly Amount', value: '$250.00' },
      { label: 'Months', value: '6' },
    ]);
  });

  it('summarizes a term object that has no recognized money key', () => {
    expect(formatPaymentTerms([{ schedule: 'monthly', installments: 6 }])).toEqual([
      { label: null, value: 'Schedule: monthly · Installments: 6' },
    ]);
  });

  it('renders booleans readably', () => {
    expect(formatPaymentTerms({ financed: true, waived: false })).toEqual([
      { label: 'Financed', value: 'Yes' },
      { label: 'Waived', value: 'No' },
    ]);
  });

  it('skips unusable entries without throwing', () => {
    expect(formatPaymentTerms([null, undefined, {}, '', 'Real term'])).toEqual([
      { label: null, value: 'Real term' },
    ]);
    expect(formatPaymentTerms({ empty: null, blank: '  ', good: 'yes' })).toEqual([
      { label: 'Good', value: 'yes' },
    ]);
  });

  it('never throws on unexpected input', () => {
    expect(() => formatPaymentTerms(true)).not.toThrow();
    expect(() => formatPaymentTerms([[1, 2], { a: { b: 1 } }])).not.toThrow();
  });
});
