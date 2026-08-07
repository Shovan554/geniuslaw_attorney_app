import {
  normalizeCasecheckUpdates,
  normalizeIdentityDetails,
  parseReportSections,
} from '../casecheck';

describe('normalizeIdentityDetails', () => {
  // Shape confirmed against production: 8 {key, value} pairs per order.
  const real = [
    { key: 'Case Number', value: 'CVRI2503817' },
    { key: 'State', value: 'CA' },
    { key: 'County', value: 'Riverside County' },
    { key: 'Court', value: 'Superior Court of California, County of Riverside' },
    { key: 'Address of Courthouse', value: '4050 Main Street, Riverside, CA 92501' },
    { key: 'Department', value: 'Department 07 – Civil Unlimited' },
    { key: 'Department Contact Info (Phone & Email)', value: '(951) 777-3147' },
    { key: 'Online Case Search Website', value: 'https://publicaccess.riverside.courts.ca.gov/' },
  ];

  it('keeps every populated field in source order', () => {
    const rows = normalizeIdentityDetails(real);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ label: 'Case Number', value: 'CVRI2503817' });
    expect(rows[3].label).toBe('Court');
  });

  // Order 86 in production has four blank values.
  it('drops fields with blank or whitespace-only values', () => {
    const rows = normalizeIdentityDetails([
      { key: 'Case Number', value: '4:2026cv05034' },
      { key: 'State', value: '' },
      { key: 'County', value: '   ' },
      { key: 'Court', value: 'SOUTHERN DISTRICT OF TEXAS' },
      { key: 'Website', value: null },
    ]);
    expect(rows.map((r) => r.label)).toEqual(['Case Number', 'Court']);
  });

  it('flags a url value so the row can be rendered as a link', () => {
    const rows = normalizeIdentityDetails(real);
    const site = rows.find((r) => r.label === 'Online Case Search Website');
    expect(site?.kind).toBe('url');
  });

  it('flags a phone value so the row can be dialed', () => {
    const rows = normalizeIdentityDetails(real);
    const phone = rows.find((r) => r.label.startsWith('Department Contact'));
    expect(phone?.kind).toBe('phone');
  });

  it('treats an ordinary value as plain text', () => {
    const rows = normalizeIdentityDetails(real);
    expect(rows.find((r) => r.label === 'State')?.kind).toBe('text');
  });

  it('tolerates junk instead of an array', () => {
    expect(normalizeIdentityDetails(null)).toEqual([]);
    expect(normalizeIdentityDetails(undefined)).toEqual([]);
    expect(normalizeIdentityDetails('nope')).toEqual([]);
    expect(normalizeIdentityDetails([1, 'x', null])).toEqual([]);
  });

  it('drops entries with no key', () => {
    expect(normalizeIdentityDetails([{ value: 'orphan' }])).toEqual([]);
  });
});

describe('parseReportSections', () => {
  const report = [
    'SUMMARY',
    '',
    'Your case remains open in the 295th Civil District Court.',
    '',
    'CASE ACTIVITY',
    '',
    'Village Capital was served March 19, 2026.',
    'An affidavit of non-service was filed the same day.',
    '',
    'NEXT STEPS',
    '',
    'Current contact information is needed.',
  ].join('\n');

  it('splits on the all-caps header lines', () => {
    const sections = parseReportSections(report);
    expect(sections.map((s) => s.heading)).toEqual([
      'SUMMARY',
      'CASE ACTIVITY',
      'NEXT STEPS',
    ]);
  });

  it('keeps each section body intact, including internal line breaks', () => {
    const sections = parseReportSections(report);
    expect(sections[0].body).toBe(
      'Your case remains open in the 295th Civil District Court.',
    );
    expect(sections[1].body).toBe(
      'Village Capital was served March 19, 2026.\nAn affidavit of non-service was filed the same day.',
    );
  });

  it('falls back to one untitled section when there are no headers', () => {
    const sections = parseReportSections('Just a paragraph with no headings at all.');
    expect(sections).toEqual([
      { heading: null, body: 'Just a paragraph with no headings at all.' },
    ]);
  });

  it('keeps leading text that appears before the first header', () => {
    const sections = parseReportSections('Preamble line.\n\nSUMMARY\n\nBody.');
    expect(sections[0]).toEqual({ heading: null, body: 'Preamble line.' });
    expect(sections[1]).toEqual({ heading: 'SUMMARY', body: 'Body.' });
  });

  // A sentence in caps is not a heading — headings are short and wordlike.
  it('does not treat a long shouted sentence as a heading', () => {
    const sections = parseReportSections(
      'THIS IS A VERY LONG LINE OF SHOUTING THAT RUNS WELL PAST ANY PLAUSIBLE HEADING LENGTH.',
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBeNull();
  });

  it('drops a header with no body under it', () => {
    const sections = parseReportSections('SUMMARY\n\nBody.\n\nNEXT STEPS\n\n');
    expect(sections.map((s) => s.heading)).toEqual(['SUMMARY']);
  });

  it('returns nothing for empty input', () => {
    expect(parseReportSections('')).toEqual([]);
    expect(parseReportSections('   \n  ')).toEqual([]);
  });
});

describe('normalizeCasecheckUpdates', () => {
  const withReport = {
    id: 'd2a81027-8725-4900-8325-1714acfd513c',
    text: 'Internal analysis that must never be shown to the attorney.',
    report: 'SUMMARY\n\nThe client report body.',
    created_at: '2026-08-06T21:10:11.265031+00:00',
    created_by: 'bessie@geniuslossmitigation.com',
    report_send_status: 'sent',
    report_sent_at: '2026-08-06T21:11:58.522270+00:00',
  };

  // 2 of 5 production updates have no report yet — those are drafts.
  const withoutReport = {
    id: 'no-report-yet',
    text: 'Internal analysis only, report not written.',
    created_at: '2026-08-05T10:00:00.000Z',
  };

  it('keeps only updates that have a report', () => {
    const rows = normalizeCasecheckUpdates([withReport, withoutReport]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(withReport.id);
  });

  it('treats a blank report as no report', () => {
    expect(normalizeCasecheckUpdates([{ ...withReport, report: '   ' }])).toEqual([]);
    expect(normalizeCasecheckUpdates([{ ...withReport, report: null }])).toEqual([]);
  });

  // The whole point of the filter: `text` is internal and must not leak.
  it('never exposes the internal text field', () => {
    const rows = normalizeCasecheckUpdates([withReport]);
    expect(JSON.stringify(rows)).not.toContain('must never be shown');
  });

  it('parses the report into sections', () => {
    const rows = normalizeCasecheckUpdates([withReport]);
    expect(rows[0].sections).toEqual([
      { heading: 'SUMMARY', body: 'The client report body.' },
    ]);
  });

  it('sorts newest first regardless of input order', () => {
    const older = { ...withReport, id: 'older', created_at: '2026-01-01T00:00:00Z' };
    const newer = { ...withReport, id: 'newer', created_at: '2026-09-01T00:00:00Z' };
    expect(normalizeCasecheckUpdates([older, newer]).map((r) => r.id)).toEqual([
      'newer',
      'older',
    ]);
  });

  it('exposes author and sent state', () => {
    const [row] = normalizeCasecheckUpdates([withReport]);
    expect(row.author).toBe('bessie@geniuslossmitigation.com');
    expect(row.isSent).toBe(true);
    expect(row.timestamp).toBe(Date.parse('2026-08-06T21:10:11.265031+00:00'));
  });

  it('is not sent when the status says otherwise', () => {
    const [row] = normalizeCasecheckUpdates([
      { ...withReport, report_send_status: 'draft' },
    ]);
    expect(row.isSent).toBe(false);
  });

  it('survives a missing or unparseable timestamp', () => {
    const [row] = normalizeCasecheckUpdates([{ ...withReport, created_at: 'garbage' }]);
    expect(row.timestamp).toBeNull();
    expect(row.timestampLabel).toBe('');
  });

  it('falls back to a stable key when the update has no id', () => {
    const rows = normalizeCasecheckUpdates([
      { report: 'A', created_at: '2026-01-02T00:00:00Z' },
      { report: 'B', created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('tolerates junk instead of an array', () => {
    expect(normalizeCasecheckUpdates(null)).toEqual([]);
    expect(normalizeCasecheckUpdates('nope')).toEqual([]);
    expect(normalizeCasecheckUpdates([1, null, 'x'])).toEqual([]);
  });
});
