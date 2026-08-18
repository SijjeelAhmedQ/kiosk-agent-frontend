/**
 * Every service at once — the one client on this floor that reads all four.
 *
 * The other three consoles each own a service and are careful not to touch the
 * others. This page is the exception, and deliberately so: an operations board
 * that could only see one agent would be a fourth copy of a console rather than
 * a view of the floor. What it is *not* allowed to do is write. Every call in
 * this file is a `GET`, plus the one `EventSource` the feed listens on — nothing
 * here starts, cancels or nudges anything. The consoles keep the controls; this
 * page keeps the overview.
 *
 * Every read answers `null` (or an empty list) instead of throwing. "That
 * service is not running" is the most common state a dashboard is in, and it is
 * a thing to render, not an exception to handle.
 */

import type { AgentHealth } from '@/types';
import type { A2AHealth } from '../a2a/types';
import type { FoodpandaEvent, FoodpandaHealth, Job } from '../foodpanda/types';

/**
 * The four addresses, same environment variables the consoles use.
 *
 * Re-declared here rather than imported from the consoles' own `api.ts` for the
 * reason those files give: a port is a fact about the deployment, not code, and
 * importing one console's module into another would couple two apps that are
 * separate on purpose. Same variable names, so a moved port still moves once.
 */
export const ORDERING_BASE =
  (import.meta.env.VITE_AGENT_BASE_URL as string | undefined) ?? 'http://localhost:8100';
export const A2A_BASE =
  (import.meta.env.VITE_A2A_BASE_URL as string | undefined) ?? 'http://localhost:8101';
export const COURIER_BASE =
  (import.meta.env.VITE_DELIVERY_BASE_URL as string | undefined) ?? 'http://localhost:8102';
export const FOODPANDA_BASE =
  (import.meta.env.VITE_FOODPANDA_BASE_URL as string | undefined) ?? 'http://localhost:8103';

interface Envelope<T> {
  success?: boolean;
  data?: T;
  detail?: string;
}

/** A read that treats every failure — network, status, shape — as "not there". */
async function read<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const payload = (await response.json()) as Envelope<T>;
    if (payload.success === false) return null;
    return payload.data ?? null;
  } catch {
    return null;
  }
}

/** The in-house courier on 8102 — a state machine, so this is all it reports. */
export interface CourierHealth {
  delivery: string;
  service: string;
  activeJobs: number;
  totalJobs: number;
}

export const dashboardApi = {
  ordering: () => read<AgentHealth>(`${ORDERING_BASE}/api/agent/health`),
  a2a: () => read<A2AHealth>(`${A2A_BASE}/api/a2a/health`),
  courier: () => read<CourierHealth>(`${COURIER_BASE}/api/delivery/health`),
  dispatcher: () => read<FoodpandaHealth>(`${FOODPANDA_BASE}/api/foodpanda/health`),

  /**
   * The delivery board, newest first — the one real work queue on this floor.
   *
   * Everything with a history on this page is derived from these records. The
   * two ordering services keep their runs in memory and publish no list of them,
   * so they can say what they are doing *now* and nothing about what they did;
   * a delivery job, by contrast, arrives with its whole timeline attached. That
   * asymmetry is why the charts are all about deliveries and the roster is all
   * about live state, and why neither pretends to be the other.
   */
  jobs: async (): Promise<Job[]> => {
    const data = await read<{ items: Job[] }>(`${FOODPANDA_BASE}/api/foodpanda/jobs`);
    return data?.items ?? [];
  },

  /**
   * Follow one delivery, read-only. Returns the unsubscribe function.
   *
   * The same stream the delivery console drives its log from, subscribed to here
   * for several jobs at once. The server replays a job's backlog on connect,
   * which is what fills the feed the moment this page is opened rather than
   * leaving it blank until something new happens.
   */
  follow: (jobId: string, onEvent: (event: FoodpandaEvent) => void): (() => void) => {
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

    // No error callback: one job's stream dropping is not worth a banner on a
    // page whose whole job is to survive services coming and going. The board
    // poll underneath will notice if the service itself has gone.
    source.onerror = () => {
      if (!finished) source.close();
    };

    return () => {
      finished = true;
      source.close();
    };
  },
};
