import {
  describeChanges,
  formatHistoryTimestamp,
  historyAccentKey,
  normalizeHistory,
  parseHistoryTimestamp,
} from '../orderHistory';

describe('parseHistoryTimestamp', () => {
  // The bug this module exists for: Supabase writes some history rows with BOTH a
  // "+00:00" offset and a trailing "Z". new Date() rejects that outright, so every
  // audit row would render "Unknown date" if we passed it through untouched.
  it('parses a timestamp carrying both an offset and a trailing Z', () => {
    const ms = parseHistoryTimestamp('2026-05-21T22:29:02.034920+00:00Z');
    expect(ms).toBe(Date.UTC(2026, 4, 21, 22, 29, 2, 34));
  });

  it('parses ordinary ISO timestamps unchanged', () => {
    expect(parseHistoryTimestamp('2026-05-21T22:29:02Z')).toBe(
      Date.UTC(2026, 4, 21, 22, 29, 2),
    );
    expect(parseHistoryTimestamp('2026-05-21T22:29:02+00:00')).toBe(
      Date.UTC(2026, 4, 21, 22, 29, 2),
    );
  });

  it('returns null for missing or unparseable values', () => {
    expect(parseHistoryTimestamp(null)).toBeNull();
    expect(parseHistoryTimestamp(undefined)).toBeNull();
    expect(parseHistoryTimestamp('')).toBeNull();
    expect(parseHistoryTimestamp('not a date')).toBeNull();
    expect(parseHistoryTimestamp(42)).toBeNull();
  });
});

describe('formatHistoryTimestamp', () => {
  it('labels an unparseable timestamp rather than showing an empty slot', () => {
    expect(formatHistoryTimestamp(null)).toBe('Unknown date');
  });

  it('renders a real timestamp with its year', () => {
    expect(formatHistoryTimestamp(Date.UTC(2026, 4, 21, 12, 0, 0))).toContain('2026');
  });
});

describe('describeChanges', () => {
  it('renders a from/to transition with a readable field name', () => {
    expect(describeChanges({ case_manager_id: { to: 'Meitse Merete', from: null } })).toEqual([
      { field: 'Case Manager', from: null, to: 'Meitse Merete', kind: 'transition' },
    ]);
  });

  it('keeps both sides when the field had a previous value', () => {
    expect(describeChanges({ status: { from: 'open', to: 'closed' } })).toEqual([
      { field: 'Status', from: 'open', to: 'closed', kind: 'transition' },
    ]);
  });

  it('treats an empty string as an absent value', () => {
    expect(describeChanges({ state: { from: '', to: 'TX' } })[0].from).toBeNull();
  });

  // The portal hides current_step here because the step timeline above already
  // shows it; repeating it in the feed is noise.
  it('skips current_step, which the step timeline already shows', () => {
    expect(describeChanges({ current_step: { from: 'a', to: 'b' } })).toEqual([]);
  });

  it('renders a set-only change when there is no "from"', () => {
    expect(describeChanges({ due_date: { to: '2026-06-01' } })).toEqual([
      { field: 'Due Date', from: null, to: '2026-06-01', kind: 'set' },
    ]);
  });

  it('tolerates a bare scalar in place of a change object', () => {
    expect(describeChanges({ dst: 'Nevada' })).toEqual([
      { field: 'Dst', from: null, to: 'Nevada', kind: 'set' },
    ]);
  });

  it('stringifies non-scalar values instead of printing [object Object]', () => {
    expect(describeChanges({ closer: { to: { name: 'Ann' } } })[0].to).toBe('{"name":"Ann"}');
  });

  it('returns nothing for a missing or malformed changes map', () => {
    expect(describeChanges(undefined)).toEqual([]);
    expect(describeChanges(null)).toEqual([]);
    expect(describeChanges('nope' as unknown as Record<string, unknown>)).toEqual([]);
  });

  it('drops a change that carries no value at all', () => {
    expect(describeChanges({ notes: { from: null } })).toEqual([]);
  });
});

describe('historyAccentKey', () => {
  it('gives each known action its own accent', () => {
    expect(historyAccentKey('create')).toBe('success');
    expect(historyAccentKey('delete')).toBe('danger');
    expect(historyAccentKey('note')).toBe('gold');
  });

  it('is case-insensitive', () => {
    expect(historyAccentKey('Create')).toBe('success');
  });

  // Same extensibility contract as alerts: the portal invents actions without
  // asking this app first, and an unknown one must still render.
  it('falls back to the neutral accent for an unknown action', () => {
    expect(historyAccentKey('reassign')).toBe('accent');
    expect(historyAccentKey(undefined)).toBe('accent');
  });
});

describe('normalizeHistory', () => {
  const note = {
    action: 'note',
    comment: 'Client confirmed the hearing date by phone.',
    user_name: 'michelle.charlene@geniuslaw.com',
    timestamp: '2026-05-22T09:14:00+00:00Z',
  };
  const edit = {
    action: 'edit',
    changes: { case_manager_id: { to: 'Meitse Merete', from: null } },
    comment: null,
    user_id: 92,
    timestamp: '2026-05-21T22:29:02.034920+00:00Z',
    user_name: 'michelle.charlene@geniuslaw.com',
  };

  it('normalizes the production entry shape', () => {
    const [entry] = normalizeHistory([edit]);
    expect(entry).toMatchObject({
      action: 'edit',
      actionLabel: 'Edit',
      author: 'michelle.charlene@geniuslaw.com',
      comment: null,
      pinned: false,
      urgent: false,
      accent: 'accent',
    });
    expect(entry.changes).toEqual([
      { field: 'Case Manager', from: null, to: 'Meitse Merete', kind: 'transition' },
    ]);
    expect(entry.timestamp).toBe(Date.UTC(2026, 4, 21, 22, 29, 2, 34));
  });

  it('sorts newest first', () => {
    const [first, second] = normalizeHistory([edit, note]);
    expect(first.action).toBe('note');
    expect(second.action).toBe('edit');
  });

  it('floats pinned entries above newer unpinned ones', () => {
    const [first] = normalizeHistory([{ ...edit, pinned: true }, note]);
    expect(first.action).toBe('edit');
    expect(first.pinned).toBe(true);
  });

  it('sinks entries with no usable timestamp to the bottom', () => {
    const undated = { action: 'note', comment: 'legacy', timestamp: null };
    const entries = normalizeHistory([undated, edit]);
    expect(entries[entries.length - 1].timestampLabel).toBe('Unknown date');
  });

  it('reads the legacy description and date fields', () => {
    const [entry] = normalizeHistory([
      { description: 'Order created', by: 'System', date: '2026-01-02T00:00:00Z' },
    ]);
    expect(entry.description).toBe('Order created');
    expect(entry.author).toBe('System');
    expect(entry.actionLabel).toBe('Update');
    expect(entry.timestamp).toBe(Date.UTC(2026, 0, 2));
  });

  it('attributes an entry with no author to System', () => {
    expect(normalizeHistory([{ action: 'edit' }])[0].author).toBe('System');
  });

  it('flags an entry as empty when it carries no changes, comment, or description', () => {
    const [entry] = normalizeHistory([{ action: 'edit', changes: {} }]);
    expect(entry.isEmpty).toBe(true);
  });

  it('does not flag an entry that has a comment', () => {
    expect(normalizeHistory([note])[0].isEmpty).toBe(false);
  });

  it('gives every entry a stable unique key', () => {
    const keys = normalizeHistory([edit, { ...edit }, note]).map((e) => e.key);
    expect(new Set(keys).size).toBe(3);
  });

  it('survives junk in the array and a non-array input', () => {
    expect(normalizeHistory([null, 'junk', 7, edit] as unknown[])).toHaveLength(1);
    expect(normalizeHistory(undefined)).toEqual([]);
    expect(normalizeHistory('nope' as unknown as unknown[])).toEqual([]);
  });
});
