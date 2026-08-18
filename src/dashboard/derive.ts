/**
 * Everything the dashboard shows, worked out from what the services said.
 *
 * Pure functions over plain data, kept apart from the polling and apart from
 * the drawing. Three reasons, and the third is the one that matters: a number on
 * an operations board is a claim, and a claim should be readable in one place
 * without a component or a `useEffect` around it.
 *
 * The rule every function here follows is that nothing is rounded *up*. A job
 * that reached `in_transit` counts towards `in_transit` and not towards
 * `delivered`; a service that cannot say how much work it is holding reports
 * null rather than zero. The delivery agent spells `delivered` out as its own
 * boolean for exactly this reason, and a dashboard is the last place to start
 * blurring it — the whole value of the screen is that the numbers on it can be
 * trusted at a glance.
 */

import type { AgentHealth } from '@/types';
import type { A2AHealth } from '../a2a/types';
import type { FoodpandaHealth } from '../foodpanda/types';
import type { CourierHealth } from './api';
import type {
  AgentId,
  AgentState,
  AgentView,
  Assignment,
  Job,
  Owner,
  Point,
  Row,
  Sample,
} from './types';

// --------------------------------------------------------------------------- //
// Time
// --------------------------------------------------------------------------- //

/** The ranges the toolbar offers. `null` is everything the services still hold. */
export type Lookback = 15 | 60 | 360 | null;

export const LOOKBACKS: { value: Lookback; label: string }[] = [
  { value: 15, label: '15 min' },
  { value: 60, label: '1 hour' },
  { value: 360, label: '6 hours' },
  { value: null, label: 'Everything' },
];

/** Epoch ms, or NaN — every timestamp on the wire is an ISO string. */
function at(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * The jobs the current range covers.
 *
 * A job that arrived before the window but has not finished stays in: it is
 * still on the floor, and a board that hid live work because it started an hour
 * ago would be hiding exactly the job somebody is looking for.
 */
export function inLookback(jobs: Job[], lookback: Lookback, now: number): Job[] {
  if (lookback === null) return jobs;
  const floor = now - lookback * 60_000;
  return jobs.filter((job) => !job.done || at(job.createdAt) >= floor);
}

/** `2m 40s`, `40s`, `1h 12m` — a duration a person reads rather than parses. */
export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) {
    const rest = whole % 60;
    return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** The clock time, which is what an operator actually scans a list for. */
export function clock(ms: number): string {
  const date = new Date(ms);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** The middle value, or null for an empty set — never 0, which would read as fast. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// --------------------------------------------------------------------------- //
// The roster
// --------------------------------------------------------------------------- //

/**
 * One agent's state from one service's health.
 *
 * The order of the tests is the order of the questions an operator asks: is it
 * there, can it run, is it doing something. Reversing any two of them produces a
 * roster that says "idle" about a process that is not running.
 */
function stateOf(reachable: boolean, ready: boolean, busy: boolean): AgentState {
  if (!reachable) return 'offline';
  if (!ready) return 'blocked';
  return busy ? 'working' : 'idle';
}

interface Healths {
  ordering: AgentHealth | null;
  a2a: A2AHealth | null;
  courier: CourierHealth | null;
  dispatcher: FoodpandaHealth | null;
}

/**
 * The five workers, in the order work flows through them.
 *
 * Not the order the services were written in, and not alphabetical: an operator
 * reading down this list should be walking the same path an order walks, so that
 * a hold-up is found by reading downwards rather than by hunting.
 */
export function roster(healths: Healths, jobs: Job[]): AgentView[] {
  const { ordering, a2a, courier, dispatcher } = healths;

  // What the dispatcher is actually carrying, from the board rather than from
  // its own count — the two agree, and the board is the one this page can also
  // break down by stage.
  const live = jobs.filter((job) => !job.done);
  const withDispatcher = live.filter((job) => owner(job) === 'dispatcher').length;
  const withRider = live.filter((job) => owner(job) === 'rider').length;

  return [
    {
      id: 'ordering',
      name: 'Ordering agent',
      glyph: '🤖',
      role: 'Reads the errand, picks the branch, fills the cart and pays',
      port: 8100,
      state: stateOf(ordering !== null, ordering?.hasApiKey === true, ordering?.busy === true),
      problem:
        ordering === null
          ? 'Not answering on 8100.'
          : !ordering.hasApiKey
            ? (ordering.credentialProblem ?? 'No usable model credentials.')
            : !ordering.restaurantApi
              ? 'Friends Kitchen is not answering on 8000 — it can run, but it cannot order.'
              : null,
      brain: ordering ? `${ordering.provider} · ${ordering.model}` : null,
      // Null rather than 0: the errand server keeps its runs in memory and
      // publishes no list of them, so "one errand or none" is the whole truth
      // available here and a count would be a guess dressed as a fact.
      holding: null,
      holdingNote: 'Runs one errand at a time · no queue published',
      href: '/',
    },
    {
      id: 'buyer',
      name: 'Buying agent',
      glyph: '🧾',
      role: 'Speaks for the customer in an agent-to-agent negotiation',
      port: 8101,
      state: stateOf(a2a !== null, a2a?.buyer.ready === true, a2a?.busy === true),
      problem: a2a === null ? 'Not answering on 8101.' : (a2a.buyer.problem ?? null),
      brain: a2a ? `${a2a.buyer.provider} · ${a2a.buyer.model}` : null,
      holding: null,
      holdingNote: 'One negotiation at a time · no queue published',
      href: '/a2a.html',
    },
    {
      id: 'merchant',
      name: 'Ordering desk',
      glyph: '🤝',
      role: 'Answers the buyer for the restaurant — quotes, confirms, charges',
      port: 8101,
      state: stateOf(a2a !== null, a2a?.merchant.ready === true, a2a?.busy === true),
      problem:
        a2a === null
          ? 'Not answering on 8101.'
          : (a2a.merchant.problem ?? (a2a.restaurantApi ? null : 'Friends Kitchen is not answering on 8000.')),
      brain: a2a ? `${a2a.merchant.provider} · ${a2a.merchant.model}` : null,
      holding: null,
      holdingNote: a2a?.merchant.hands
        ? `Works the restaurant through its ${a2a.merchant.hands}`
        : 'One negotiation at a time · no queue published',
      href: '/a2a.html',
    },
    {
      id: 'dispatcher',
      name: 'Foodpanda dispatcher',
      glyph: '🛵',
      role: 'Decides whether to take a delivery, then runs it to the door',
      port: 8103,
      state: stateOf(
        dispatcher !== null,
        dispatcher?.dispatcher.ready === true,
        (dispatcher?.activeJobs ?? 0) > 0,
      ),
      problem:
        dispatcher === null ? 'Not answering on 8103.' : (dispatcher.dispatcher.problem ?? null),
      brain: dispatcher
        ? `${dispatcher.dispatcher.provider} · ${dispatcher.dispatcher.model}`
        : null,
      holding: dispatcher === null ? null : withDispatcher + withRider,
      holdingNote:
        dispatcher === null
          ? 'Unknown — the service is not answering'
          : `${withDispatcher} on its desk · ${withRider} on the road`,
      href: '/foodpanda.html',
    },
    {
      id: 'courier',
      name: 'In-house courier',
      glyph: '🏍️',
      role: 'The fallback rider — a state machine on a clock, no model involved',
      port: 8102,
      state: stateOf(courier !== null, true, (courier?.activeJobs ?? 0) > 0),
      problem: courier === null ? 'Not answering on 8102.' : null,
      // Deliberately null, not "none": this worker has no model, and printing a
      // provider row of dashes beside four that have one invites the reading
      // that its brain failed to load.
      brain: null,
      holding: courier?.activeJobs ?? null,
      holdingNote: courier
        ? `${courier.totalJobs} taken in since it started`
        : 'Unknown — the service is not answering',
      href: '/foodpanda.html',
    },
  ];
}

// --------------------------------------------------------------------------- //
// Who is holding what
// --------------------------------------------------------------------------- //

/**
 * Who a job is sitting with, from `status` and `awaiting` together.
 *
 * Neither field says it alone, and that is the point of this function. An
 * `accepted` job belongs to the dispatcher while it is hunting for a rider and
 * to *you* the moment it starts waiting to be asked for one — same status, two
 * completely different answers to "is anything going to happen if I walk away".
 */
export function owner(job: Job): Owner {
  if (job.done) return 'settled';
  if (job.awaiting !== null) return 'operator';
  switch (job.status) {
    case 'requested':
    case 'accepted':
      return 'dispatcher';
    case 'courier_assigned':
    case 'picked_up':
    case 'in_transit':
      return 'rider';
    default:
      return 'dispatcher';
  }
}

const DOING: Record<Owner, (job: Job) => string> = {
  operator: (job) =>
    job.awaiting === 'rider' ? 'Waiting to be asked for a rider' : 'Waiting to be sent out',
  dispatcher: (job) =>
    job.status === 'requested' ? 'Reading the request and deciding' : 'Finding a rider',
  rider: (job) =>
    job.status === 'courier_assigned'
      ? 'Riding to the restaurant'
      : job.status === 'picked_up'
        ? 'Order collected'
        : 'Carrying it to the customer',
  settled: (job) => job.message,
};

/** Every job with the name of whoever it is waiting on, newest first. */
export function assignments(jobs: Job[], now: number): Assignment[] {
  return jobs.map((job) => {
    const who = owner(job);
    const created = at(job.createdAt);
    return {
      job,
      owner: who,
      doing: DOING[who](job),
      ageSeconds: Number.isNaN(created) ? 0 : Math.max(0, (now - created) / 1000),
      stuck: who === 'operator',
    };
  });
}

// --------------------------------------------------------------------------- //
// Arrivals
// --------------------------------------------------------------------------- //

/**
 * Requests per bucket, over the range on screen.
 *
 * Buckets are fixed at 30 across whatever the range is, so the chart's shape
 * means the same thing at every zoom level and the columns never get so thin
 * they stop being marks. Empty buckets are emitted rather than skipped — a gap
 * where nothing arrived is information, and a chart that closes its gaps turns
 * a quiet hour into a busy one.
 */
export function arrivals(jobs: Job[], lookback: Lookback, now: number): { points: Point[]; bucketMs: number } {
  const spanMs =
    lookback !== null
      ? lookback * 60_000
      : Math.max(
          15 * 60_000,
          now -
            Math.min(
              ...jobs.map((job) => at(job.createdAt)).filter((ms) => !Number.isNaN(ms)),
              now,
            ),
        );

  const buckets = 30;
  const bucketMs = Math.max(1000, Math.round(spanMs / buckets));
  const start = now - bucketMs * buckets;

  const points: Point[] = Array.from({ length: buckets }, (_, index) => ({
    t: start + index * bucketMs,
    value: 0,
  }));

  for (const job of jobs) {
    const ms = at(job.createdAt);
    if (Number.isNaN(ms) || ms < start || ms > now) continue;
    const index = Math.min(buckets - 1, Math.floor((ms - start) / bucketMs));
    points[index].value += 1;
  }

  return { points, bucketMs };
}

// --------------------------------------------------------------------------- //
// The funnel
// --------------------------------------------------------------------------- //

/**
 * The six stages a delivery passes through, in order, and how many got there.
 *
 * Read from each job's own timeline rather than from its current status, so a
 * job that has reached the door still counts towards every stage it passed on
 * the way. Counted that way the bars can only ever descend, and any step where
 * they descend sharply is where work is being lost — which is the single
 * question this chart exists to answer.
 */
const STAGES: { key: string; label: string }[] = [
  { key: 'requested', label: 'Taken in' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'courier_assigned', label: 'Rider assigned' },
  { key: 'picked_up', label: 'Collected' },
  { key: 'in_transit', label: 'On the way' },
  { key: 'delivered', label: 'Delivered' },
];

export function funnel(jobs: Job[]): Row[] {
  return STAGES.map(({ key, label }) => ({
    key,
    label,
    value: jobs.filter((job) => job.timeline.some((step) => step.status === key)).length,
    // Only the last stage is green, for the same reason the delivery board's
    // pills follow that rule: the difference between "nearly there" and "there"
    // is the one this product must never blur.
    tone: key === 'delivered' ? ('good' as const) : ('work' as const),
  }));
}

// --------------------------------------------------------------------------- //
// Where the time goes
// --------------------------------------------------------------------------- //

/**
 * The median time a job spends *in* each stage.
 *
 * Taken from consecutive `elapsedSeconds` in the timeline, so it includes any
 * stretch a job spent waiting for an operator to press something. That is not a
 * flaw in the measurement, it is the measurement: on a board where two steps are
 * gated by a person, "how long does a delivery take" and "how long does the
 * agent take" are different questions, and this chart answers the first one.
 */
export function stageTimes(jobs: Job[]): Row[] {
  const collected = new Map<string, number[]>();

  for (const job of jobs) {
    const steps = job.timeline;
    for (let index = 0; index < steps.length - 1; index += 1) {
      const spent = steps[index + 1].elapsedSeconds - steps[index].elapsedSeconds;
      if (!Number.isFinite(spent) || spent < 0) continue;
      const list = collected.get(steps[index].status) ?? [];
      list.push(spent);
      collected.set(steps[index].status, list);
    }
  }

  return STAGES.slice(0, -1)
    .map(({ key, label }) => {
      const samples = collected.get(key) ?? [];
      const middle = median(samples);
      return {
        key,
        label,
        value: middle ?? 0,
        note: samples.length === 0 ? 'no samples yet' : `median of ${samples.length}`,
        tone: 'work' as const,
      };
    })
    .filter((row) => row.note !== 'no samples yet');
}

// --------------------------------------------------------------------------- //
// Results
// --------------------------------------------------------------------------- //

/**
 * How the settled jobs ended.
 *
 * Only jobs that are actually finished are counted. A live delivery has no
 * outcome yet, and folding it into "not delivered" would make every busy
 * afternoon look like a failing one.
 */
export function outcomes(jobs: Job[]): Row[] {
  const done = jobs.filter((job) => job.done);
  const count = (status: string) => done.filter((job) => job.status === status).length;

  // Short labels, with the detail in `note` where the readout and the table can
  // carry it. "Refused by the dispatcher" is the truer wording and it is also
  // three characters wider than the label column, which would put it under the
  // first bar — and a clipped label is worse than a terse one.
  return [
    { key: 'delivered', label: 'Delivered', value: count('delivered'), tone: 'good' as const },
    {
      key: 'rejected',
      label: 'Refused',
      note: 'the dispatcher would not take it',
      value: count('rejected'),
      tone: 'bad' as const,
    },
    {
      key: 'failed',
      label: 'Failed',
      note: 'taken on, then could not be done',
      value: count('failed'),
      tone: 'bad' as const,
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      note: 'called off by an operator',
      value: count('cancelled'),
      tone: 'idle' as const,
    },
  ];
}

// --------------------------------------------------------------------------- //
// The headline numbers
// --------------------------------------------------------------------------- //

export interface Kpis {
  takenIn: number;
  inFlight: number;
  delivered: number;
  waiting: number;
  /** Median seconds from request to doorstep, or null with nothing delivered. */
  doorstep: number | null;
  /** Delivered as a share of settled, or null with nothing settled. */
  successRate: number | null;
  settled: number;
  /** Agents answering, and agents that should be. */
  agentsUp: number;
  agentsTotal: number;
}

export function kpis(jobs: Job[], agents: AgentView[]): Kpis {
  const done = jobs.filter((job) => job.done);
  const delivered = jobs.filter((job) => job.delivered);

  const doorstep = median(
    delivered
      .map((job) => job.timeline.find((step) => step.status === 'delivered')?.elapsedSeconds)
      .filter((seconds): seconds is number => typeof seconds === 'number'),
  );

  return {
    takenIn: jobs.length,
    inFlight: jobs.filter((job) => !job.done).length,
    delivered: delivered.length,
    waiting: jobs.filter((job) => !job.done && job.awaiting !== null).length,
    doorstep,
    successRate: done.length === 0 ? null : delivered.length / done.length,
    settled: done.length,
    agentsUp: agents.filter((agent) => agent.state !== 'offline').length,
    agentsTotal: agents.length,
  };
}

// --------------------------------------------------------------------------- //
// The activity strips
// --------------------------------------------------------------------------- //

/**
 * One agent's recent states, oldest first, padded to a fixed width.
 *
 * The pad is what stops the strip growing from the left as samples accumulate:
 * a fresh page shows a mostly-empty track that fills up, rather than three fat
 * cells that shrink for the next ten minutes. Missing samples are their own
 * value — the strip draws them as nothing, because "this page was not open yet"
 * is not the same claim as "the agent was idle".
 */
export function strip(samples: Sample[], id: AgentId, width: number): (AgentState | null)[] {
  const recent = samples.slice(-width).map((sample) => sample.states[id] ?? null);
  return [...Array<AgentState | null>(Math.max(0, width - recent.length)).fill(null), ...recent];
}

/** What share of the sampled time an agent spent working. Null with no samples. */
export function utilisation(samples: Sample[], id: AgentId): number | null {
  const seen = samples.filter((sample) => sample.states[id] !== undefined);
  if (seen.length === 0) return null;
  return seen.filter((sample) => sample.states[id] === 'working').length / seen.length;
}
