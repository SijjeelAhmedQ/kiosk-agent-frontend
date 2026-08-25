/**
 * The four services' own consoles, in one shape.
 *
 * The control centre next door is built from the shared bus, and the bus has a
 * hole in it that this page has been honest about from the start: the ordering
 * agent and the A2A desk stream their runs *to whoever started one*. Nothing
 * mirrors onto the bus unless one of those consoles is open in another tab, so
 * an operator watching this dashboard alone could see that the ordering agent
 * was busy and never what it was busy with.
 *
 * Each service now publishes its process console — everything it says, not one
 * run's worth, on a stream with no id in the URL (`agent/console.py` in
 * `friends-kitchen-agent-backend`). This file is the client's half of that: what
 * a line is, where the four of them come from, and how to read one off the wire.
 *
 * Two rules, and they are the reason this is a separate view rather than more
 * rows in the event log:
 *
 *   · **It is the process talking, not the conversation.** A line here has one
 *     speaker and no counterpart, because that is what a console line is. The
 *     event log's `Dispatcher → Courier` is a *derived* fact and it belongs
 *     there; inventing a recipient for `httpx: connection refused` would be
 *     making something up.
 *   · **Nothing is dropped for being unrecognised.** A kind this build has never
 *     heard of still renders, with its text and a neutral glyph. The first time
 *     something new breaks is exactly when you need the log to show you a line
 *     it was not taught about.
 */

import type { Actor } from '@/shared/agentBus';
import { A2A_BASE, COURIER_BASE, FOODPANDA_BASE, ORDERING_BASE } from './api';

/** Which of the four processes a line came out of. */
export type ServiceId = 'ordering' | 'a2a' | 'courier' | 'dispatcher';

/**
 * How loud a line is.
 *
 * Four levels rather than Python's five: `critical` is folded onto `error`,
 * because a reader who has to tell those two apart on a dashboard has already
 * lost. Ranked here so "warnings and worse" is one comparison.
 */
export type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error';

export const LEVEL_RANK: Record<ConsoleLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface ConsoleLine {
  /** `service:seq` — unique across all four streams, and stable across a replay. */
  id: string;
  /** The service's own counter, which is what makes a reconnect resumable. */
  seq: number;
  at: number;
  service: ServiceId;
  agent: Actor;
  level: ConsoleLevel;
  /** "tool", "status", "message", "error", "log"… free-form on purpose. */
  kind: string;
  text: string;
  /** The run, task or job it belongs to. Empty for lines about the process. */
  ref: string;
  tool?: string;
  ok?: boolean;
  /** `agent` — the service's own events. `log` — Python's logging. */
  source: 'agent' | 'log';
  /** Which logger wrote it, when `source` is `log`. */
  logger?: string;
}

export interface ConsoleSource {
  id: ServiceId;
  /** What the process is, in the operator's words. */
  name: string;
  /** The default speaker; a line may name someone else (the A2A desk is two). */
  actor: Actor;
  glyph: string;
  base: string;
  /** The service's namespace — `/api/agent`, `/api/a2a`… */
  prefix: string;
  port: number;
  /** The console that drives this service, for a reader who wants to act. */
  href: string;
}

/**
 * The four, in the order work passes through them.
 *
 * Same bases as `api.ts`, imported rather than restated — a port is a fact
 * about the deployment and this file is not a second place to change one.
 */
export const CONSOLE_SOURCES: ConsoleSource[] = [
  {
    id: 'ordering',
    name: 'Ordering agent',
    actor: 'ordering',
    glyph: '🤖',
    base: ORDERING_BASE,
    prefix: '/api/agent',
    port: 8100,
    href: '/',
  },
  {
    id: 'a2a',
    name: 'A2A desk',
    actor: 'buyer',
    glyph: '🤝',
    base: A2A_BASE,
    prefix: '/api/a2a',
    port: 8101,
    href: '/a2a.html',
  },
  {
    id: 'dispatcher',
    name: 'Dispatcher',
    actor: 'dispatcher',
    glyph: '🛵',
    base: FOODPANDA_BASE,
    prefix: '/api/foodpanda',
    port: 8103,
    href: '/foodpanda.html',
  },
  {
    id: 'courier',
    name: 'Courier',
    actor: 'courier',
    glyph: '🏍️',
    base: COURIER_BASE,
    prefix: '/api/delivery',
    port: 8102,
    href: '/foodpanda.html',
  },
];

export const SOURCE_BY_ID: Record<ServiceId, ConsoleSource> = Object.fromEntries(
  CONSOLE_SOURCES.map((source) => [source.id, source]),
) as Record<ServiceId, ConsoleSource>;

/**
 * Whether a service's stream is up.
 *
 * `waiting` is not a failure and must not be drawn as one: it is what a service
 * that has said nothing since the page opened looks like, which on a quiet floor
 * is all four of them. `down` means the connection itself would not hold.
 */
export type LinkState = 'connecting' | 'live' | 'down';

export interface Link {
  state: LinkState;
  /** When this stream last carried anything, a ping included. */
  lastAt: number;
  /** Lines seen from this service since the page opened. */
  count: number;
  /** The highest `seq` taken from it, so a reconnect can resume. */
  seq: number;
}

// --------------------------------------------------------------------------- //
// Reading a line off the wire
// --------------------------------------------------------------------------- //
const LEVELS = new Set<ConsoleLevel>(['debug', 'info', 'warn', 'error']);

/**
 * One wire line, checked rather than trusted.
 *
 * This page reads four services it does not deploy in lockstep with, so a line
 * may arrive from a build older or newer than this one. Anything without a
 * sequence number and some text is dropped; everything else is filled in with a
 * defensible default rather than rejected — a line whose level this build does
 * not recognise is still a line worth showing.
 */
export function toLine(raw: unknown, source: ConsoleSource): ConsoleLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;

  const seq = Number(record.seq);
  const text = typeof record.text === 'string' ? record.text : '';
  if (!Number.isFinite(seq) || !text) return null;

  const level = String(record.level ?? 'info') as ConsoleLevel;
  const at = Number(record.at);
  const data = (record.data ?? null) as Record<string, unknown> | null;

  return {
    id: `${source.id}:${seq}`,
    seq,
    // A service whose clock is off would otherwise sort its lines into the
    // middle of somebody else's. Falling back to now keeps the merge sane.
    at: Number.isFinite(at) && at > 0 ? at : Date.now(),
    service: source.id,
    agent: (typeof record.agent === 'string' ? record.agent : source.actor) as Actor,
    level: LEVELS.has(level) ? level : 'info',
    kind: typeof record.kind === 'string' && record.kind ? record.kind : 'note',
    text,
    ref: typeof record.ref === 'string' ? record.ref : '',
    tool: typeof record.tool === 'string' ? record.tool : undefined,
    ok: typeof record.ok === 'boolean' ? record.ok : undefined,
    source: record.source === 'log' ? 'log' : 'agent',
    logger: typeof data?.logger === 'string' ? data.logger : undefined,
  };
}

// --------------------------------------------------------------------------- //
// How a line is drawn
// --------------------------------------------------------------------------- //
/**
 * A glyph per kind, and a deliberate fallback.
 *
 * The same vocabulary the event log uses, so a reader moving between the two
 * panels does not have to learn a second alphabet.
 */
export const KIND_GLYPH: Record<string, string> = {
  tool: '🔧',
  tool_result: '↩',
  message: '💬',
  status: '◆',
  waiting: '⏸',
  delivery: '🛵',
  artifact: '🧾',
  error: '⚠️',
  log: '·',
  note: '·',
};

export const LEVEL_LABEL: Record<ConsoleLevel, string> = {
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/** `14:32:09.481` — milliseconds included, because two lines share a second. */
export function stampMs(at: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${time}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

/** One line as a terminal would print it — what the copy button hands over. */
export function asText(line: ConsoleLine): string {
  const who = SOURCE_BY_ID[line.service]?.name ?? line.service;
  const ref = line.ref ? ` [${line.ref}]` : '';
  return `${stampMs(line.at)}  ${line.level.toUpperCase().padEnd(5)} ${who}${ref}  ${line.text}`;
}
