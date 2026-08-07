jest.mock('../cases', () => ({
  getOrderById: jest.fn(),
}));

import { resolveCtaRoutes } from '../alertRouting';
import { ctaForLink } from '../alerts';
import { getOrderById } from '../cases';

const mockGetOrderById = getOrderById as jest.MockedFunction<typeof getOrderById>;

describe('resolveCtaRoutes', () => {
  beforeEach(() => {
    mockGetOrderById.mockReset();
  });

  it('passes a ready route straight through without a network call', async () => {
    const cta = ctaForLink('cases', 2218)!;
    await expect(resolveCtaRoutes(cta, 'cases')).resolves.toEqual(['/(auth)/cases/2218']);
    expect(mockGetOrderById).not.toHaveBeenCalled();
  });

  // The order alert case: link_id 90 must become the case-nested order route.
  it('resolves an order id into its case-nested order route', async () => {
    mockGetOrderById.mockResolvedValue({ ok: true, data: { case_id: 2219 } as any });
    const cta = ctaForLink('orders', 90)!;
    await expect(resolveCtaRoutes(cta, 'orders')).resolves.toEqual([
      '/(auth)/cases/2219/orders/90',
    ]);
    expect(mockGetOrderById).toHaveBeenCalledWith(90);
  });

  // A CaseCheck alert opens one screen deeper, with the order underneath so
  // backing out lands on the order instead of the inbox.
  it('stacks the CaseCheck screen on top of its order', async () => {
    mockGetOrderById.mockResolvedValue({ ok: true, data: { case_id: 2219 } as any });
    const cta = ctaForLink('casecheck', 90)!;
    expect(cta.label).toBe('View CaseCheck');
    await expect(resolveCtaRoutes(cta, 'casecheck')).resolves.toEqual([
      '/(auth)/cases/2219/orders/90',
      '/(auth)/cases/2219/orders/90/casecheck',
    ]);
  });

  // A deleted order, a dropped connection, an expired session — the tap still
  // has to land somewhere sensible.
  it('falls back to the genre section when the lookup fails', async () => {
    mockGetOrderById.mockResolvedValue({ ok: false, message: 'Order not found.' });
    const orders = ctaForLink('orders', 90)!;
    await expect(resolveCtaRoutes(orders, 'orders')).resolves.toEqual(['/(auth)/cases']);

    const casecheck = ctaForLink('casecheck', 90)!;
    await expect(resolveCtaRoutes(casecheck, 'casecheck')).resolves.toEqual([
      '/(auth)/cases',
    ]);
  });

  it('falls back to the Pronto tab when the genre is unknown too', async () => {
    mockGetOrderById.mockResolvedValue({ ok: false, message: 'Network error' });
    const cta = ctaForLink('orders', 90)!;
    await expect(resolveCtaRoutes(cta, null)).resolves.toEqual(['/(auth)/pronto']);
  });

  it('never calls the API for a CaseCheck alert with no order id', async () => {
    const cta = ctaForLink('casecheck', null)!;
    await expect(resolveCtaRoutes(cta, 'casecheck')).resolves.toEqual(['/(auth)/cases']);
    expect(mockGetOrderById).not.toHaveBeenCalled();
  });
});
