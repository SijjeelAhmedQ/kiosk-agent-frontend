/**
 * What the models cost — worked out from the same log the rest of this page reads.
 *
 * Read this before reading anything else in here, because it is the one fact
 * that shapes every line below: **no service on this floor reports its token
 * usage.** The errand server, the A2A desk and the dispatcher each hold a model
 * and none of them puts an `input_tokens` on the wire, in a health payload, or
 * anywhere else an observer can reach. There is no usage endpoint to call.
 *
 * So there are three honest things this file could do, and it does the third:
 *
 *   · print nothing, and leave an operator with no idea what the floor spends;
 *   · invent a number, which is what a "usage dashboard" with no usage feed
 *     always ends up doing;
 *   · **estimate, from text this page has actually seen, and say so everywhere.**
 *
 * The estimate is built the same way the handovers in `ops.ts` are: nothing is
 * invented, every figure is traceable to real events, and where the log cannot
 * support a claim the answer is null and the screen says so rather than
 * rendering a plausible zero.
 *
 * ── How a turn is found ────────────────────────────────────────────────────
 *
 * A *turn* is one exchange with a model: some text went in, some text came out.
 * The log does not label them, but it shows both halves:
 *
 *   · everything addressed **to** a model-backed agent — the errand a person
 *     typed, another agent's message, a tool result coming back — is what that
 *     agent's next call had to read. It accumulates as pending input.
 *   · the moment that agent **speaks or acts** — a message, a tool call, an
 *     artifact, an order, a final answer — the model has produced something.
 *     That is the turn: its output is the text of that event, its input is
 *     everything that had accumulated since the agent's previous turn.
 *
 * Which is why the in-house courier never appears here. It has no model — it is
 * a state machine on a clock — so it has no brain in the map below and cannot
 * open a turn. A billing screen that charged for it would be describing a
 * different system than the one running.
 *
 * ── What the number is, and is not ─────────────────────────────────────────
 *
 * Tokens are estimated at four characters each, which is the usual rough ratio
 * for English prose and JSON alike. And the count only ever sees text that
 * reached this page: system prompts, tool schemas, and the conversation history
 * a model is re-sent on every turn are all invisible here and are all billed in
 * reality. **So this is a floor, not a bill.** Every surface that renders these
 * numbers says "estimated" beside them, and the drawer's last section explains
 * the method in full — because a cost figure whose derivation is hidden is worse
 * than no cost figure at all.
 */

import type { AgentHealth } from '@/types';
import type { A2AHealth } from '../a2a/types';
import type { FoodpandaHealth } from '../foodpanda/types';
import { ACTORS, type Actor, type MonitorEvent } from './monitor';
import { apiCalls } from './ops';
import type { Point } from './types';

// --------------------------------------------------------------------------- //
// What a model costs
// --------------------------------------------------------------------------- //

/** US dollars per million tokens, the unit every provider publishes in. */
export interface Rate {
  input: number;
  output: number;
}

/**
 * Published list prices, per million tokens, for the models this floor can be
 * pointed at — the defaults in `agent/config.py`, plus the rest of the Claude
 * family for a deployment that overrides `AGENT_MODEL`.
 *
 * One table, in one file, so a price change is one edit. A model that is not in
 * here is not guessed at: `rateFor` answers null, the tile says "not priced",
 * and the tokens are still counted. An unpriced model is a missing rate, not a
 * free one, and the two must never render the same.
 *
 * Claude Sonnet 5 carries a promotional rate ($2 / $10) through 31 Aug 2026;
 * the list price is used here so the estimate does not quietly get larger the
 * day the promotion ends.
 */
export const MODEL_RATES: Record<string, Rate> = {
  // Anthropic
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  // Google
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  // OpenAI
  'gpt-5': { input: 1.25, output: 10 },
  // The open-weight default, served by Groq, the Hugging Face router and
  // OpenRouter alike — same id in all three, which is why one row covers them.
  'openai/gpt-oss-120b': { input: 0.15, output: 0.75 },
};

/**
 * Providers that run on hardware you already pay for.
 *
 * Ollama is a local process: its tokens cost electricity and nothing else, and
 * a bill of $0.00 for it is a fact rather than a missing rate. Kept apart from
 * "unpriced" for exactly that reason.
 */
const LOCAL_PROVIDERS = new Set(['ollama']);

/**
 * The rate for one brain, or null when this table has never heard of the model.
 *
 * Router suffixes are trimmed first: OpenRouter's `:free` and the Hugging Face
 * router's `:groq` pin *where* a model runs, not which model it is, and leaving
 * them on would turn a priced model into an unpriced one over a routing hint.
 */
export function rateFor(provider: string, model: string): Rate | null {
  if (LOCAL_PROVIDERS.has(provider.toLowerCase())) return { input: 0, output: 0 };
  const id = model.trim().toLowerCase();
  const base = id.replace(/:[^:/]*$/, '');
  return MODEL_RATES[id] ?? MODEL_RATES[base] ?? null;
}

// --------------------------------------------------------------------------- //
// Who is running what
// --------------------------------------------------------------------------- //

export interface Brain {
  provider: string;
  model: string;
  /** Null when this file has no price for the model — never treated as zero. */
  rate: Rate | null;
  /** Can it actually run? Straight from the service's own readiness field. */
  ready: boolean;
  /** Why not, in the service's own words. */
  problem: string | null;
}

/** Only the workers that hold a model. The courier is deliberately not here. */
export type Brains = Partial<Record<Actor, Brain>>;

interface Healths {
  ordering: AgentHealth | null;
  a2a: A2AHealth | null;
  dispatcher: FoodpandaHealth | null;
}

/**
 * The four brains on the floor, read off the health endpoints.
 *
 * Same three payloads `roster()` reads, taken here as provider and model rather
 * than as the roster's one display string — a price lookup needs the two fields
 * apart, and re-splitting `"anthropic · claude-opus-5"` on a middle dot would be
 * a second place for the format to matter.
 *
 * A service that is not answering contributes no brain, so its agent's turns go
 * uncosted rather than being priced at whatever it was running last time this
 * page could see it.
 */
export function brainsFrom({ ordering, a2a, dispatcher }: Healths): Brains {
  const brains: Brains = {};

  if (ordering) {
    brains.ordering = {
      provider: ordering.provider,
      model: ordering.model,
      rate: rateFor(ordering.provider, ordering.model),
      ready: ordering.hasApiKey,
      problem: ordering.hasApiKey ? null : (ordering.credentialProblem ?? 'No usable credentials.'),
    };
  }

  if (a2a) {
    brains.buyer = {
      provider: a2a.buyer.provider,
      model: a2a.buyer.model,
      rate: rateFor(a2a.buyer.provider, a2a.buyer.model),
      ready: a2a.buyer.ready,
      problem: a2a.buyer.problem,
    };
    brains.merchant = {
      provider: a2a.merchant.provider,
      model: a2a.merchant.model,
      rate: rateFor(a2a.merchant.provider, a2a.merchant.model),
      ready: a2a.merchant.ready,
      problem: a2a.merchant.problem,
    };
  }

  if (dispatcher) {
    brains.dispatcher = {
      provider: dispatcher.dispatcher.provider,
      model: dispatcher.dispatcher.model,
      rate: rateFor(dispatcher.dispatcher.provider, dispatcher.dispatcher.model),
      ready: dispatcher.dispatcher.ready,
      problem: dispatcher.dispatcher.problem,
    };
  }

  return brains;
}

// --------------------------------------------------------------------------- //
// Counting the text
// --------------------------------------------------------------------------- //

/**
 * Characters per token.
 *
 * Four is the usual working ratio for English and for the compact JSON these
 * services pass around. It is an approximation and this file never pretends
 * otherwise — it is exported so the drawer can print the number it used rather
 * than describe it in prose.
 */
export const CHARS_PER_TOKEN = 4;

function tokensIn(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : Math.ceil(trimmed.length / CHARS_PER_TOKEN);
}

/** Everything an event carries as text — the title, the body, and the payload. */
function textOf(event: MonitorEvent): string {
  let payload = '';
  if (event.data) {
    try {
      payload = JSON.stringify(event.data);
    } catch {
      // A payload that cannot be serialised is one this page never rendered
      // either. Counting it as nothing is the same answer the log gives.
      payload = '';
    }
  }
  return `${event.title} ${event.detail ?? ''} ${payload}`;
}

/**
 * The events that mean "the model produced something".
 *
 * Narrow on purpose, and each one earns its place: a `message` is the model
 * talking, a `tool_call` is the model acting, an `artifact` is a quote or a
 * receipt it composed, an `order` is it placing one, and `run_finished` carries
 * its closing answer.
 *
 * What is *not* here matters more. `tool_result` is the wire answering, not the
 * model. `delivery` and `waiting` are lifecycle rows the dispatcher's stream
 * emits without a model being asked anything. `error` is usually the failure of
 * a call that was already counted when it went out. Counting any of them would
 * inflate every figure on the screen with turns that never happened.
 */
const SPOKEN = new Set<MonitorEvent['kind']>([
  'message',
  'tool_call',
  'artifact',
  'order',
  'run_finished',
]);

/**
 * How a turn went — and the three states are genuinely different.
 *
 * `true` is the model produced something and nothing came back bad. `false` is
 * a failure. `null` is a call that is still out: the model asked for something
 * and no answer has landed yet, which on a live floor is the most interesting
 * of the three and must not be rendered as either of the others.
 *
 * A tool call's verdict is the verdict of its *result*, which arrives as a
 * separate event some seconds later. Pairing the two is exactly what
 * `apiCalls()` already does for the technical log, so it is borrowed rather
 * than done again here — two pairings of the same wire are two chances for the
 * log and the bill to disagree about whether a call worked.
 */
function verdict(event: MonitorEvent, paired: Map<string, boolean | null>): boolean | null {
  if (event.ok !== undefined) return event.ok;
  if (event.status === 'error') return false;
  // Anything that is not a call is done the moment it is said: a message, an
  // artifact, a final answer. There is no result pending for it to be waiting on.
  if (event.kind !== 'tool_call') return true;
  return paired.has(event.id) ? (paired.get(event.id) ?? null) : null;
}

/** One exchange with a model: what went in, what came out, what it cost. */
export interface Turn {
  id: string;
  at: number;
  actor: Actor;
  provider: string;
  model: string;
  /** Estimated, both of them — see the file header. */
  input: number;
  output: number;
  tokens: number;
  /** Null when the model has no rate in `MODEL_RATES`. Never silently zero. */
  costUsd: number | null;
  /** Did the thing the model set in motion come back clean? */
  ok: boolean | null;
  /** What it did, in the words already on the wire. */
  title: string;
  tool: string | null;
  correlationId: string;
  ref: string;
  kind: MonitorEvent['kind'];
}

/**
 * Every model turn this page can see, newest first.
 *
 * One pass, in time order, holding a per-agent tally of the text that has
 * arrived for it since it last spoke. That pending tally is the whole trick: it
 * is what lets an output event — which is the only thing the log marks — carry
 * the input that produced it.
 */
export function ledger(events: MonitorEvent[], brains: Brains): Turn[] {
  const pending = new Map<Actor, number>();
  const out: Turn[] = [];

  // Every call this log can pair with its answer, keyed by the call's own event
  // id — so a turn that made a tool call knows how that call came back.
  const paired = new Map<string, boolean | null>();
  for (const call of apiCalls(events)) paired.set(call.id, call.ok);

  for (const event of events) {
    // Addressed to a model-backed agent: this is what its next call had to read.
    if (event.to !== null && brains[event.to]) {
      pending.set(event.to, (pending.get(event.to) ?? 0) + tokensIn(textOf(event)));
    }

    const brain = brains[event.from];
    if (!brain || !SPOKEN.has(event.kind)) continue;
    if (ACTORS[event.from].sort !== 'agent') continue;

    const output = tokensIn(textOf(event));
    const input = pending.get(event.from) ?? 0;
    pending.set(event.from, 0);

    out.push({
      id: event.id,
      at: event.at,
      actor: event.from,
      provider: brain.provider,
      model: brain.model,
      input,
      output,
      tokens: input + output,
      costUsd:
        brain.rate === null
          ? null
          : (input / 1_000_000) * brain.rate.input + (output / 1_000_000) * brain.rate.output,
      ok: verdict(event, paired),
      title: event.title,
      tool: event.toolName ?? null,
      correlationId: event.correlationId,
      ref: event.ref,
      kind: event.kind,
    });
  }

  return out.sort((a, b) => b.at - a.at);
}

// --------------------------------------------------------------------------- //
// The window on screen
// --------------------------------------------------------------------------- //

export type WindowId = 'today' | 'week' | 'month' | 'custom';

export const WINDOWS: { id: WindowId; label: string; note: string }[] = [
  { id: 'today', label: 'Today', note: 'since midnight' },
  { id: 'week', label: '7 days', note: 'the last seven days' },
  { id: 'month', label: '30 days', note: 'the last thirty days' },
  { id: 'custom', label: 'Custom', note: 'a range you pick' },
];

export interface Span {
  from: number;
  to: number;
  label: string;
}

/** `2026-08-19` as the browser's own local midnight, for the date inputs. */
export function isoDay(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The window as two timestamps.
 *
 * `today` is midnight-to-now rather than the last 24 hours, because "today" on
 * a billing screen is the calendar day everywhere else in the world too. The
 * rolling windows are rolling, which is what makes "7 days" comparable at 9am
 * and at 5pm.
 */
export function span(id: WindowId, custom: { from: string; to: string }, now: number): Span {
  if (id === 'today') return { from: startOfDay(now), to: now, label: 'today' };
  if (id === 'week') return { from: now - 7 * 86_400_000, to: now, label: 'the last 7 days' };
  if (id === 'month') return { from: now - 30 * 86_400_000, to: now, label: 'the last 30 days' };

  // Custom. Both ends are inclusive days: a range of one day is that whole day,
  // not a zero-width instant at its start.
  const from = custom.from ? new Date(`${custom.from}T00:00:00`).getTime() : startOfDay(now);
  const to = custom.to ? new Date(`${custom.to}T23:59:59.999`).getTime() : now;
  const valid = Number.isFinite(from) && Number.isFinite(to) && to >= from;
  if (!valid) return { from: startOfDay(now), to: now, label: 'today' };

  const day = (at: number) =>
    new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });
  return {
    from,
    to: Math.min(to, now),
    label: custom.from === custom.to ? day(from) : `${day(from)} – ${day(to)}`,
  };
}

/** The billing period: this calendar month, which is how every provider bills. */
export function billingPeriod(now: number): Span {
  const start = new Date(now);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return {
    from: start.getTime(),
    to: end.getTime() - 1,
    label: start.toLocaleDateString([], { month: 'long', year: 'numeric' }),
  };
}

export function within(turns: Turn[], range: Span): Turn[] {
  return turns.filter((turn) => turn.at >= range.from && turn.at <= range.to);
}

// --------------------------------------------------------------------------- //
// The totals
// --------------------------------------------------------------------------- //

export interface Totals {
  requests: number;
  failed: number;
  input: number;
  output: number;
  tokens: number;
  /** Null only when nothing in the window had a rate — not when it is zero. */
  costUsd: number | null;
  /** How many turns ran on a model this file has no price for. */
  unpriced: number;
  averageCostUsd: number | null;
  lastAt: number | null;
}

export function totals(turns: Turn[]): Totals {
  let input = 0;
  let output = 0;
  let cost = 0;
  let priced = 0;
  let unpriced = 0;
  let failed = 0;
  let lastAt: number | null = null;

  for (const turn of turns) {
    input += turn.input;
    output += turn.output;
    if (turn.costUsd === null) unpriced += 1;
    else {
      cost += turn.costUsd;
      priced += 1;
    }
    if (turn.ok === false) failed += 1;
    if (lastAt === null || turn.at > lastAt) lastAt = turn.at;
  }

  return {
    requests: turns.length,
    failed,
    input,
    output,
    tokens: input + output,
    costUsd: priced === 0 ? null : cost,
    unpriced,
    // Averaged over the turns that actually have a price. Dividing the priced
    // spend by every turn — including the ones nothing is known about — would
    // quietly report a cheaper model than the floor is running.
    averageCostUsd: priced === 0 ? null : cost / priced,
    lastAt,
  };
}

// --------------------------------------------------------------------------- //
// Per agent, and per family
// --------------------------------------------------------------------------- //

export interface ActorUsage extends Totals {
  actor: Actor;
  provider: string | null;
  model: string | null;
  /** The turns themselves, so the row can open onto its own evidence. */
  turns: Turn[];
}

export function byActor(turns: Turn[], brains: Brains): ActorUsage[] {
  const grouped = new Map<Actor, Turn[]>();
  for (const turn of turns) {
    const list = grouped.get(turn.actor);
    if (list) list.push(turn);
    else grouped.set(turn.actor, [turn]);
  }

  return [...grouped.entries()]
    .map(([actor, list]) => ({
      actor,
      provider: brains[actor]?.provider ?? list[0]?.provider ?? null,
      model: brains[actor]?.model ?? list[0]?.model ?? null,
      turns: list,
      ...totals(list),
    }))
    .sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0) || b.tokens - a.tokens);
}

export type FamilyId = 'ordering' | 'a2a' | 'delivery';

export interface Family {
  id: FamilyId;
  label: string;
  glyph: string;
  /** What this group of agents is for, in one line. */
  role: string;
  members: ActorUsage[];
  totals: Totals;
}

/**
 * The three things a person thinks of as "an agent" on this floor.
 *
 * The A2A desk runs two workers in one process — a buyer and a merchant — and
 * an operator asking "what is the negotiation costing me" means both of them.
 * So the breakdown groups by *service* and opens onto the workers inside, which
 * is the shape of the bill a provider would send as well as the shape of the
 * question.
 */
const FAMILY_OF: Record<Actor, FamilyId | null> = {
  ordering: 'ordering',
  buyer: 'a2a',
  merchant: 'a2a',
  dispatcher: 'delivery',
  courier: null,
  kitchen: null,
  operator: null,
};

const FAMILY_META: Record<FamilyId, { label: string; glyph: string; role: string }> = {
  ordering: {
    label: 'Ordering agent',
    glyph: '🤖',
    role: 'One model, reading an errand and working the restaurant’s API',
  },
  a2a: {
    label: 'Agent-to-agent',
    glyph: '🤝',
    role: 'Two models talking to each other — the buyer and the ordering desk',
  },
  delivery: {
    label: 'Foodpanda dispatcher',
    glyph: '🛵',
    role: 'The delivery agent, deciding and then running the job to the door',
  },
};

export function families(usage: ActorUsage[]): Family[] {
  const order: FamilyId[] = ['ordering', 'a2a', 'delivery'];

  return order
    .map((id) => {
      const members = usage.filter((entry) => FAMILY_OF[entry.actor] === id);
      return {
        id,
        ...FAMILY_META[id],
        members,
        totals: totals(members.flatMap((entry) => entry.turns)),
      };
    })
    .filter((family) => family.members.length > 0);
}

// --------------------------------------------------------------------------- //
// Over time
// --------------------------------------------------------------------------- //

/** One bucket of the token chart: the two halves kept apart, never summed away. */
export interface TokenBucket {
  t: number;
  input: number;
  output: number;
}

/** One bucket of the activity chart, split by how the turns ended. */
export interface ActivityBucket {
  t: number;
  ok: number;
  failed: number;
  open: number;
}

export interface Series {
  bucketMs: number;
  tokens: TokenBucket[];
  /** Cumulative spend across the window — a trend, so it only ever climbs. */
  cost: Point[];
  activity: ActivityBucket[];
  /** True when nothing in the window carried a price. */
  costUnknown: boolean;
}

/**
 * A bucket width that lands the window on roughly two dozen columns.
 *
 * Chosen from a fixed ladder rather than by dividing, so the axis is always a
 * span a person reads without arithmetic — five minutes, an hour, a day — and
 * so the same window always buckets the same way however many turns are in it.
 */
const LADDER = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  3_600_000,
  3 * 3_600_000,
  6 * 3_600_000,
  12 * 3_600_000,
  86_400_000,
];

export function series(turns: Turn[], range: Span): Series {
  const width = Math.max(60_000, range.to - range.from);
  const bucketMs = LADDER.find((step) => width / step <= 26) ?? LADDER[LADDER.length - 1];

  const first = Math.floor(range.from / bucketMs) * bucketMs;
  const count = Math.max(1, Math.min(120, Math.ceil((range.to - first) / bucketMs)));

  const tokens: TokenBucket[] = [];
  const activity: ActivityBucket[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = first + index * bucketMs;
    tokens.push({ t, input: 0, output: 0 });
    activity.push({ t, ok: 0, failed: 0, open: 0 });
  }

  const slot = (at: number) =>
    Math.max(0, Math.min(count - 1, Math.floor((at - first) / bucketMs)));

  let priced = 0;
  for (const turn of turns) {
    const index = slot(turn.at);
    tokens[index].input += turn.input;
    tokens[index].output += turn.output;
    if (turn.ok === false) activity[index].failed += 1;
    else if (turn.ok === true) activity[index].ok += 1;
    else activity[index].open += 1;
    if (turn.costUsd !== null) priced += 1;
  }

  // The cost trend is cumulative on purpose. Per-bucket spend on a floor this
  // quiet is a row of lonely spikes; what somebody watching a budget actually
  // wants is the line that climbs towards it.
  const oldest = [...turns].sort((a, b) => a.at - b.at);
  const cost: Point[] = [{ t: first, value: 0 }];
  let running = 0;
  for (const turn of oldest) {
    running += turn.costUsd ?? 0;
    cost.push({ t: turn.at, value: running });
  }
  cost.push({ t: range.to, value: running });

  return { bucketMs, tokens, cost, activity, costUnknown: priced === 0 };
}

// --------------------------------------------------------------------------- //
// Saying the numbers
// --------------------------------------------------------------------------- //

/** `812`, `12.4K`, `1.24M` — the precision a token count is read at. */
export function tokenCount(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)}`;
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 2 : 1)}K`;
  return `${(value / 1_000_000).toFixed(2)}M`;
}

/**
 * Money, at the precision the amount deserves.
 *
 * A single call costs fractions of a cent and a day of them costs a few
 * dollars; printing both to two decimal places would report most of this
 * screen's rows as `$0.00`, which is the one thing a billing readout must never
 * say about something that cost money.
 */
export function money(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0.00';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

export function percent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return '—';
  const value = ratio * 100;
  return value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
}

// --------------------------------------------------------------------------- //
// The budget
// --------------------------------------------------------------------------- //

const BUDGET_KEY = 'fk.usage.budget';

/**
 * What the operator is willing to spend this month.
 *
 * A stored setting rather than a constant, because a budget is a fact about a
 * deployment and not about this code — and rather than something read from a
 * service, because no service here has one. It lives in this browser, it is
 * editable in the drawer, and the drawer says both of those out loud so nobody
 * reads "remaining budget" as a limit anything will actually enforce.
 */
export const DEFAULT_BUDGET_USD = 25;

export function loadBudget(): number {
  try {
    const raw = localStorage.getItem(BUDGET_KEY);
    const value = raw === null ? Number.NaN : Number.parseFloat(raw);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_BUDGET_USD;
  } catch {
    return DEFAULT_BUDGET_USD;
  }
}

export function saveBudget(value: number): void {
  try {
    localStorage.setItem(BUDGET_KEY, String(value));
  } catch {
    /* private mode, or a full quota — the figure still works for this session */
  }
}
