/**
 * The control centre's model: every line anyone on this floor said, in one shape.
 *
 * Three streams arrive here and none of them agree about anything. The ordering
 * console and the A2A desk mirror their runs onto the shared bus (see
 * `src/shared/agentBus.ts`), which gives events with a real `from` and `to`. The
 * delivery dispatcher, this page can read directly — it publishes a per-job SSE
 * stream anybody may subscribe to — but those events say only "the dispatcher
 * did a thing", with no counterpart on them at all.
 *
 * So this file does two jobs and nothing else:
 *
 *   1. Normalise. Everything becomes a `MonitorEvent`, so one renderer draws
 *      the lot and a fourth agent added later needs no new component.
 *   2. Derive direction where the wire does not carry it. A dispatcher calling
 *      `assign_rider` is the dispatcher talking to the courier; calling
 *      `read_delivery_request` is it reading what the merchant sent. That is not
 *      a guess, it is what those tools do — and it is the difference between a
 *      log and a picture of a conversation.
 *
 * What this file will not do is fill a gap. If nothing is on the bus, the
 * derivations below return empty and the dashboard says the floor is quiet.
 * There is no seed data in this file and there must never be: the entire value
 * of an operations board is that what is on it happened.
 */

import type { Actor, BusEvent, BusKind, BusStatus } from '@/shared/agentBus';
import type { FeedRow } from './types';

export type { Actor, BusKind, BusStatus };

/** One thing that happened, whichever stream it arrived on. */
export interface MonitorEvent {
  id: string;
  at: number;
  channel: 'ordering' | 'a2a' | 'delivery';
  correlationId: string;
  ref: string;
  from: Actor;
  to: Actor | null;
  kind: BusKind;
  title: string;
  detail?: string;
  ok?: boolean;
  status: BusStatus;
  toolName?: string;
  data?: Record<string, unknown>;
}

// --------------------------------------------------------------------------- //
// Who everyone is
// --------------------------------------------------------------------------- //

export interface ActorMeta {
  id: Actor;
  name: string;
  /** The one-word form, for arrows and chips where the full name will not fit. */
  short: string;
  glyph: string;
  /** What it is, said plainly — three of these are not agents. */
  role: string;
  /**
   * `agent` is a worker with a model or a state machine of its own; `service` is
   * something that gets called and never initiates; `person` is the operator.
   *
   * Drawn differently on every surface in the control centre, because an
   * operations board that renders the REST API as a peer of the buying agent is
   * teaching its reader something false about the system.
   */
  sort: 'agent' | 'service' | 'person';
  href?: string;
}

export const ACTORS: Record<Actor, ActorMeta> = {
  operator: {
    id: 'operator',
    name: 'You',
    short: 'Operator',
    glyph: '👤',
    role: 'The person who sent the errand',
    sort: 'person',
  },
  ordering: {
    id: 'ordering',
    name: 'Ordering agent',
    short: 'Ordering',
    glyph: '🤖',
    role: 'Reads the errand, picks a branch, fills the cart and pays',
    sort: 'agent',
    href: '/',
  },
  buyer: {
    id: 'buyer',
    name: 'Buying agent',
    short: 'Buyer',
    glyph: '🧾',
    role: 'Speaks for the customer in the agent-to-agent negotiation',
    sort: 'agent',
    href: '/a2a.html',
  },
  merchant: {
    id: 'merchant',
    name: 'Ordering desk',
    short: 'Merchant',
    glyph: '🤝',
    role: 'Answers for the restaurant — quotes, confirms, charges',
    sort: 'agent',
    href: '/a2a.html',
  },
  dispatcher: {
    id: 'dispatcher',
    name: 'Foodpanda dispatcher',
    short: 'Dispatcher',
    glyph: '🛵',
    role: 'Decides whether to take a delivery, then runs it to the door',
    sort: 'agent',
    href: '/foodpanda.html',
  },
  courier: {
    id: 'courier',
    name: 'Courier',
    short: 'Courier',
    glyph: '🏍️',
    role: 'Carries the order — a rider, or the in-house fallback',
    sort: 'agent',
    href: '/foodpanda.html',
  },
  kitchen: {
    id: 'kitchen',
    name: 'Friends Kitchen API',
    short: 'Kitchen',
    glyph: '🍔',
    role: 'The restaurant itself — menu, cart, orders, payment',
    sort: 'service',
  },
};

/**
 * An actor name we are willing to render, from one we might not be.
 *
 * The bus persists to `localStorage`, which means today's dashboard reads
 * yesterday's build's events. If a future version of a console publishes an
 * actor this one has never heard of, every component that does `ACTORS[from]`
 * would dereference `undefined` and take the page down — over a log entry.
 * Unknown names are folded onto the operator, which is the one party that is
 * always in the room, and the row still carries its own text.
 */
function known(id: string): Actor {
  return id in ACTORS ? (id as Actor) : 'operator';
}

// --------------------------------------------------------------------------- //
// Normalising the dispatcher's stream
// --------------------------------------------------------------------------- //

/**
 * Who the dispatcher is talking to when it calls each of its tools.
 *
 * Read off `agent/foodpanda/tools.py`: two of these reach the restaurant, three
 * are instructions to a rider, and `read_delivery_request` is the dispatcher
 * reading the handover the merchant sent it. Anything unlisted is drawn as the
 * dispatcher working alone, which is the honest default — better a missing
 * arrow than a wrong one.
 */
const DISPATCHER_REACHES: Record<string, Actor> = {
  read_delivery_request: 'merchant',
  assign_rider: 'courier',
  collect_from_restaurant: 'kitchen',
  deliver_to_customer: 'courier',
};

const FEED_KIND: Record<FeedRow['kind'], BusKind> = {
  tool: 'tool_call',
  result: 'tool_result',
  said: 'message',
  step: 'delivery',
  waiting: 'waiting',
  error: 'error',
};

const FEED_STATUS: Record<FeedRow['kind'], BusStatus> = {
  tool: 'processing',
  result: 'done',
  said: 'active',
  step: 'active',
  waiting: 'waiting',
  error: 'error',
};

/**
 * One row of the delivery feed, in the shared shape.
 *
 * The dispatcher's stream is this page's own subscription rather than something
 * a console mirrored, which is why these are converted here and not published
 * onto the bus: putting them on the bus would double every delivery row for
 * anybody with the delivery console open in a second tab.
 */
export function fromFeedRow(row: FeedRow): MonitorEvent {
  const reach = row.toolName ? DISPATCHER_REACHES[row.toolName] : undefined;
  const isResult = row.kind === 'result';
  const bad = row.kind === 'error' || row.ok === false;

  return {
    id: `feed-${row.id}`,
    at: row.at,
    channel: 'delivery',
    correlationId: row.jobId ?? row.orderNumber,
    ref: row.orderNumber,
    // A result comes back *from* whoever was called; a call goes out to them.
    from: isResult ? (reach ?? 'dispatcher') : 'dispatcher',
    to: isResult ? 'dispatcher' : (reach ?? null),
    kind: FEED_KIND[row.kind],
    title: row.text,
    ok: row.ok,
    status: bad ? 'error' : FEED_STATUS[row.kind],
    toolName: row.toolName,
    data: row.stage ? { stage: row.stage } : undefined,
  };
}

/** A bus event, in the shared shape. Only `status` and the actors need care. */
export function fromBusEvent(event: BusEvent): MonitorEvent {
  return {
    ...event,
    from: known(event.from),
    to: event.to === null || event.to === undefined ? null : known(event.to),
    status: event.status ?? (event.ok === false ? 'error' : 'active'),
    // A run with no correlation still has to group somewhere, or it lands in a
    // conversation keyed `undefined` alongside every other stray.
    correlationId: event.correlationId || event.id,
    ref: event.ref || '—',
  };
}

/**
 * Every stream, merged and in order.
 *
 * Sorted by timestamp with the id as the tie-break, because two events landing
 * in the same millisecond is routine on a replayed backlog and an unstable sort
 * makes a log that reshuffles itself under the reader.
 */
export function merge(bus: BusEvent[], feed: FeedRow[]): MonitorEvent[] {
  const all = [...bus.map(fromBusEvent), ...feed.map(fromFeedRow)];
  return all.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

// --------------------------------------------------------------------------- //
// Filters
// --------------------------------------------------------------------------- //

export type FilterId =
  | 'all'
  | 'messages'
  | 'negotiation'
  | 'api'
  | 'tools'
  | 'orders'
  | 'delivery'
  | 'errors';

export const FILTERS: { id: FilterId; label: string; glyph: string; hint: string }[] = [
  { id: 'all', label: 'Everything', glyph: '◎', hint: 'Every event, in order' },
  { id: 'messages', label: 'Agent messages', glyph: '💬', hint: 'One agent speaking to another' },
  { id: 'negotiation', label: 'Negotiation', glyph: '🤝', hint: 'Turns, quotes and receipts' },
  { id: 'api', label: 'API calls', glyph: '🔌', hint: 'Anything that reached a service' },
  { id: 'tools', label: 'Tool calls', glyph: '🔧', hint: 'Tools the models invoked' },
  { id: 'orders', label: 'Orders', glyph: '🧾', hint: 'Created, confirmed, paid' },
  { id: 'delivery', label: 'Delivery', glyph: '🛵', hint: 'Handover, rider, doorstep' },
  { id: 'errors', label: 'Errors', glyph: '⚠️', hint: 'Failures and refusals' },
];

/** Is this event in that bucket? One predicate, so the chips and the counts agree. */
export function matches(event: MonitorEvent, filter: FilterId): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'messages':
      return (
        event.kind === 'message' ||
        event.kind === 'handshake' ||
        event.kind === 'run_started' ||
        event.kind === 'run_finished'
      );
    case 'negotiation':
      // Agent to agent only. A tool call is an agent talking to a machine, and
      // folding those in here is what turns a readable negotiation back into a
      // log — which is the thing this view exists to not be.
      return (
        (event.kind === 'message' &&
          ACTORS[event.from].sort === 'agent' &&
          event.to !== null &&
          ACTORS[event.to].sort === 'agent') ||
        event.kind === 'artifact'
      );
    case 'api':
      return (
        (event.kind === 'tool_call' || event.kind === 'tool_result') &&
        (event.from === 'kitchen' || event.to === 'kitchen')
      );
    case 'tools':
      return event.kind === 'tool_call' || event.kind === 'tool_result';
    case 'orders':
      return event.kind === 'order' || event.kind === 'artifact';
    case 'delivery':
      return event.kind === 'delivery' || event.from === 'courier' || event.to === 'courier';
    case 'errors':
      return event.kind === 'error' || event.ok === false;
  }
}

/** How many events each chip would show. Rendered on the chip, so nobody guesses. */
export function tally(events: MonitorEvent[]): Record<FilterId, number> {
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, 0])) as Record<FilterId, number>;
  for (const event of events) {
    for (const filter of FILTERS) {
      if (matches(event, filter.id)) counts[filter.id] += 1;
    }
  }
  return counts;
}

// --------------------------------------------------------------------------- //
// Conversations
// --------------------------------------------------------------------------- //

/** How long after its last event a run is assumed to have stopped, in ms. */
const STALE_MS = 45_000;

export interface Conversation {
  id: string;
  ref: string;
  channel: MonitorEvent['channel'];
  startedAt: number;
  lastAt: number;
  events: MonitorEvent[];
  /** Everyone who appeared at either end of a line in this run. */
  participants: Actor[];
  /** Still going: nothing has closed it and something happened recently. */
  live: boolean;
  /** How it ended, or what it is doing — one line, for the list. */
  headline: string;
  outcome: 'running' | 'done' | 'failed';
}

/**
 * The events grouped into runs, newest run first.
 *
 * A "conversation" is one `correlationId` — one errand, one negotiation, one
 * delivery. Grouping is the whole trick to making this screen readable: three
 * orders being worked at once is three legible stories, or one interleaved
 * column that nobody can follow.
 */
export function conversations(events: MonitorEvent[], now: number): Conversation[] {
  const groups = new Map<string, MonitorEvent[]>();
  for (const event of events) {
    const list = groups.get(event.correlationId);
    if (list) list.push(event);
    else groups.set(event.correlationId, [event]);
  }

  const out: Conversation[] = [];
  for (const [id, list] of groups) {
    const last = list[list.length - 1];
    const failed = list.some((event) => event.kind === 'error');
    const finished = list.some((event) => event.kind === 'run_finished');
    const settled =
      finished ||
      failed ||
      list.some((event) => event.kind === 'delivery' && /delivered/i.test(event.title));

    const participants: Actor[] = [];
    for (const event of list) {
      if (!participants.includes(event.from)) participants.push(event.from);
      if (event.to && !participants.includes(event.to)) participants.push(event.to);
    }

    const live = !settled && now - last.at < STALE_MS;

    out.push({
      id,
      // The newest label wins: a run that started as a run id and later learned
      // its order number should be listed under the number.
      ref: list[list.length - 1].ref,
      channel: last.channel,
      startedAt: list[0].at,
      lastAt: last.at,
      events: list,
      participants,
      live,
      headline: last.title,
      outcome: failed ? 'failed' : finished || settled ? 'done' : 'running',
    });
  }

  return out.sort((a, b) => b.lastAt - a.lastAt);
}

// --------------------------------------------------------------------------- //
// Links — who called whom
// --------------------------------------------------------------------------- //

export interface Link {
  key: string;
  from: Actor;
  to: Actor;
  count: number;
  lastAt: number;
  lastTitle: string;
  /** Something crossed this line in the last few seconds. */
  hot: boolean;
  errors: number;
}

/** How recently a line has to have carried something to count as hot, in ms. */
const HOT_MS = 12_000;

/**
 * Every pair of parties that exchanged anything, busiest first.
 *
 * Direction is kept: `buyer → merchant` and `merchant → buyer` are two lines,
 * not one, because "the merchant has stopped answering" is a thing this view
 * should be able to show and a symmetric edge cannot.
 */
export function links(events: MonitorEvent[], now: number): Link[] {
  const map = new Map<string, Link>();

  for (const event of events) {
    if (event.to === null) continue;
    const key = `${event.from}→${event.to}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      if (event.at >= existing.lastAt) {
        existing.lastAt = event.at;
        existing.lastTitle = event.title;
      }
      if (event.kind === 'error' || event.ok === false) existing.errors += 1;
    } else {
      map.set(key, {
        key,
        from: event.from,
        to: event.to,
        count: 1,
        lastAt: event.at,
        lastTitle: event.title,
        hot: false,
        errors: event.kind === 'error' || event.ok === false ? 1 : 0,
      });
    }
  }

  return [...map.values()]
    .map((link) => ({ ...link, hot: now - link.lastAt < HOT_MS }))
    .sort((a, b) => b.lastAt - a.lastAt);
}

// --------------------------------------------------------------------------- //
// What each party is doing right now
// --------------------------------------------------------------------------- //

export interface ActorActivity {
  id: Actor;
  /** The last thing it did, in its own words. Null if it has done nothing. */
  task: string | null;
  /** Who it was talking to when it did. */
  facing: Actor | null;
  /** Which run that was part of. */
  ref: string | null;
  at: number | null;
  status: BusStatus | null;
  /** How many lines it has sent in the window on screen. */
  sent: number;
  received: number;
  errors: number;
  /** It has done something in the last few seconds. */
  hot: boolean;
}

/**
 * Each party's last word, and how much it has been saying.
 *
 * Deliberately separate from the roster's health-poll state. The roster answers
 * "is the process up"; this answers "is it *doing* anything, and what". A
 * service can be up and silent, and an operator staring at a screen that says
 * `idle` needs to be able to tell that apart from one that has been mid-sentence
 * for four minutes.
 */
export function activity(events: MonitorEvent[], now: number): Record<Actor, ActorActivity> {
  const blank = (id: Actor): ActorActivity => ({
    id,
    task: null,
    facing: null,
    ref: null,
    at: null,
    status: null,
    sent: 0,
    received: 0,
    errors: 0,
    hot: false,
  });

  const out = Object.fromEntries(
    (Object.keys(ACTORS) as Actor[]).map((id) => [id, blank(id)]),
  ) as Record<Actor, ActorActivity>;

  for (const event of events) {
    const speaker = out[event.from];
    if (speaker) {
      speaker.sent += 1;
      if (event.at >= (speaker.at ?? 0)) {
        speaker.at = event.at;
        speaker.task = event.title;
        speaker.facing = event.to;
        speaker.ref = event.ref;
        speaker.status = event.status;
      }
      if (event.kind === 'error' || event.ok === false) speaker.errors += 1;
    }
    if (event.to) {
      const heard = out[event.to];
      if (heard) heard.received += 1;
    }
  }

  for (const id of Object.keys(out) as Actor[]) {
    out[id].hot = out[id].at !== null && now - out[id].at! < HOT_MS;
  }

  return out;
}

// --------------------------------------------------------------------------- //
// The one-line summary above everything
// --------------------------------------------------------------------------- //

export interface Pulse {
  events: number;
  /** Runs still going. */
  live: number;
  errors: number;
  /** Distinct parties that have said anything. */
  talking: number;
  /** Events in the last minute — the number that says "is it moving". */
  perMinute: number;
  lastAt: number | null;
}

export function pulse(events: MonitorEvent[], runs: Conversation[], now: number): Pulse {
  const speakers = new Set<Actor>();
  let errors = 0;
  let recent = 0;

  for (const event of events) {
    speakers.add(event.from);
    if (event.kind === 'error' || event.ok === false) errors += 1;
    if (now - event.at < 60_000) recent += 1;
  }

  return {
    events: events.length,
    live: runs.filter((run) => run.live).length,
    errors,
    talking: speakers.size,
    perMinute: recent,
    lastAt: events.length === 0 ? null : events[events.length - 1].at,
  };
}

/** `just now`, `12s ago`, `4m ago` — the form a live board wants. */
export function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 3) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/** The clock, to the second — a control centre counts in seconds, not minutes. */
export function stamp(at: number): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
