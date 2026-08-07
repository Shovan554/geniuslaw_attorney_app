jest.mock('../cases', () => ({
  getOrderById: jest.fn(),
}));

import type { Router } from 'expo-router';

import { getOrderById } from '../cases';
import { routeFromNotificationData } from '../notifications';

const mockGetOrderById = getOrderById as jest.MockedFunction<typeof getOrderById>;

function makeRouter() {
  const push = jest.fn();
  return { router: { push } as unknown as Router, push };
}

describe('routeFromNotificationData', () => {
  beforeEach(() => {
    mockGetOrderById.mockReset();
  });

  it('opens the tapped case directly for a case push', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'cases',
      link_type: 'cases',
      link_id: 2218,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/cases/2218');
  });

  // Tapping a retainer-agreement push opens that retainer directly. Uses the
  // exact payload shape the Pronto dispatcher sends for genre "RA".
  it('opens the tapped retainer for a retainer-agreement push', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      notification_id: 217,
      genre: 'RA',
      link_type: 'RA',
      link_id: null,
      link_uuid: 'b49f7a08-2b39-43b6-bd06-0c2405732335',
    });
    expect(push).toHaveBeenCalledWith(
      '/(auth)/retainers/b49f7a08-2b39-43b6-bd06-0c2405732335',
    );
    // No case lookup — the uuid names the destination on its own.
    expect(mockGetOrderById).not.toHaveBeenCalled();
  });

  it('opens the retainer list when a retainer push carries no uuid', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'RA',
      link_type: 'RA',
      link_id: null,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/retainers');
  });

  it('opens the retainer list when a retainer push has genre but no link_type', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, { genre: 'RA' });
    expect(push).toHaveBeenCalledWith('/(auth)/retainers');
  });

  it('opens the case list when a case push carries no link_id', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'cases',
      link_type: 'cases',
      link_id: null,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/cases');
  });

  // Tapping an order push from outside the app opens that order's detail
  // screen, which means resolving its case first.
  it('opens the tapped order for an order push', async () => {
    mockGetOrderById.mockResolvedValue({ ok: true, data: { case_id: 2219 } as any });
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'orders',
      link_type: 'orders',
      link_id: 90,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/cases/2219/orders/90');
  });

  // Tapping a CaseCheck push opens the CaseCheck screen with its order below.
  it('opens the CaseCheck screen for a casecheck push', async () => {
    mockGetOrderById.mockResolvedValue({ ok: true, data: { case_id: 2219 } as any });
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'casecheck',
      link_type: 'casecheck',
      link_id: 90,
    });
    expect(push.mock.calls.map((c) => c[0])).toEqual([
      '/(auth)/cases/2219/orders/90',
      '/(auth)/cases/2219/orders/90/casecheck',
    ]);
  });

  it('opens the case list when an order push cannot be resolved', async () => {
    mockGetOrderById.mockResolvedValue({ ok: false, message: 'Order not found.' });
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'orders',
      link_type: 'orders',
      link_id: 90,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/cases');
  });

  it('opens the request detail for a request push', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'pronto',
      link_type: 'request',
      link_id: 145,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/pronto-activity/145');
  });

  // The one genre that outranks link_type — it has no notification row link.
  it('opens the test-call screen for a pronto_test push', async () => {
    const { router, push } = makeRouter();
    await routeFromNotificationData(router, {
      genre: 'pronto_test',
      link_type: 'cases',
      link_id: 9,
    });
    expect(push).toHaveBeenCalledWith('/(auth)/pronto-test');
  });

  // With no usable link_type the genre decides — a case alert must not dump
  // the attorney on the Pronto tab.
  it('falls back to the genre section when link_type is unusable', async () => {
    const noLink = makeRouter();
    await routeFromNotificationData(noLink.router, { genre: 'cases', link_id: 2218 });
    expect(noLink.push).toHaveBeenCalledWith('/(auth)/cases');

    const unknownLink = makeRouter();
    await routeFromNotificationData(unknownLink.router, {
      genre: 'cases',
      link_type: 'document',
    });
    expect(unknownLink.push).toHaveBeenCalledWith('/(auth)/cases');

    const pronto = makeRouter();
    await routeFromNotificationData(pronto.router, { genre: 'pronto_direct_call' });
    expect(pronto.push).toHaveBeenCalledWith('/(auth)/pronto');
  });

  // A push whose genre AND link_type this build has never seen must still land.
  it('falls back to the Pronto tab when nothing is recognized', async () => {
    const unknown = makeRouter();
    await routeFromNotificationData(unknown.router, {
      genre: 'x',
      link_type: 'document',
      link_id: 3,
    });
    expect(unknown.push).toHaveBeenCalledWith('/(auth)/pronto');

    const bare = makeRouter();
    await routeFromNotificationData(bare.router, {});
    expect(bare.push).toHaveBeenCalledWith('/(auth)/pronto');
  });
});
