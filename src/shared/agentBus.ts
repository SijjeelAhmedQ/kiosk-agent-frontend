/**
 * The floor's shared nervous system — one log every console writes to.
 *
 * The problem this solves is specific. Two of the four services on this floor
 * publish nothing an observer can subscribe to: the errand server on 8100 and
 * the A2A desk on 8101 stream a run only to whoever *started* it, keyed by a
 * run id that is handed back from the `POST` and never listed anywhere. So the
 * operations dashboard — which starts nothing, by design — can see that those
 * two are busy and not one word of what they are saying.
 *
 * Rather than invent a backend endpoint or, worse, invent the conversation, the
 * consoles that already receive those streams re-broadcast what they were told,
 * verbatim, onto a channel every same-origin tab can hear. Nothing here makes
 * anything up: every entry on this bus was put there by a console that had just
 * read it off a real `EventSource`. If no console is open, the bus is empty and
 * the dashboard says so rather than drawing a plausible negotiation.
 *
 * Two transports, because one is not enough:
 *
 *   · `BroadcastChannel` carries an event to tabs that are open *now*. This is
 *     what makes the dashboard live — a message lands in the A2A tab and is on
 *     the dashboard in the same frame, with no polling in between.
 *   · `localStorage` keeps the last few hundred entries, so a dashboard opened
 *     halfway through a run still has the beginning of it, and a reload does not
 *     erase the morning.
 *
 * The `storage` event doubles as a fallback for anything without
 * `BroadcastChannel`, which is why the write happens even when the channel
 * posted successfully.
 *
 * Deliberately not a dependency: this is a page of behaviour, and an event
 * emitter library would be a bigger surface than the thing it emits.
 */

/**
 * Everyone who can appear at either end of a line on this floor.
 *
 * A superset of the dashboard's `AgentId` on purpose. Two of these are not
 * agents and must not be drawn as ones — `operator` is the person at the
 * keyboard, and `kitchen` is Friends Kitchen's own API on 8000, which is a
 * service being *called* rather than a party that negotiates. Keeping them in
 * the same vocabulary is what lets one arrow type describe "the buyer asked the
 * merchant" and "the merchant asked the restaurant" without a second shape.
 */
export type Actor =
  | 'operator'
  | 'ordering'
  | 'buyer'
  | 'merchant'
  | 'dispatcher'
  | 'courier'
  | 'kitchen';

/**
 * What kind of thing happened, in the vocabulary an operator watches for.
 *
 * Narrow on purpose. Every one of these maps to a row the dashboard draws
 * differently, and a kind nothing renders differently is a kind that should not
 * exist — it is a `detail` string wearing a type.
 */
export type BusKind =
  | 'run_started'
  | 'run_finished'
  | 'handshake'
  | 'message'
  | 'tool_call'
  | 'tool_result'
  | 'artifact'
  | 'location'
  | 'order'
  | 'delivery'
  | 'waiting'
  | 'error';

/** How the thing that happened is going. Drives every status light on screen. */
export type BusStatus = 'active' | 'waiting' | 'processing' | 'done' | 'error';

export interface BusEvent {
  /** Unique across tabs — the emitting tab's id and its own counter. */
  id: string;
  /** Epoch ms, stamped by the tab that saw the event, not by the reader. */
  at: number;
  /** Which console produced it, so the dashboard can group by conversation. */
  channel: 'ordering' | 'a2a' | 'delivery';
  /**
   * The run or job this belongs to.
   *
   * Everything on the dashboard that groups — the conversation view, the flow
   * ribbon's "what is live" — groups by this. Without it a busy floor is one
   * interleaved column of sentences from three different orders.
   */
  correlationId: string;
  /** What to call that run in one short string: an order number, or a run id. */
  ref: string;
  from: Actor;
  /** Null for something an agent did alone — thinking, finishing, failing. */
  to: Actor | null;
  kind: BusKind;
  /** One line, already in words a person reads. Never a function name. */
  title: string;
  /** The body: what was said, what came back, why it failed. */
  detail?: string;
  /** Tool and API results only. */
  ok?: boolean;
  status?: BusStatus;
  /** The raw name behind `title`, kept for the log's expandable row. */
  toolName?: string;
  /** Anything small and JSON-safe worth showing when a row is opened. */
  data?: Record<string, unknown>;
}

/** What a publisher supplies. The bus stamps the rest. */
export type BusInput = Omit<BusEvent, 'id' | 'at'> & { at?: number };

const CHANNEL = 'fk-agent-bus';
const STORE_KEY = 'fk-agent-bus-log';

/**
 * How much history the bus keeps.
 *
 * 400 entries is roughly a dozen full runs — enough that a dashboard opened
 * mid-afternoon has real context, small enough that the serialised log stays
 * well inside a localStorage quota even with fat `data` payloads. The buffer is
 * a ring: the oldest entry falls off rather than the write failing.
 */
const KEPT = 400;

/** This tab, for the id prefix. Not persisted — a reload is a new writer. */
const TAB = Math.random().toString(36).slice(2, 8);
let counter = 0;

type Listener = (event: BusEvent) => void;
const listeners = new Set<Listener>();

/** Told when another tab wipes the log, so a dashboard clears with it. */
type ClearListener = () => void;
const clearListeners = new Set<ClearListener>();

/**
 * The channel, or null where it does not exist.
 *
 * Constructed lazily and never thrown from: a page in a context that forbids it
 * should lose live updates, not fail to render. The `storage` fallback below
 * still carries the event.
 */
let channel: BroadcastChannel | null = null;
function bus(): BroadcastChannel | null {
  if (channel) return channel;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (message) => {
      const payload = message.data as unknown;
      if (payload && typeof payload === 'object' && (payload as { wipe?: boolean }).wipe === true) {
        memory = [];
        for (const listener of clearListeners) listener();
        return;
      }
      if (isEvent(payload)) deliver(payload, false);
    };
  } catch {
    channel = null;
  }
  return channel;
}

/**
 * Is this actually one of ours?
 *
 * Anything can post to a named BroadcastChannel and anything can write to
 * localStorage. This is not a security boundary — same origin already is one —
 * it is a guard against a malformed entry from an older build of this app
 * crashing the renderer that reads it.
 */
function isEvent(value: unknown): value is BusEvent {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<BusEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.at === 'number' &&
    typeof candidate.from === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.title === 'string'
  );
}

// --------------------------------------------------------------------------- //
// The stored ring
// --------------------------------------------------------------------------- //

let memory: BusEvent[] | null = null;

function load(): BusEvent[] {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    memory = Array.isArray(parsed) ? parsed.filter(isEvent) : [];
  } catch {
    // Private mode, a quota error, a half-written value — an empty log is a
    // perfectly good state for this page and a broken one is not.
    memory = [];
  }
  return memory;
}

/**
 * The write, batched.
 *
 * A busy negotiation emits several events a second and each one would otherwise
 * re-serialise the whole ring. Coalescing to one write per quarter-second keeps
 * the emitting console — which is the tab a person is actually watching — free
 * of that work on its render path.
 */
let flushTimer: ReturnType<typeof setTimeout> | null = null;
function schedule() {
  if (flushTimer !== null) return;
  flushTimer = setTimeout(flush, 250);
}

function flush() {
  flushTimer = null;
  if (!memory) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(memory));
  } catch {
    // Over quota. Halve the ring and try once more; if that fails too, the log
    // simply stops persisting and the live channel carries on regardless.
    try {
      memory = memory.slice(-Math.floor(KEPT / 2));
      localStorage.setItem(STORE_KEY, JSON.stringify(memory));
    } catch {
      /* live-only from here */
    }
  }
}

if (typeof window !== 'undefined') {
  // A tab being hidden or closed is the one moment a batched write must not be
  // waiting on its timer.
  window.addEventListener('pagehide', flush);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });

  // The fallback path, and the way a tab that was asleep catches up: another
  // tab replaced the whole ring, so re-read it and deliver what is new.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORE_KEY || !event.newValue) return;
    let incoming: BusEvent[];
    try {
      const parsed = JSON.parse(event.newValue) as unknown;
      incoming = Array.isArray(parsed) ? parsed.filter(isEvent) : [];
    } catch {
      return;
    }
    const known = new Set(load().map((entry) => entry.id));
    for (const entry of incoming) {
      if (!known.has(entry.id)) deliver(entry, false);
    }
  });
}

/**
 * Put an event into this tab's ring and hand it to this tab's listeners.
 *
 * `persist` is false for anything that arrived from another tab: that tab has
 * already written it, and writing it again would ping-pong the `storage` event
 * between two open consoles for as long as both are open.
 */
function deliver(event: BusEvent, persist: boolean) {
  const ring = load();
  if (ring.some((entry) => entry.id === event.id)) return;

  ring.push(event);
  if (ring.length > KEPT) ring.splice(0, ring.length - KEPT);
  if (persist) schedule();

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // One bad subscriber must not stop the others, and must never stop the
      // console that is publishing from finishing its own render.
    }
  }
}

// --------------------------------------------------------------------------- //
// The public surface
// --------------------------------------------------------------------------- //

/**
 * Record something that happened, and tell every open tab about it.
 *
 * Called from the consoles' stream handlers, on the same events they already
 * fold into their own UI — which is the whole reason this is trustworthy. There
 * is no code path that publishes without a service having said something first.
 */
export function publish(input: BusInput): void {
  counter += 1;
  const event: BusEvent = {
    ...input,
    at: input.at ?? Date.now(),
    id: `${TAB}-${counter}`,
  };

  deliver(event, true);
  try {
    bus()?.postMessage(event);
  } catch {
    // Uncloneable payload or a closed channel. The `storage` write above still
    // reaches the other tabs, a beat later.
  }
}

/** Everything the bus is holding, oldest first. A copy — callers may sort it. */
export function snapshot(): BusEvent[] {
  return [...load()];
}

/** Listen for events from this tab and every other one. Returns an unsubscribe. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  bus(); // open the channel on first subscriber rather than on first publish
  return () => {
    listeners.delete(listener);
  };
}

/** Told when the shared log is wiped, from this tab or another. */
export function onCleared(listener: ClearListener): () => void {
  clearListeners.add(listener);
  bus();
  return () => {
    clearListeners.delete(listener);
  };
}

/**
 * Empty the log everywhere.
 *
 * The dashboard offers this so a shift can start from a clean board. It clears
 * the shared history rather than one tab's view, which is why it is a deliberate
 * control rather than a filter — a filter hides rows, this one drops them.
 */
export function clear(): void {
  memory = [];
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    localStorage.setItem(STORE_KEY, '[]');
  } catch {
    /* nothing to clear if nothing could be stored */
  }
  try {
    bus()?.postMessage({ wipe: true });
  } catch {
    /* the storage event covers it */
  }
  for (const listener of clearListeners) listener();
}
