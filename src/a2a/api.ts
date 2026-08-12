/**
 * The A2A service on 8101.
 *
 * Same two-call shape as the errand console uses: `POST` starts the run and
 * returns an id, `EventSource` follows it. EventSource can only GET, and the
 * split has a bonus — the stream can be reopened after a refresh and the server
 * replays what was missed.
 */

import type { CouponOption } from '@/types';
import type { A2AEvent, A2AHealth, StartA2ARunInput } from './types';

/** Where the A2A service listens. Override with VITE_A2A_BASE_URL. */
export const A2A_BASE =
  (import.meta.env.VITE_A2A_BASE_URL as string | undefined) ?? 'http://localhost:8101';

export const A2A_OFFLINE =
  'The A2A service is not running. Start it in kiosk-agent-backend with: ' +
  '.venv\\Scripts\\python -m uvicorn a2a_server:app --port 8101';

interface Envelope<T> {
  success?: boolean;
  data?: T;
  detail?: string;
}

async function unwrap<T>(response: Response): Promise<T> {
  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new Error(`The A2A service returned ${response.status}.`);
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.detail ?? `The A2A service returned ${response.status}.`);
  }
  return payload.data as T;
}

export const a2aApi = {
  /**
   * Is the service able to run at all?
   *
   * Turns a network error into a typed answer: "it is down" is a state this
   * page renders, not an exception it has to handle.
   */
  health: async (): Promise<A2AHealth | null> => {
    try {
      return await unwrap<A2AHealth>(await fetch(`${A2A_BASE}/api/a2a/health`));
    } catch {
      return null;
    }
  },

  /** The merchant's own card, shown before anyone has been sent anywhere. */
  card: async (): Promise<Record<string, unknown> | null> => {
    try {
      const response = await fetch(`${A2A_BASE}/.well-known/agent-card.json`);
      if (!response.ok) return null;
      return (await response.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  },

  /** Every coupon, spendable or not — the picker greys out the rest. */
  coupons: async (): Promise<CouponOption[]> => {
    try {
      const response = await fetch(`${A2A_BASE}/api/a2a/coupons`);
      if (!response.ok) return [];
      const payload = (await response.json()) as Envelope<{ items: CouponOption[] }>;
      return payload.data?.items ?? [];
    } catch {
      return [];
    }
  },

  start: async (input: StartA2ARunInput): Promise<string> => {
    let response: Response;
    try {
      response = await fetch(`${A2A_BASE}/api/a2a/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error(A2A_OFFLINE);
    }
    const { runId } = await unwrap<{ runId: string }>(response);
    return runId;
  },

  cancel: async (runId: string): Promise<void> => {
    try {
      await fetch(`${A2A_BASE}/api/a2a/runs/${runId}/cancel`, { method: 'POST' });
    } catch {
      // The run is already unreachable — nothing useful left to do here.
    }
  },

  /**
   * Follow a run. Returns the unsubscribe function.
   *
   * The server closes the stream after `end`, and an EventSource that is not
   * explicitly closed reconnects forever — so `end` closes it from this side.
   */
  subscribe: (
    runId: string,
    onEvent: (event: A2AEvent) => void,
    onError: (message: string) => void,
  ): (() => void) => {
    const source = new EventSource(`${A2A_BASE}/api/a2a/runs/${runId}/events`);
    let finished = false;

    source.onmessage = (message) => {
      let event: A2AEvent;
      try {
        event = JSON.parse(message.data) as A2AEvent;
      } catch {
        return; // keep-alive pings and anything malformed
      }
      if (event.type === 'end') {
        finished = true;
        source.close();
      }
      onEvent(event);
    };

    source.onerror = () => {
      // A close after `end` is the normal path, not a failure.
      if (finished) return;
      source.close();
      onError('Lost the connection to the A2A service.');
    };

    return () => {
      finished = true;
      source.close();
    };
  },
};
