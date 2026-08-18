/**
 * Every event, filterable, with the raw payload one click away.
 *
 * The conversation view beside this one is the readable version and it is the
 * one an operator should be able to work from. This is the version you open when
 * that is not enough — when a call succeeded and the answer was still wrong, or
 * when somebody needs to know exactly what the merchant sent the courier.
 *
 * Two rules it follows that a console log does not:
 *
 *   · **Every row names both ends.** `Dispatcher → Courier` on the row itself,
 *     not implied by which pane it is in. The single question this whole screen
 *     exists to answer is who talked to whom, and a row that omits it has to be
 *     cross-referenced against something else to be worth anything.
 *   · **The filters count.** Each chip carries how many rows it would show, so
 *     "no errors" and "the error filter is broken" are never confusable, and
 *     nobody clicks through eight chips looking for where the failures went.
 *
 * The tail is followed only from the tail. Someone reading back through the
 * morning must not be yanked to the bottom every time an agent speaks — that is
 * the single most common way a live log becomes unreadable.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ACTORS,
  FILTERS,
  matches,
  stamp,
  type FilterId,
  type MonitorEvent,
} from '../../monitor';

interface Props {
  events: MonitorEvent[];
  counts: Record<FilterId, number>;
  /** Null shows the whole floor; a run id narrows to that conversation. */
  scope: string | null;
  onClearScope: () => void;
}

const KIND_LABEL: Record<string, string> = {
  run_started: 'started',
  run_finished: 'finished',
  handshake: 'handshake',
  message: 'message',
  tool_call: 'tool call',
  tool_result: 'response',
  artifact: 'artifact',
  location: 'location',
  order: 'order',
  delivery: 'delivery',
  waiting: 'waiting',
  error: 'error',
};

const KIND_GLYPH: Record<string, string> = {
  run_started: '▶',
  run_finished: '⏹',
  handshake: '🤝',
  message: '💬',
  tool_call: '🔧',
  tool_result: '↩',
  artifact: '🧾',
  location: '📍',
  order: '🧾',
  delivery: '🛵',
  waiting: '⏸',
  error: '⚠️',
};

/** Pretty-print a stored JSON preview, and fall back to the raw string. */
function pretty(detail: string): string {
  try {
    return JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    return detail;
  }
}

function Row({ event }: { event: MonitorEvent }) {
  const [open, setOpen] = useState(false);
  const bad = event.kind === 'error' || event.ok === false;
  const has = Boolean(event.detail || event.toolName || event.data);

  return (
    <li className={`fkm-log-row${bad ? ' fkm-log-row-bad' : ''}${open ? ' fkm-log-row-open' : ''}`}>
      <button
        type="button"
        className="fkm-log-hit"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={has ? open : undefined}
        disabled={!has}
      >
        <span className="fkm-log-time">{stamp(event.at)}</span>

        <span className="fkm-log-kind" data-kind={event.kind}>
          <span aria-hidden>{KIND_GLYPH[event.kind] ?? '·'}</span>
          {KIND_LABEL[event.kind] ?? event.kind}
        </span>

        <span className="fkm-log-wire">
          <span className="fkm-log-actor">
            <span aria-hidden>{ACTORS[event.from].glyph}</span>
            {ACTORS[event.from].short}
          </span>
          <span className="fkm-log-arrow" aria-hidden>
            →
          </span>
          {event.to ? (
            <span className="fkm-log-actor">
              <span aria-hidden>{ACTORS[event.to].glyph}</span>
              {ACTORS[event.to].short}
            </span>
          ) : (
            <span className="fkm-log-actor fkm-log-actor-none">itself</span>
          )}
        </span>

        <span className="fkm-log-text">{event.title}</span>
        <span className="fkm-log-ref">{event.ref}</span>
        {has && (
          <span className="fkm-log-caret" aria-hidden>
            {open ? '−' : '+'}
          </span>
        )}
      </button>

      {open && has && (
        <div className="fkm-log-detail">
          {event.toolName && (
            <p className="fkm-log-field">
              <span className="fkm-log-field-key">tool</span>
              <span className="fk-pill-mono">{event.toolName}</span>
            </p>
          )}
          {event.ok !== undefined && (
            <p className="fkm-log-field">
              <span className="fkm-log-field-key">outcome</span>
              <span className={event.ok ? 'fkm-ok' : 'fkm-not-ok'}>
                {event.ok ? 'succeeded' : 'failed'}
              </span>
            </p>
          )}
          {event.data && Object.keys(event.data).length > 0 && (
            <pre className="fkm-log-json">{JSON.stringify(event.data, null, 2)}</pre>
          )}
          {event.detail && <pre className="fkm-log-json">{pretty(event.detail)}</pre>}
        </div>
      )}
    </li>
  );
}

export function EventLog({ events, counts, scope, onClearScope }: Props) {
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const box = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (!matches(event, filter)) return false;
      if (!needle) return true;
      return (
        event.title.toLowerCase().includes(needle) ||
        event.ref.toLowerCase().includes(needle) ||
        (event.toolName ?? '').toLowerCase().includes(needle) ||
        ACTORS[event.from].name.toLowerCase().includes(needle) ||
        (event.to ? ACTORS[event.to].name.toLowerCase().includes(needle) : false)
      );
    });
  }, [events, filter, query]);

  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
  });

  useEffect(() => {
    const node = box.current;
    if (node && pinned.current) node.scrollTop = node.scrollHeight;
  }, [shown.length]);

  return (
    <div className="fkm-log">
      <div className="fkm-log-bar">
        <div className="fkm-chips" role="group" aria-label="Filter the log">
          {FILTERS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`fkm-chip${option.id === filter ? ' fkm-chip-on' : ''}`}
              aria-pressed={option.id === filter}
              title={option.hint}
              onClick={() => setFilter(option.id)}
            >
              <span aria-hidden>{option.glyph}</span>
              {option.label}
              <span className="fkm-chip-count">{counts[option.id]}</span>
            </button>
          ))}
        </div>

        <div className="fkm-log-tools">
          <label className="fkm-search">
            <span className="fkm-search-glyph" aria-hidden>
              🔍
            </span>
            <input
              type="search"
              className="fkm-search-input"
              value={query}
              placeholder="Find an agent, an order, a tool…"
              onChange={(change) => setQuery(change.target.value)}
              aria-label="Search the event log"
            />
          </label>

          {scope && (
            <button type="button" className="fkm-scope" onClick={onClearScope}>
              <span aria-hidden>⤫</span> Showing one run — see everything
            </button>
          )}
        </div>
      </div>

      <div className="fkm-log-scroll" ref={box}>
        {shown.length === 0 ? (
          <div className="fkm-empty fkm-empty-inline">
            <span className="fkm-empty-glyph" aria-hidden>
              {events.length === 0 ? '📡' : '🔍'}
            </span>
            <p className="fkm-empty-title">
              {events.length === 0 ? 'The floor is quiet' : 'Nothing matches'}
            </p>
            <p className="fkm-empty-body">
              {events.length === 0
                ? 'No agent has said anything yet. Open a console, send an errand, and every step of it lands here as it happens.'
                : 'No event in this range fits that filter and search. Widen one of them.'}
            </p>
          </div>
        ) : (
          <ol className="fkm-log-list" aria-label="Agent event log">
            {shown.map((event) => (
              <Row key={event.id} event={event} />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
