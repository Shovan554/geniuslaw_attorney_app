import type { Cta } from './alerts';
import { routeForGenre } from './alerts';
import { getOrderById } from './cases';

/**
 * Turns a CTA into the routes to push, hitting the network only when the CTA
 * cannot name its destination on its own.
 *
 * Returns a stack, not a single route: a CaseCheck alert opens the CaseCheck
 * screen with its order underneath, so backing out lands on the order rather
 * than jumping all the way back to the inbox.
 *
 * Lives apart from `lib/alerts.ts` so that module stays pure and synchronous —
 * this is the one piece of alert routing that has to talk to the API.
 */
export async function resolveCtaRoutes(
  cta: Cta,
  genre: string | null = null,
): Promise<string[]> {
  if (cta.route) return [cta.route];

  // The order screen is nested under its case, and the alert only knows the
  // order id, so ask the server which case the order belongs to.
  if (cta.orderId != null) {
    const res = await getOrderById(cta.orderId);
    if (res.ok) {
      const order = `/(auth)/cases/${res.data.case_id}/orders/${cta.orderId}`;
      return cta.orderSubroute ? [order, `${order}/${cta.orderSubroute}`] : [order];
    }
  }

  // Lookup failed (deleted order, no network, signed out) — land the attorney
  // in the right section rather than leaving the tap doing nothing at all.
  return [routeForGenre(genre)];
}
