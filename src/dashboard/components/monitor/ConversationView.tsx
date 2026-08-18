/**
 * The negotiation, read as a conversation rather than as a log.
 *
 * A transcript in two lanes: the party that opened the exchange on the left, the
 * one answering on the right, everything else — tool calls, API answers, the
 * courier being handed an order — down the middle as a thin rail. That split is
 * not decoration. On this floor a negotiation is *literally* two models taking
 * turns, and the question an operator is holding while they watch is "whose move
 * is it" — which a two-lane layout answers before a single word is read, and a
 * flat list never answers at all.
 *
 * The middle rail is where the machinery goes, and it is deliberately quieter
 * than the bubbles. `browse_menu → 41 products` is what makes the merchant's
 * next sentence true, and it is not part of the conversation; given equal weight
 * it buries the two sentences that are.
 *
 * Nothing here is styled by who "wins". A refusal, a failed payment and a
 * successful handover all get the same bubble with a different status mark,
 * because the transcript's job is to show what was said.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ACTORS, stamp, type Actor, type Conversation, type MonitorEvent } from '../../monitor';

interface Props {
  run: Conversation | null;
  now: number;
}

/** The kinds that read as somebody speaking rather than as machinery. */
const SPOKEN = new Set(['message', 'run_started', 'run_finished']);

/**
 * The two parties whose turns get lanes.
 *
 * Chosen by who actually spoke most, not by a fixed pair: the same component
 * draws a buyer/merchant negotiation, an ordering agent reporting to the
 * operator, and a dispatcher working a job, and hardcoding buyer-on-the-left
 * would leave two of those three with an empty lane.
 */
function lanes(events: MonitorEvent[]): [Actor | null, Actor | null] {
  const counts = new Map<Actor, number>();
  for (const event of events) {
    if (!SPOKEN.has(event.kind)) continue;
    counts.set(event.from, (counts.get(event.from) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([actor]) => actor);

  // First speaker keeps the left lane even if the other one out-talks them —
  // the left lane means "opened this", and a transcript whose sides swap
  // halfway through is a transcript nobody can follow.
  const opener = events.find((event) => SPOKEN.has(event.kind))?.from ?? ranked[0] ?? null;
  const other = ranked.find((actor) => actor !== opener) ?? null;
  return [opener, other];
}

/** The status mark on a bubble — glyph and word, never colour alone. */
const MARK: Record<string, { glyph: string; label: string; className: string }> = {
  active: { glyph: '◆', label: 'sent', className: 'fkm-mark-active' },
  processing: { glyph: '◐', label: 'processing', className: 'fkm-mark-processing' },
  waiting: { glyph: '⏸', label: 'waiting', className: 'fkm-mark-waiting' },
  done: { glyph: '✓', label: 'answered', className: 'fkm-mark-done' },
  error: { glyph: '✕', label: 'failed', className: 'fkm-mark-error' },
};

const KIND_GLYPH: Record<string, string> = {
  tool_call: '🔧',
  tool_result: '↩',
  handshake: '🤝',
  artifact: '🧾',
  order: '🧾',
  delivery: '🛵',
  location: '📍',
  waiting: '⏸',
  error: '⚠️',
  run_started: '▶',
  run_finished: '⏹',
  message: '💬',
};

/** A machinery row: what was called, and what came back. */
function RailRow({ event }: { event: MonitorEvent }) {
  const [open, setOpen] = useState(false);
  const bad = event.kind === 'error' || event.ok === false;
  const body = event.detail;

  return (
    <li className={`fkm-rail-row${bad ? ' fkm-rail-row-bad' : ''}`}>
      <button
        type="button"
        className="fkm-rail-btn"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!body}
      >
        <span className="fkm-rail-time">{stamp(event.at)}</span>
        <span className="fkm-rail-glyph" aria-hidden>
          {KIND_GLYPH[event.kind] ?? '·'}
        </span>
        <span className="fkm-rail-who">
          {ACTORS[event.from].short}
          {event.to && (
            <>
              <span className="fkm-rail-arrow" aria-hidden>
                →
              </span>
              {ACTORS[event.to].short}
            </>
          )}
        </span>
        <span className="fkm-rail-text">{event.title}</span>
        {body && (
          <span className="fkm-rail-more" aria-hidden>
            {open ? '−' : '+'}
          </span>
        )}
      </button>

      {open && body && <pre className="fkm-rail-detail">{body}</pre>}
    </li>
  );
}

/** One turn, in its lane. */
function Bubble({ event, side }: { event: MonitorEvent; side: 'left' | 'right' }) {
  const from = ACTORS[event.from];
  const to = event.to ? ACTORS[event.to] : null;
  const mark = MARK[event.status] ?? MARK.active;
  const bad = event.kind === 'error' || event.ok === false;

  return (
    <li className={`fkm-turn fkm-turn-${side}${bad ? ' fkm-turn-bad' : ''}`}>
      <span className="fkm-turn-avatar" aria-hidden>
        {from.glyph}
      </span>

      <div className="fkm-turn-body">
        <p className="fkm-turn-head">
          <span className="fkm-turn-from">{from.name}</span>
          {to && (
            <>
              <span className="fkm-turn-to-arrow" aria-hidden>
                →
              </span>
              <span className="fkm-turn-to">{to.name}</span>
            </>
          )}
          <span className="fkm-turn-time">{stamp(event.at)}</span>
        </p>

        <div className="fkm-turn-text">{event.title}</div>

        {event.detail && event.kind !== 'message' && (
          <p className="fkm-turn-sub">{event.detail}</p>
        )}

        <p className="fkm-turn-foot">
          <span className={`fkm-mark ${mark.className}`}>
            <span aria-hidden>{mark.glyph}</span>
            {mark.label}
          </span>
          {event.kind === 'run_finished' && <span className="fkm-turn-tag">final report</span>}
          {event.kind === 'run_started' && <span className="fkm-turn-tag">opening request</span>}
        </p>
      </div>
    </li>
  );
}

export function ConversationView({ run, now }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

  // Whether to follow the tail is decided *before* the paint that added a row,
  // because after it the box is already taller and every read says "not at the
  // bottom". Reading it in a layout effect is what makes the follow reliable.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  });

  useEffect(() => {
    const node = box.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [run?.events.length, run?.id]);

  if (!run) {
    return (
      <div className="fkm-empty">
        <span className="fkm-empty-glyph" aria-hidden>
          💬
        </span>
        <p className="fkm-empty-title">No conversation yet</p>
        <p className="fkm-empty-body">
          This fills the moment two agents start talking. Send an errand from the{' '}
          <a href="/a2a.html">A2A console</a> and the whole negotiation appears here, turn by
          turn, while it happens.
        </p>
      </div>
    );
  }

  const [left, right] = lanes(run.events);

  return (
    <div className="fkm-convo">
      <div className="fkm-convo-lanes" aria-hidden>
        <span className="fkm-lane-tag fkm-lane-tag-left">
          {left ? (
            <>
              <span aria-hidden>{ACTORS[left].glyph}</span>
              {ACTORS[left].name}
            </>
          ) : (
            '—'
          )}
        </span>
        <span className="fkm-lane-tag fkm-lane-tag-right">
          {right ? (
            <>
              <span aria-hidden>{ACTORS[right].glyph}</span>
              {ACTORS[right].name}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="fkm-convo-scroll" ref={box}>
        <ol className="fkm-convo-list" aria-label={`Conversation for ${run.ref}`}>
          {run.events.map((event) =>
            SPOKEN.has(event.kind) ? (
              <Bubble
                key={event.id}
                event={event}
                side={event.from === right && right !== null ? 'right' : 'left'}
              />
            ) : (
              <RailRow key={event.id} event={event} />
            ),
          )}
        </ol>

        {run.live && (
          <p className="fkm-convo-live">
            <span className="fkm-typing" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            Still going — last word {Math.max(0, Math.round((now - run.lastAt) / 1000))}s ago
          </p>
        )}
      </div>
    </div>
  );
}
