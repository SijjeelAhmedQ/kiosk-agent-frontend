/**
 * The four questions the control centre could not answer yet, worked out from
 * the same events it already has.
 *
 * `monitor.ts` normalises three streams into one shape and groups them into
 * conversations. That is enough to *read* the floor and not enough to audit it,
 * because four of the things an operator asks are about structure the raw log
 * only implies:
 *
 *   · **Was this task handed over, and did anybody take it?** A handover is not
 *     an event type on any of these wires. It is an agent talking to another
 *     agent about work that then becomes the second one's — which is a shape in
 *     the log, not a field, and `handovers()` below finds it.
 *   · **What was called, what came back, and how long did it take?** The wire
 *     sends a call and a result as two unrelated rows. Pairing them is what turns
 *     a log into a latency figure.
 *   · **What stage is this task at?** Not a status field anywhere — the services
 *     here each have their own vocabulary — but readable from which kinds of
 *     event have happened, in order.
 *   · **Show me only this.** One predicate over agent, kind, status, time and
 *     free text, so every surface in the panel filters identically.
 *
 * The rule from `monitor.ts` carries over unchanged and matters more here,
 * because everything below is inference: **nothing in this file invents an
 * event.** Every derived object holds the real events it was read from, and each
 * one is reachable from the UI. If a handover's status says "accepted", the row
 * that proves it is one click away. Where the log cannot support a claim the
 * answer is null and the screen says so — a handover nobody has answered yet is
 * `pending`, never optimistically `accepted`.
 */

import type { BusStatus } from '@/shared/agentBus';
import {
  ACTORS,
  matches,
  type Actor,
  type Conversation,
  type FilterId,
  type MonitorEvent,
} from './monitor';

// --------------------------------------------------------------------------- //
// Handovers
// --------------------------------------------------------------------------- //

/**
 * How a handover is going.
 *
 * Six states, and the two that look alike are the two that matter most.
 * `pending` means the receiver has not said a word since it was asked —
 * something to chase. `accepted` means it has. A board that showed one as the
 * other would be hiding the single failure mode a multi-agent floor has that a
 * single agent does not: work handed to somebody who never picked it up.
 */
export type HandoverStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'failed';

export const HANDOVER_LOOK: Record<
  HandoverStatus,
  { label: string; glyph: string; tone: 'work' | 'good' | 'bad' | 'idle' }
> = {
  pending: { label: 'Pending', glyph: '◷', tone: 'idle' },
  accepted: { label: 'Accepted', glyph: '✓', tone: 'work' },
  in_progress: { label: 'In progress', glyph: '◐', tone: 'work' },
  completed: { label: 'Completed', glyph: '✓', tone: 'good' },
  rejected: { label: 'Rejected', glyph: '⊘', tone: 'bad' },
  failed: { label: 'Failed', glyph: '✕', tone: 'bad' },
};

export interface Handover {
  id: string;
  /** When the work was offered. */
  at: number;
  /** `assignment` is a person giving an agent work; `handover` is agent to agent. */
  sort: 'assignment' | 'handover';
  from: Actor;
  to: Actor;
  /** The run this happened inside, and what that run is called. */
  correlationId: string;
  ref: string;
  channel: MonitorEvent['channel'];
  /** Why, in the words of whoever handed it over. Never a phrase this file made up. */
  reason: string;
  detail?: string;
  status: HandoverStatus;
  /** The first thing the receiver did afterwards — the proof of acceptance. */
  acceptedAt: number | null;
  acceptedWith: string | null;
  /** How long the receiver took to answer, in ms. Null while nobody has. */
  answerMs: number | null;
  /** How it ended, if it has. */
  settledAt: number | null;
  settledWith: string | null;
  /** The events this was read from — the request, and any confirmation of it. */
  events: MonitorEvent[];
  /** What was happening immediately before, and what followed. */
  before: MonitorEvent[];
  after: MonitorEvent[];
  /**
   * Another conversation this handover opened.
   *
   * A merchant handing an order to the courier creates a *delivery job*, which
   * is a run of its own with its own id — so the story continues in a different
   * conversation. Following that link is the difference between "handed over"
   * and "handed over, and here is what happened next".
   */
  linkedId: string | null;
}

/**
 * The tools whose whole purpose is to give work to somebody else.
 *
 * Read off the three services rather than guessed: `hand_to_delivery` and
 * `arrange_delivery` are how an ordering agent passes a paid order to a courier,
 * and `assign_rider` is how the dispatcher puts a job on a bike. A tool that
 * merely *reads* something belonging to another party — `read_delivery_request`
 * — is deliberately not here: reading a handover is not performing one, and
 * counting it would draw the arrow backwards.
 */
const HANDOVER_TOOLS = new Set(['hand_to_delivery', 'arrange_delivery', 'assign_rider']);

/** Does this event carry work from one party to another? */
function handoverSort(event: MonitorEvent): Handover['sort'] | null {
  if (event.to === null || event.to === event.from) return null;

  const to = ACTORS[event.to];
  const from = ACTORS[event.from];

  // A person handing an agent an errand. Not agent-to-agent, but it is the first
  // row of every task's ownership history and the drawer needs it there.
  if (event.kind === 'run_started' && from.sort === 'person' && to.sort === 'agent') {
    return 'assignment';
  }

  if (from.sort !== 'agent' || to.sort !== 'agent') return null;

  // A result travels back down the wire the request went up; counting it would
  // register a second handover in the opposite direction.
  if (event.kind === 'tool_result') return null;

  if (event.kind === 'delivery') return 'handover';
  if (event.toolName && HANDOVER_TOOLS.has(event.toolName)) return 'handover';
  return null;
}

/** Refused by the receiver, or broken on the way? Different problems, different fixes. */
function badly(events: MonitorEvent[]): 'rejected' | 'failed' {
  const refused = events.some((event) =>
    /refus|reject|declin|would not|won't|no rider|unavailable|out of range/i.test(
      `${event.title} ${event.detail ?? ''}`,
    ),
  );
  return refused ? 'rejected' : 'failed';
}

/** The `jobId` a handover opened, when the service put one in the payload. */
function linkedRun(events: MonitorEvent[]): string | null {
  for (const event of events) {
    const id = event.data?.jobId;
    if (typeof id === 'string' && id.trim()) return id;
  }
  return null;
}

/**
 * Every handover on the floor, newest first.
 *
 * Two events describing one handover are folded into one row. The A2A desk emits
 * the merchant's `hand_to_delivery` call *and*, when the payment result comes
 * back carrying a delivery, a second row saying it was taken — which is one
 * handover requested and then confirmed, not two handovers. They are collapsed
 * per wire per run: the first event is when the work was offered, and the later
 * ones resolve it. That is also exactly how the brief reads the sequence
 * ("handover requested" then "accepted"), and it keeps the count honest.
 */
export function handovers(events: MonitorEvent[], runs: Conversation[]): Handover[] {
  const byRun = new Map<string, MonitorEvent[]>();
  for (const event of events) {
    const list = byRun.get(event.correlationId);
    if (list) list.push(event);
    else byRun.set(event.correlationId, [event]);
  }

  const outcomeOf = new Map(runs.map((run) => [run.id, run]));

  // One entry per wire per run, in the order the wires were first used.
  const groups = new Map<string, { sort: Handover['sort']; events: MonitorEvent[] }>();
  for (const event of events) {
    const sort = handoverSort(event);
    if (!sort) continue;
    const key = `${event.correlationId}|${event.from}→${event.to}`;
    const group = groups.get(key);
    if (group) group.events.push(event);
    else groups.set(key, { sort, events: [event] });
  }

  const out: Handover[] = [];

  for (const [key, group] of groups) {
    const first = group.events[0];
    const receiver = first.to!;
    const siblings = byRun.get(first.correlationId) ?? [];

    // A refusal travels as an `error` on the same wire rather than as another
    // handover, so it is picked up here rather than by the predicate above —
    // which must stay narrow, or every failure between two agents would register
    // as a transfer of work that never happened.
    const refusals = siblings.filter(
      (event) =>
        event.at >= first.at &&
        event.from === first.from &&
        event.to === receiver &&
        (event.kind === 'error' || event.ok === false) &&
        !group.events.includes(event),
    );
    group.events.push(...refusals);
    group.events.sort((a, b) => a.at - b.at);

    const linkedId = linkedRun(group.events);
    const linked = linkedId ? (byRun.get(linkedId) ?? []) : [];

    // What the receiver did once it had the work. Its own events in this run,
    // plus the run the handover opened — a courier's job is a conversation of
    // its own and "what happened after the handover" lives there.
    const afterInRun = siblings.filter((event) => event.at >= first.at && event.id !== first.id);
    const answered = afterInRun.find((event) => event.from === receiver);
    const fromLinked = linked.filter((event) => event.at >= first.at);
    const answeredElsewhere = fromLinked[0] ?? null;

    const accepted = answered ?? answeredElsewhere;
    const failedEvent = group.events.find(
      (event) => event.kind === 'error' || event.ok === false,
    );

    // Finished: the run the work went into reached a real end, or the food
    // reached a door — but only counted *after* the receiver answered. Which
    // party narrates the ending does not matter (the dispatcher announces the
    // doorstep, not the rider); whether anybody picked the work up does, so a
    // handover nobody answered can never be read as completed by something that
    // finished around it.
    const linkedRunView = linkedId ? outcomeOf.get(linkedId) : undefined;
    const settledEvent =
      accepted === undefined || accepted === null
        ? null
        : ([...afterInRun, ...fromLinked]
            .filter(
              (event) =>
                event.at >= accepted.at &&
                (event.kind === 'run_finished' ||
                  (event.kind === 'delivery' &&
                    /delivered|dropped off|handed to the customer/i.test(event.title))),
            )
            .sort((a, b) => a.at - b.at)
            .pop() ?? null);

    let status: HandoverStatus;
    if (failedEvent) {
      status = badly(group.events);
    } else if (accepted && (settledEvent || linkedRunView?.outcome === 'done')) {
      status = 'completed';
    } else if (accepted) {
      const busy =
        [...afterInRun, ...fromLinked].filter((event) => event.from === receiver).length > 1;
      status = busy ? 'in_progress' : 'accepted';
    } else {
      status = 'pending';
    }

    // The confirmation row, where there is one, is the better sentence: "Handed
    // to the courier — accepted" says more than the tool call that asked.
    const confirmation = group.events.length > 1 ? group.events[group.events.length - 1] : null;

    out.push({
      id: key,
      at: first.at,
      sort: group.sort,
      from: first.from,
      to: receiver,
      correlationId: first.correlationId,
      ref: first.ref,
      channel: first.channel,
      reason: confirmation?.title ?? first.title,
      detail: confirmation?.detail ?? first.detail,
      status,
      acceptedAt: accepted?.at ?? null,
      acceptedWith: accepted?.title ?? null,
      answerMs: accepted ? Math.max(0, accepted.at - first.at) : null,
      settledAt: settledEvent?.at ?? null,
      settledWith: settledEvent?.title ?? null,
      events: group.events,
      before: siblings.filter((event) => event.at < first.at).slice(-3),
      after: [...afterInRun, ...fromLinked].sort((a, b) => a.at - b.at).slice(0, 6),
      linkedId,
    });
  }

  // Newest first, and a live one is what somebody is looking for.
  return out.sort((a, b) => (b.settledAt ?? b.at) - (a.settledAt ?? a.at) || b.at - a.at);
}

/** Is this handover still waiting on somebody? Used for the "needs a look" count. */
export function unanswered(handover: Handover, now: number): boolean {
  return handover.status === 'pending' && now - handover.at > 8_000;
}

// --------------------------------------------------------------------------- //
// Calls, paired with their answers
// --------------------------------------------------------------------------- //

export interface ApiCall {
  id: string;
  at: number;
  /** Null while the call is still out. */
  endedAt: number | null;
  /** Round trip in ms, null until it comes back. */
  durationMs: number | null;
  /** Who made the call, and what it reached. */
  actor: Actor;
  target: Actor | null;
  tool: string;
  title: string;
  /** What came back, in the responder's own words. */
  answer: string | null;
  request?: Record<string, unknown>;
  /** The result payload as it was stored — JSON where the service sent JSON. */
  response?: string;
  ok: boolean | null;
  correlationId: string;
  ref: string;
  channel: MonitorEvent['channel'];
  callEvent: MonitorEvent;
  resultEvent: MonitorEvent | null;
}

/** Everything that reached a service or another agent's tool, with its answer. */
export function apiCalls(events: MonitorEvent[]): ApiCall[] {
  const pending = new Map<string, ApiCall>();
  const out: ApiCall[] = [];

  const key = (event: MonitorEvent) => `${event.correlationId}|${event.toolName ?? '·'}`;

  for (const event of events) {
    const isCall =
      Boolean(event.toolName) &&
      (event.kind === 'tool_call' ||
        event.kind === 'order' ||
        event.kind === 'delivery' ||
        event.kind === 'artifact');

    if (isCall) {
      const call: ApiCall = {
        id: event.id,
        at: event.at,
        endedAt: null,
        durationMs: null,
        actor: event.from,
        target: event.to,
        tool: event.toolName!,
        title: event.title,
        answer: null,
        request: event.data,
        ok: null,
        correlationId: event.correlationId,
        ref: event.ref,
        channel: event.channel,
        callEvent: event,
        resultEvent: null,
      };
      out.push(call);
      // One outstanding call per tool per run. Each of these agents runs its
      // tools one at a time, so the newest unanswered call is the right one to
      // pair with — and pairing the wrong one would invent a latency figure.
      pending.set(key(event), call);
      continue;
    }

    if (event.kind !== 'tool_result' || !event.toolName) continue;

    const call = pending.get(key(event));
    if (!call) {
      // An answer with no call on this page — the call fell off the ring, or a
      // console opened mid-run. Kept as its own row rather than dropped: the
      // payload is still evidence, it just has no duration.
      out.push({
        id: event.id,
        at: event.at,
        endedAt: event.at,
        durationMs: null,
        actor: event.to ?? event.from,
        target: event.from,
        tool: event.toolName,
        title: event.title,
        answer: event.title,
        response: event.detail,
        ok: event.ok ?? null,
        correlationId: event.correlationId,
        ref: event.ref,
        channel: event.channel,
        callEvent: event,
        resultEvent: event,
      });
      continue;
    }

    call.endedAt = event.at;
    call.durationMs = Math.max(0, event.at - call.at);
    call.answer = event.title;
    call.response = event.detail;
    call.ok = event.ok ?? (event.status === 'error' ? false : true);
    call.resultEvent = event;
    pending.delete(key(event));
  }

  return out.sort((a, b) => b.at - a.at);
}

/** The median round trip, in ms. Median rather than mean — one stuck call is not the story. */
export function medianDuration(calls: ApiCall[]): number | null {
  const timings = calls
    .map((call) => call.durationMs)
    .filter((ms): ms is number => typeof ms === 'number')
    .sort((a, b) => a - b);
  if (timings.length === 0) return null;
  const middle = Math.floor(timings.length / 2);
  return timings.length % 2 === 1
    ? timings[middle]
    : Math.round((timings[middle - 1] + timings[middle]) / 2);
}

/** `342ms`, `1.4s`, `2m 05s` — the precision an execution time is read at. */
export function millis(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

// --------------------------------------------------------------------------- //
// The task's own lifecycle
// --------------------------------------------------------------------------- //

export type StageKey =
  | 'created'
  | 'assigned'
  | 'processing'
  | 'communicating'
  | 'handover'
  | 'accepted'
  | 'executing'
  | 'settled';

export interface Stage {
  key: StageKey;
  label: string;
  /** What this stage means, in one line — the timeline is also documentation. */
  note: string;
  at: number;
  /** Who was responsible while the task sat here. */
  actor: Actor;
  facing: Actor | null;
  /** The event that opened the stage, and everything that happened inside it. */
  head: MonitorEvent;
  events: MonitorEvent[];
  /** How long the task spent here. Null for the stage it is still in. */
  durationMs: number | null;
  state: 'done' | 'current' | 'failed';
}

/** The first event matching a test, or null — the whole of the machinery below. */
function firstOf(
  events: MonitorEvent[],
  test: (event: MonitorEvent) => boolean,
  after = 0,
): MonitorEvent | null {
  return events.find((event) => event.at >= after && test(event)) ?? null;
}

/**
 * One task's stages, in the order it actually passed through them.
 *
 * Stages that did not happen are not drawn. That is the whole design: a
 * lifecycle diagram with six greyed-out future steps teaches an operator to
 * read past the greys, and the one thing this component must communicate is
 * *where the task is now*. What did not happen yet is said once, at the end, in
 * words.
 *
 * Every stage carries the events it was read from, so clicking one shows the
 * evidence rather than a description of the evidence.
 */
export function lifecycle(run: Conversation | null): Stage[] {
  if (!run || run.events.length === 0) return [];
  const events = run.events;

  const marks: { key: StageKey; label: string; note: string; event: MonitorEvent | null }[] = [];

  const opening = events[0];
  marks.push({
    key: 'created',
    label: 'Created',
    note: 'the task entered the floor',
    event: opening,
  });

  // Ownership, not machinery: a tool call that happens to reach another agent is
  // the owner *working*, not the task being assigned. Without this test the
  // dispatcher reading the merchant's request would be drawn as the moment the
  // task was assigned to the merchant, which is the arrow backwards.
  const assigned = firstOf(
    events,
    (event) =>
      event.to !== null &&
      ACTORS[event.to].sort === 'agent' &&
      event.kind !== 'tool_call' &&
      event.kind !== 'tool_result',
  );
  marks.push({ key: 'assigned', label: 'Assigned', note: 'an agent took ownership', event: assigned });

  const processing = firstOf(events, (event) => event.kind === 'tool_call' || event.kind === 'order');
  marks.push({
    key: 'processing',
    label: 'Processing',
    note: 'the owner started calling tools',
    event: processing,
  });

  const talking = firstOf(
    events,
    (event) =>
      event.kind === 'message' &&
      event.to !== null &&
      ACTORS[event.from].sort === 'agent' &&
      ACTORS[event.to].sort === 'agent',
  );
  marks.push({
    key: 'communicating',
    label: 'Agent communication',
    note: 'two agents exchanged messages',
    event: talking,
  });

  const handed = firstOf(events, (event) => handoverSort(event) === 'handover');
  marks.push({
    key: 'handover',
    label: 'Handover',
    note: 'the work was passed to another agent',
    event: handed,
  });

  const takenUp = handed?.to
    ? firstOf(events, (event) => event.from === handed.to, handed.at + 1)
    : null;
  marks.push({
    key: 'accepted',
    label: 'New agent accepted',
    note: 'the receiver answered and started work',
    event: takenUp,
  });

  const executing = firstOf(
    events,
    (event) => event.kind === 'delivery' || event.from === 'courier' || event.to === 'courier',
    handed ? handed.at : 0,
  );
  marks.push({
    key: 'executing',
    label: 'Execution',
    note: 'the delivery itself',
    event: executing,
  });

  const failure = events.find((event) => event.kind === 'error');
  const finish = events.find(
    (event) =>
      event.kind === 'run_finished' ||
      (event.kind === 'delivery' && /delivered/i.test(event.title)),
  );
  marks.push({
    key: 'settled',
    label: failure && !finish ? 'Failed' : 'Completed',
    note: failure && !finish ? 'the task ended badly' : 'the task finished',
    event: finish ?? failure ?? null,
  });

  // Only stages that happened, in time order, deduped — two marks can land on
  // the same event on a short run and drawing it twice would fake a step.
  const seen = new Set<string>();
  const kept = marks
    .filter((mark): mark is typeof mark & { event: MonitorEvent } => mark.event !== null)
    .filter((mark) => {
      if (seen.has(mark.event.id)) return false;
      seen.add(mark.event.id);
      return true;
    })
    .sort((a, b) => a.event.at - b.event.at);

  return kept.map((mark, index) => {
    const next = kept[index + 1];
    const inside = events.filter(
      (event) => event.at >= mark.event.at && (!next || event.at < next.event.at),
    );
    const failed = inside.some((event) => event.kind === 'error' || event.ok === false);

    return {
      key: mark.key,
      label: mark.label,
      note: mark.note,
      at: mark.event.at,
      actor: mark.event.from,
      facing: mark.event.to,
      head: mark.event,
      events: inside,
      durationMs: next ? next.event.at - mark.event.at : null,
      state: failed ? 'failed' : next ? 'done' : run.live ? 'current' : 'done',
    };
  });
}

// --------------------------------------------------------------------------- //
// One filter, every surface
// --------------------------------------------------------------------------- //

export interface Query {
  /** Free text over everything an event carries, including its payload. */
  text: string;
  agent: Actor | 'all';
  kind: FilterId;
  status: BusStatus | 'all';
  /** Minutes back, or null for everything the page is holding. */
  minutes: number | null;
}

export const EMPTY_QUERY: Query = { text: '', agent: 'all', kind: 'all', status: 'all', minutes: null };

export const WINDOWS: { label: string; minutes: number | null }[] = [
  { label: 'Last 5 min', minutes: 5 },
  { label: 'Last 15 min', minutes: 15 },
  { label: 'Last hour', minutes: 60 },
  { label: 'Everything', minutes: null },
];

export const STATUSES: { value: BusStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'active', label: 'Active' },
  { value: 'processing', label: 'Processing' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Completed' },
  { value: 'error', label: 'Error' },
];

export function isNarrowed(query: Query): boolean {
  return (
    query.text.trim() !== '' ||
    query.agent !== 'all' ||
    query.kind !== 'all' ||
    query.status !== 'all' ||
    query.minutes !== null
  );
}

/**
 * Everything one event can be found by.
 *
 * Built to answer the searches an operator actually types: a task id, an order
 * number, a request id, an agent's name, half a sentence they remember, a tool
 * name. The payload is included — a delivery id only ever appears inside the
 * JSON, and a search that could not find `DEL-8291` because it is a value rather
 * than a label would be a search nobody uses twice.
 */
function haystack(event: MonitorEvent): string {
  let payload = '';
  if (event.data) {
    try {
      payload = JSON.stringify(event.data);
    } catch {
      payload = '';
    }
  }
  return [
    event.title,
    event.detail ?? '',
    event.ref,
    event.correlationId,
    event.toolName ?? '',
    event.kind,
    event.channel,
    ACTORS[event.from].name,
    event.to ? ACTORS[event.to].name : '',
    payload,
  ]
    .join(' ')
    .toLowerCase();
}

/** One event against one query. Every surface calls this, so they cannot disagree. */
export function hits(event: MonitorEvent, query: Query, now: number): boolean {
  if (!matches(event, query.kind)) return false;
  if (query.agent !== 'all' && event.from !== query.agent && event.to !== query.agent) return false;
  if (query.status !== 'all' && event.status !== query.status) return false;
  if (query.minutes !== null && now - event.at > query.minutes * 60_000) return false;

  const needle = query.text.trim().toLowerCase();
  if (!needle) return true;
  // Space-separated terms are ANDed, so "courier failed" narrows rather than
  // widening — which is what people expect from a search box and almost never
  // what a naive `includes` of the whole string does.
  return needle.split(/\s+/).every((term) => haystack(event).includes(term));
}

export function applyQuery(events: MonitorEvent[], query: Query, now: number): MonitorEvent[] {
  return events.filter((event) => hits(event, query, now));
}

/** A handover matches when the events behind it do — one search, every tab. */
export function handoverHits(handover: Handover, query: Query, now: number): boolean {
  if (query.agent !== 'all' && handover.from !== query.agent && handover.to !== query.agent) {
    return false;
  }
  if (query.minutes !== null && now - handover.at > query.minutes * 60_000) return false;
  const needle = query.text.trim().toLowerCase();
  if (!needle) return true;
  const text = [
    handover.ref,
    handover.correlationId,
    handover.reason,
    handover.detail ?? '',
    ACTORS[handover.from].name,
    ACTORS[handover.to].name,
    handover.status,
  ]
    .join(' ')
    .toLowerCase();
  return needle.split(/\s+/).every((term) => text.includes(term));
}

/** A call matches the same way, over the fields a call is looked up by. */
export function callHits(call: ApiCall, query: Query, now: number): boolean {
  if (query.agent !== 'all' && call.actor !== query.agent && call.target !== query.agent) {
    return false;
  }
  if (query.minutes !== null && now - call.at > query.minutes * 60_000) return false;
  if (query.status === 'error' && call.ok !== false) return false;
  if (query.status === 'done' && call.ok !== true) return false;
  if (query.status === 'processing' && call.resultEvent !== null) return false;

  const needle = query.text.trim().toLowerCase();
  if (!needle) return true;
  const text = [
    call.tool,
    call.title,
    call.answer ?? '',
    call.response ?? '',
    call.ref,
    call.correlationId,
    ACTORS[call.actor].name,
    call.target ? ACTORS[call.target].name : '',
  ]
    .join(' ')
    .toLowerCase();
  return needle.split(/\s+/).every((term) => text.includes(term));
}

// --------------------------------------------------------------------------- //
// The numbers along the top
// --------------------------------------------------------------------------- //

export interface OpsMetrics {
  /** Agents that have said something in the last few seconds. */
  activeAgents: number;
  agentsSeen: number;
  activeTasks: number;
  tasks: number;
  completed: number;
  failed: number;
  conversations: number;
  handovers: number;
  handoversOpen: number;
  calls: number;
  callsFailed: number;
  medianCallMs: number | null;
}

/** How recently a party must have spoken to count as active, in ms. */
const HOT_MS = 12_000;

export function metrics(
  events: MonitorEvent[],
  runs: Conversation[],
  moves: Handover[],
  calls: ApiCall[],
  now: number,
): OpsMetrics {
  const spokenAt = new Map<Actor, number>();
  for (const event of events) {
    if (ACTORS[event.from].sort !== 'agent') continue;
    spokenAt.set(event.from, Math.max(spokenAt.get(event.from) ?? 0, event.at));
  }

  // A conversation is "active" while two agents are still exchanging turns in
  // it — which is not the same as a live run, and is the number the brief asks
  // for under that name.
  const talking = runs.filter(
    (run) =>
      run.live &&
      run.events.some(
        (event) =>
          event.kind === 'message' &&
          event.to !== null &&
          ACTORS[event.from].sort === 'agent' &&
          ACTORS[event.to].sort === 'agent',
      ),
  ).length;

  return {
    activeAgents: [...spokenAt.values()].filter((at) => now - at < HOT_MS).length,
    agentsSeen: spokenAt.size,
    activeTasks: runs.filter((run) => run.live).length,
    tasks: runs.length,
    completed: runs.filter((run) => run.outcome === 'done').length,
    failed: runs.filter((run) => run.outcome === 'failed').length,
    conversations: talking,
    handovers: moves.length,
    handoversOpen: moves.filter(
      (move) => move.status === 'pending' || move.status === 'accepted' || move.status === 'in_progress',
    ).length,
    calls: calls.length,
    callsFailed: calls.filter((call) => call.ok === false).length,
    medianCallMs: medianDuration(calls),
  };
}

// --------------------------------------------------------------------------- //
// Ownership
// --------------------------------------------------------------------------- //

export interface Ownership {
  actor: Actor;
  from: number;
  /** Null while this is the current owner. */
  until: number | null;
  /** How they came to hold it — the handover's own words, or "opened the task". */
  because: string;
  /**
   * Who performed the transfer, when that was not the previous owner.
   *
   * On this floor the party that hands an order to the courier is often the
   * merchant, while the run itself belongs to the buyer — so "handed over by"
   * and "handed over from" are genuinely two different parties, and collapsing
   * them would put a transfer in the wrong agent's history.
   */
  by: Actor | null;
}

/**
 * Who has held this task, in order.
 *
 * Read from the handovers rather than from a field, because no service on this
 * floor records ownership: an order's current owner is whoever it was last
 * handed to, and the chain of those is the answer to "where did this go".
 */
export function ownership(run: Conversation | null, moves: Handover[]): Ownership[] {
  if (!run) return [];
  const mine = moves
    .filter((move) => move.correlationId === run.id)
    .sort((a, b) => a.at - b.at);

  const chain: Ownership[] = [];
  const opener = run.events[0];
  if (opener) {
    const first =
      opener.to && ACTORS[opener.to].sort === 'agent' ? opener.to : opener.from;
    chain.push({ actor: first, from: opener.at, until: null, because: 'opened the task', by: null });
  }

  for (const move of mine) {
    // A refused transfer did not move anything. Drawing it in the ownership
    // chain would say the courier held an order it never accepted.
    if (move.status === 'rejected' || move.status === 'failed') continue;
    const previous = chain[chain.length - 1];
    if (previous && previous.actor === move.to) continue;
    if (previous) previous.until = move.at;
    chain.push({
      actor: move.to,
      from: move.at,
      until: null,
      because: move.reason,
      by: previous && previous.actor !== move.from ? move.from : null,
    });
  }

  return chain;
}
