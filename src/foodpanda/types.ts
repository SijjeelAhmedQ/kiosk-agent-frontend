/**
 * What the Foodpanda delivery agent on 8103 sends, in TypeScript.
 *
 * Hand-written against the service rather than generated, the way the errand
 * and A2A consoles are, and narrowed to what this page actually reads. The one
 * field worth staring at is `delivered`: the service spells it out as its own
 * boolean instead of leaving it implicit in `status`, because `in_transit` and
 * `delivered` are one word apart and a board that rounds the first up to the
 * second tells someone their food has arrived when it has not.
 */

/** Every status a job can be in. `delivered` is the only success. */
export type DeliveryStatus =
  | 'requested'
  | 'accepted'
  | 'courier_assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'rejected'
  | 'failed'
  | 'cancelled';

export interface Place {
  latitude: number;
  longitude: number;
  address: string;
  name: string | null;
  phone: string | null;
  note: string | null;
}

export interface Item {
  name: string;
  quantity: number;
  note: string | null;
}

/** One entry in the job's history: a status, and what was said at the time. */
export interface Step {
  status: DeliveryStatus;
  message: string;
  at: string;
  elapsedSeconds: number;
}

/**
 * The step a job is holding at, waiting to be asked for.
 *
 * The dispatcher decides whether to take a delivery; these two are the
 * customer's to ask for — finding a rider, and sending the food out — and while
 * one of them is waiting, the delivery genuinely has not moved. Null means
 * nothing is waiting on anybody.
 */
export type AwaitingStep = 'rider' | 'delivery' | null;

export interface Job {
  jobId: string;
  orderId: string;
  orderNumber: string;
  status: DeliveryStatus;
  /** The food is in the customer's hands. Only ever true for `delivered`. */
  delivered: boolean;
  /** Nothing more will happen to this job — delivered, refused, failed, called off. */
  done: boolean;
  /** Which request this job is waiting for, if it is waiting for one. */
  awaiting: AwaitingStep;
  /**
   * The customer asked for this to be delivered to them when they ordered.
   *
   * Sent by the ordering agent on the request itself — its console's "Where it
   * goes" switch — and it means exactly one thing here: the `delivery` gate was
   * already open when the job landed, so this job will never sit at `awaiting:
   * 'delivery'`.
   *
   * Nothing on the board hangs on it any more, now that the gate is answered by
   * `useDeliveryBoard` rather than by a button: a job that arrives without this
   * reaches the gate and is let through the moment it does. It is still shown,
   * as the difference between a delivery the customer asked for and one this
   * board consented to on their behalf. Optional: an older delivery agent does
   * not report it.
   */
  whereItGoes?: boolean;
  message: string;
  /** Why the dispatcher took the job or would not. Its own words. */
  decision: string | null;
  courier: { name: string } | null;
  etaMinutes: number | null;
  etaSeconds: number | null;
  /** Null until the job is accepted, and null for ever if it is refused. */
  fee: string | null;
  trackingUrl: string;
  pickup: Place;
  dropoff: Place;
  items: Item[];
  itemCount: number;
  distanceKm: number | null;
  notes: string | null;
  branchId: string | null;
  createdAt: string;
  timeline: Step[];
  finalText: string;
  error: string | null;
}

export interface FoodpandaHealth {
  foodpanda: string;
  service: string;
  dispatcher: {
    provider: string;
    model: string;
    ready: boolean;
    problem: string | null;
  };
  radiusKm: number;
  legSeconds: { pickup: number; transit: number };
  /**
   * Whether a job waits to be asked for a rider and for the delivery.
   *
   * Optional: an older delivery agent does not gate anything, and a board that
   * assumed it did would show two buttons nothing was ever waiting for.
   */
  operatorSteps?: boolean;
  activeJobs: number;
  totalJobs: number;
}

/** The agent card, as far as this page reads it. */
export interface AgentCard {
  name: string;
  description: string;
  version: string;
  skills: { id: string; name: string; description: string }[];
  'x-service'?: {
    radiusKm: number;
    dispatcherModel: string;
    simulation: string;
  };
}

// --------------------------------------------------------------------------- //
// The stream
// --------------------------------------------------------------------------- //
export type FoodpandaEvent =
  | ({ type: 'status'; job: Job } & Step)
  /**
   * The job started waiting for a request, or stopped waiting for one.
   *
   * `step` names what it is waiting for, and null means the wait is over. It is
   * not a status event: nothing about where the delivery has got to has
   * changed, which is exactly what the row in the log should say.
   */
  | { type: 'awaiting'; step: AwaitingStep; message: string; at: string; job: Job }
  | { type: 'tool'; speaker: string; toolUseId: string; name: string }
  | {
      type: 'tool_result';
      speaker: string;
      toolUseId: string;
      ok: boolean;
      summary: string;
      detail: Record<string, unknown> | null;
    }
  | { type: 'say'; speaker: string; text: string }
  | { type: 'error'; message: string }
  | { type: 'end' };

/**
 * One row in the dispatcher's log.
 *
 * Tool calls fold into a strip while they are consecutive and split the moment
 * the agent says something, so the log reads as "it did these three things,
 * then it said this" rather than as a flat list of everything that happened.
 */
export type LogRow =
  | {
      kind: 'tools';
      calls: { toolUseId: string; name: string; ok: boolean | null; summary: string | null }[];
    }
  | { kind: 'said'; text: string }
  | { kind: 'step'; step: Step }
  /** Waiting on a request, or released by one. `step` null means released. */
  | { kind: 'waiting'; step: AwaitingStep; message: string }
  | { kind: 'error'; message: string };
