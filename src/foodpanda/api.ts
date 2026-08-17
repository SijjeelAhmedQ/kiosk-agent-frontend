/**
 * The Foodpanda delivery agent on 8103.
 *
 * Same two-call shape the other consoles use: an ordinary `fetch` for anything
 * with an answer, and an `EventSource` for anything that unfolds. EventSource
 * can only GET, which is exactly why the split is worth keeping — the stream can
 * be reopened after a refresh and the server replays what was missed.
 *
 * Note what this file cannot do: start a delivery for an order that exists. The
 * only way a real job gets here is the Friends Kitchen ordering agent handing
 * one over. `sendTestRequest` sends the same message by hand, for looking at
 * this agent on its own, and it is labelled as a test everywhere it appears.
 */

import type { AgentCard, FoodpandaEvent, FoodpandaHealth, Job, TestRequestInput } from './types';

/** Where the delivery agent listens. Override with VITE_FOODPANDA_BASE_URL. */
export const FOODPANDA_BASE =
  (import.meta.env.VITE_FOODPANDA_BASE_URL as string | undefined) ?? 'http://localhost:8103';

export const FOODPANDA_OFFLINE =
  'The Foodpanda delivery agent is not running. Start it in friends-kitchen-agent-backend with: ' +
  '.venv\\Scripts\\python -m uvicorn foodpanda_server:app --port 8103';

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
    throw new Error(`The delivery agent returned ${response.status}.`);
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.detail ?? `The delivery agent returned ${response.status}.`);
  }
  return payload.data as T;
}

/**
 * A test request in the shape the ordering agent sends.
 *
 * Built here rather than in the form so that the wire format lives with the
 * rest of the wire format. The coordinates are Friends Kitchen Islamabad and a
 * point the given distance away — a real pair of places, because a request with
 * a nonsense fix would exercise the validation rather than the dispatcher.
 */
function testMessage(input: TestRequestInput) {
  const pickup = { latitude: 33.598827, longitude: 73.05381 };
  // Roughly a degree of latitude per 111 km, pushed due north. Close enough for
  // a request whose distance is carried explicitly in `distanceKm` anyway.
  const dropLat = pickup.latitude + input.distanceKm / 111;

  return {
    order: {
      orderId: null,
      orderNumber: input.orderNumber,
      status: 'paid',
      paid: true,
      itemCount: input.quantity,
      items: [{ name: input.itemName, quantity: input.quantity, note: null }],
    },
    pickup: {
      ...pickup,
      address: 'Shop 4, Zamzama Boulevard, Clifton, Karachi',
      name: 'Friends Kitchen Clifton',
      phone: '+92 21 3583 0001',
      note: `Collect order ${input.orderNumber}`,
    },
    dropoff: {
      latitude: dropLat,
      longitude: pickup.longitude,
      address: input.dropoffAddress,
      name: null,
      phone: null,
      note: null,
    },
    branchId: 'fk-clifton',
    distanceKm: input.distanceKm,
    notes: input.notes.trim() || null,
  };
}

export const foodpandaApi = {
  /**
   * Is the agent up, and is its brain configured?
   *
   * Turns a network error into a typed answer: "it is down" is a state this
   * page renders, not an exception it has to handle.
   */
  health: async (): Promise<FoodpandaHealth | null> => {
    try {
      return await unwrap<FoodpandaHealth>(await fetch(`${FOODPANDA_BASE}/api/foodpanda/health`));
    } catch {
      return null;
    }
  },

  /** The agent's own card — what it says it is, before anyone asks it for anything. */
  card: async (): Promise<AgentCard | null> => {
    try {
      const response = await fetch(`${FOODPANDA_BASE}/.well-known/agent-card.json`);
      if (!response.ok) return null;
      return (await response.json()) as AgentCard;
    } catch {
      return null;
    }
  },

  /** Everything on the board, newest first. */
  jobs: async (): Promise<Job[]> => {
    try {
      const data = await unwrap<{ items: Job[] }>(
        await fetch(`${FOODPANDA_BASE}/api/foodpanda/jobs`),
      );
      return data.items;
    } catch {
      return [];
    }
  },

  job: async (jobId: string): Promise<Job | null> => {
    try {
      return await unwrap<Job>(await fetch(`${FOODPANDA_BASE}/api/foodpanda/jobs/${jobId}`));
    } catch {
      return null;
    }
  },

  /** Send a delivery request by hand, as the ordering agent would. */
  sendTestRequest: async (input: TestRequestInput): Promise<Job> => {
    let response: Response;
    try {
      response = await fetch(`${FOODPANDA_BASE}/api/foodpanda/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testMessage(input)),
      });
    } catch {
      throw new Error(FOODPANDA_OFFLINE);
    }
    return unwrap<Job>(response);
  },

  /**
   * Ask for a rider on an accepted job.
   *
   * The dispatcher is sitting inside `assign_rider` waiting for exactly this, so
   * what comes back is the job as it stands the instant the request lands —
   * still `accepted`. The rider itself arrives on the stream a moment later,
   * which is why this returns nothing worth rendering and the caller does not
   * patch the board from it.
   *
   * A 409 is a real answer, not a glitch: the job is not waiting for a rider,
   * usually because this page was left open while somebody else moved it on.
   */
  findRider: async (jobId: string): Promise<void> => {
    await unwrap<Job>(
      await fetch(`${FOODPANDA_BASE}/api/foodpanda/jobs/${jobId}/find-rider`, {
        method: 'POST',
      }),
    );
  },

  /** Ask for the collected order to be taken out to the customer. */
  deliver: async (jobId: string): Promise<void> => {
    await unwrap<Job>(
      await fetch(`${FOODPANDA_BASE}/api/foodpanda/jobs/${jobId}/deliver`, {
        method: 'POST',
      }),
    );
  },

  cancel: async (jobId: string): Promise<void> => {
    try {
      await fetch(`${FOODPANDA_BASE}/api/foodpanda/jobs/${jobId}/cancel`, { method: 'POST' });
    } catch {
      // Already unreachable — nothing useful left to do from here.
    }
  },

  /**
   * Follow one delivery. Returns the unsubscribe function.
   *
   * The server closes the stream after `end`, and an EventSource that is not
   * explicitly closed reconnects for ever — so `end` closes it from this side.
   */
  subscribe: (
    jobId: string,
    onEvent: (event: FoodpandaEvent) => void,
    onError: (message: string) => void,
  ): (() => void) => {
    const source = new EventSource(`${FOODPANDA_BASE}/api/foodpanda/jobs/${jobId}/events`);
    let finished = false;

    source.onmessage = (message) => {
      let event: FoodpandaEvent;
      try {
        event = JSON.parse(message.data) as FoodpandaEvent;
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
      onError('Lost the connection to the delivery agent.');
    };

    return () => {
      finished = true;
      source.close();
    };
  },
};
