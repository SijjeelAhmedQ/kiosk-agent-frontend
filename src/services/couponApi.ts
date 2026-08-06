/**
 * Reading the restaurant's coupons, so the operator can pick one from a list
 * instead of copying a code out of another tab.
 *
 * This goes through the *agent* service rather than straight to the kiosk API.
 * The kiosk only allows its own origin, and forwarding one read from the agent
 * — which already knows the restaurant's address — is a smaller change than
 * widening the kiosk's CORS for a second app.
 */

import type { CouponOption } from '@/types';
import { AGENT_BASE } from './agentApi';

interface CouponListResponse {
  success: boolean;
  data: { items: CouponOption[] };
}

export const couponApi = {
  /**
   * Coupons with value left on them.
   *
   * Returns an empty list rather than throwing: an unreachable service is
   * already reported by the health check, and the picker falls back to letting
   * the operator type a code.
   */
  spendable: async (): Promise<CouponOption[]> => {
    try {
      const response = await fetch(`${AGENT_BASE}/api/agent/coupons`);
      if (!response.ok) return [];
      const payload = (await response.json()) as CouponListResponse;
      return payload.data?.items ?? [];
    } catch {
      return [];
    }
  },
};
