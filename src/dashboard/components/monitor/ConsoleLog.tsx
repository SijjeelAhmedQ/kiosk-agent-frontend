/**
 * The four agents' consoles, side by side, live.
 *
 * This is the panel that answers "what is each agent actually doing" without
 * anybody having started a run from this tab. Everything else on this page is
 * derived — the roster from health checks, the charts from the delivery board's
 * timelines, the control centre from a bus two of the four services only reach
 * when one of their own consoles is open. This is the processes themselves,
 * talking, and it keeps talking whether or not anyone is listening.
 *
 * The design decisions worth stating, because each of them is a thing that goes
 * wrong in log viewers:
 *
 *   · **All four services are always on the bar, running or not.** A source that
 *     is down is drawn as down rather than omitted. A log missing a service you
 *     expected is indistinguishable from a service with nothing to say, and that
 *     is precisely the ambiguity somebody opens this panel to resolve.
 *   · **The tail is followed only from the tail.** Scroll up and the stream stops
 *     yanking you back; a button appears saying how many lines arrived while you
 *     were reading. This is the single most common way a live log becomes
 *     unusable.
 *   · **Every filter carries its count**, taken after the *other* filters have
 *     been applied. "Errors 3" means three among what is on screen, so "no
 *     errors" and "the filter is broken" are never confusable.
 *   · **Pause freezes the view, not the stream.** Held lines keep arriving into
 *     the buffer and land in order when you let go. A pause that dropped what
 *     happened while you were reading would make the log lie about the gap.
 *
 * The one thing it will not do is pretend. `Clear` empties this page's
 * scrollback and says so — the services keep their own ring buffers, and a
 * reload brings them back.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  asText,
  CONSOLE_SOURCES,
  KIND_GLYPH,
  LEVEL_LABEL,
  LEVEL_RANK,
  SOURCE_BY_ID,
  stampMs,
  type ConsoleLevel,
  type ConsoleLine,
  type ServiceId,
} from '../../console';
import { ACTORS } from '../../monitor';
import type { ConsoleView } from '../../useConsole';

interface Props {
  view: ConsoleView;
  /** Opens the whole task a line belongs to, when it names one. */
  onOpenTask: (ref: string) => void;
}

/**
 * The level filter, as a floor rather than a set.
 *
 * "Show me warnings" almost always means "and errors too" — a set of independent
 * level toggles is the arrangement where somebody selects `warn`, sees nothing,
 * and concludes the floor is fine while an error sits one rank above them.
 */
const FLOORS: { id: ConsoleLevel; label: string; hint: string }[] = [
  { id: 'debug', label: 'Everything', hint: 'Every line, including the housekeeping' },
  { id: 'info', label: 'Normal', hint: 'What the agents did, without the debug chatter' },
  { id: 'warn', label: 'Warnings', hint: 'Warnings and errors only' },
  { id: 'error', label: 'Errors', hint: 'Only what failed' },
];

function Row({ line, onOpenTask }: { line: ConsoleLine; onOpenTask: (ref: string) => void }) {
  // Folded onto the operator when unknown, the same way the event log does it: a
  // dashboard must not be taken down by a service that named a speaker this
  // build has not been taught about. The line still carries its own text.
  const who = ACTORS[line.agent] ?? ACTORS.operator;
  const source = SOURCE_BY_ID[line.service];

  return (
    <li
      className={`fkc-row fkc-row-${line.level}`}
      data-kind={line.kind}
      data-service={line.service}
    >
      <span className="fkc-time">{stampMs(line.at)}</span>

      <span className="fkc-who" title={`${who.name} · ${source?.name ?? line.service}`}>
        <span aria-hidden>{who.glyph}</span>
        <span className="fkc-who-name">{who.short}</span>
      </span>

      <span className="fkc-glyph" aria-hidden>
        {KIND_GLYPH[line.kind] ?? '·'}
      </span>

      <span className="fkc-text">
        {/* Warnings and errors carry the word as well as the colour — the row is
            tinted and edged, and neither of those survives a colour-blind reader
            or a photograph of the screen. Info and debug do not: labelling the
            ordinary case is how a log ends up with a column of "INFO" down it. */}
        {(line.level === 'warn' || line.level === 'error') && (
          <span className={`fkc-tag fkc-tag-${line.level}`}>{LEVEL_LABEL[line.level]}</span>
        )}
        {line.tool && <span className="fkc-tool">{line.tool}</span>}
        {line.logger && <span className="fkc-logger">{line.logger}</span>}
        {line.text}
      </span>

      {line.ref ? (
        <button
          type="button"
          className="fkc-ref"
          onClick={() => onOpenTask(line.ref)}
          title={`Open ${line.ref}`}
        >
          {line.ref}
        </button>
      ) : (
        <span className="fkc-ref fkc-ref-none" aria-hidden>
          —
        </span>
      )}
    </li>
  );
}

export function ConsoleLog({ view, onOpenTask }: Props) {
  const { lines, links, allDown, paused, setPaused, held, clear } = view;

  const [service, setService] = useState<ServiceId | 'all'>('all');
  const [floor, setFloor] = useState<ConsoleLevel>('info');
  const [text, setText] = useState('');
  const [runtime, setRuntime] = useState(true);
  const [copied, setCopied] = useState(false);

  const box = useRef<HTMLDivElement | null>(null);
  const pinned = useRef(true);
  const [tailing, setTailing] = useState(true);
  const [behind, setBehind] = useState(0);

  const needle = text.trim().toLowerCase();

  /**
   * Everything except the service, so the source chips can carry honest counts
   * and still be a live control over the same query. Same trick the event log
   * plays with its kind chips, and for the same reason.
   */
  const base = useMemo(
    () =>
      lines.filter((line) => {
        if (LEVEL_RANK[line.level] < LEVEL_RANK[floor]) return false;
        if (!runtime && line.source === 'log') return false;
        if (!needle) return true;
        return (
          line.text.toLowerCase().includes(needle) ||
          line.ref.toLowerCase().includes(needle) ||
          (line.tool ?? '').toLowerCase().includes(needle) ||
          (line.logger ?? '').toLowerCase().includes(needle)
        );
      }),
    [lines, floor, runtime, needle],
  );

  const shown = useMemo(
    () => (service === 'all' ? base : base.filter((line) => line.service === service)),
    [base, service],
  );

  const perService = useMemo(() => {
    const counts = { all: base.length } as Record<ServiceId | 'all', number>;
    for (const source of CONSOLE_SOURCES) counts[source.id] = 0;
    for (const line of base) counts[line.service] = (counts[line.service] ?? 0) + 1;
    return counts;
  }, [base]);

  // Counted off everything the *other* filters allow, so switching floor never
  // makes a chip's number disagree with what switching to it would show.
  const perFloor = useMemo(() => {
    const pool = lines.filter(
      (line) =>
        (runtime || line.source !== 'log') &&
        (service === 'all' || line.service === service) &&
        (!needle ||
          line.text.toLowerCase().includes(needle) ||
          line.ref.toLowerCase().includes(needle)),
    );
    return FLOORS.reduce(
      (counts, option) => {
        counts[option.id] = pool.filter(
          (line) => LEVEL_RANK[line.level] >= LEVEL_RANK[option.id],
        ).length;
        return counts;
      },
      {} as Record<ConsoleLevel, number>,
    );
  }, [lines, runtime, service, needle]);

  // Whether the reader is at the bottom, sampled before the browser paints the
  // rows that just arrived — after would be measuring the new scroll height.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  });

  // How many rows the list grew by, not how many times it changed. A counter
  // bumped once per repaint would say "3 new" after thirty lines arrived in
  // three batches, which is the one number on this button anybody reads.
  const wasShowing = useRef(0);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const grew = shown.length - wasShowing.current;
    wasShowing.current = shown.length;

    if (pinned.current) {
      node.scrollTop = node.scrollHeight;
      setBehind(0);
      setTailing(true);
      return;
    }
    // A filter that narrowed, or a clear, shrinks the list. That is the reader's
    // own doing and it is not news waiting below them.
    if (grew > 0) setBehind((count) => count + grew);
    setTailing(false);
  }, [shown.length]);

  const toBottom = () => {
    const node = box.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
    pinned.current = true;
    setBehind(0);
    setTailing(true);
  };

  const copy = () => {
    const payload = shown.map(asText).join('\n');
    void navigator.clipboard?.writeText(payload).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  };

  const liveCount = CONSOLE_SOURCES.filter((source) => links[source.id]?.state === 'live').length;
  const narrowed = Boolean(needle) || floor !== 'info' || service !== 'all' || !runtime;

  return (
    <div className="fkc">
      {/* The source bar. Four services, always all four, each carrying its own
          connection state — see the component docstring on why a missing one is
          worse than one drawn as down. */}
      <div className="fkc-bar">
        <div className="fkc-sources" role="group" aria-label="Filter by service">
          <button
            type="button"
            className={`fkm-chip${service === 'all' ? ' fkm-chip-on' : ''}`}
            aria-pressed={service === 'all'}
            onClick={() => setService('all')}
            title="Every service at once"
          >
            <span aria-hidden>🛰️</span>
            All agents
            <span className="fkm-chip-count">{perService.all}</span>
          </button>

          {CONSOLE_SOURCES.map((source) => {
            const link = links[source.id];
            return (
              <button
                key={source.id}
                type="button"
                className={`fkm-chip fkc-source${service === source.id ? ' fkm-chip-on' : ''}`}
                aria-pressed={service === source.id}
                onClick={() => setService((current) => (current === source.id ? 'all' : source.id))}
                title={
                  link?.state === 'live'
                    ? `${source.name} — connected on :${source.port}`
                    : link?.state === 'down'
                      ? `${source.name} — not answering on :${source.port}`
                      : `${source.name} — connecting to :${source.port}`
                }
              >
                <span className={`fkc-dot fkc-dot-${link?.state ?? 'connecting'}`} aria-hidden />
                <span aria-hidden>{source.glyph}</span>
                {source.name}
                <span className="fkm-chip-count">{perService[source.id] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="fkc-tools">
          <label className="fkm-search fkc-search">
            <span className="fkm-search-glyph" aria-hidden>
              🔍
            </span>
            <input
              className="fkm-search-input"
              type="search"
              value={text}
              placeholder="Search this console — text, tool, run id"
              onChange={(event) => setText(event.target.value)}
              aria-label="Search the console"
            />
          </label>

          <div className="fkc-levels" role="group" aria-label="Least serious line to show">
            {FLOORS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`fkm-chip fkc-level fkc-level-${option.id}${
                  floor === option.id ? ' fkm-chip-on' : ''
                }`}
                aria-pressed={floor === option.id}
                title={option.hint}
                onClick={() => setFloor(option.id)}
              >
                {option.label}
                <span className="fkm-chip-count">{perFloor[option.id] ?? 0}</span>
              </button>
            ))}
          </div>

          <div className="fkc-switches">
            <button
              type="button"
              className={`fkc-switch${runtime ? ' fkc-switch-on' : ''}`}
              aria-pressed={runtime}
              onClick={() => setRuntime((value) => !value)}
              title="Lines from the Python runtime itself — HTTP calls, retries, tracebacks — as opposed to the agents' own events"
            >
              Runtime
            </button>
            <button
              type="button"
              className={`fkc-switch${paused ? ' fkc-switch-hot' : ''}`}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
              title={
                paused
                  ? 'Resume — everything held while you were reading lands in order'
                  : 'Freeze the view. Lines keep arriving and are shown when you resume.'
              }
            >
              {paused ? `Paused${held ? ` · ${held}` : ''}` : 'Pause'}
            </button>
            <button
              type="button"
              className="fkc-switch"
              onClick={copy}
              title="Copy what is on screen, as text"
              disabled={shown.length === 0}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              className="fkc-switch"
              onClick={clear}
              title="Empty this page's scrollback. The services keep their own — reload and it comes back."
              disabled={lines.length === 0}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="fkc-scroll" ref={box}>
        {shown.length === 0 ? (
          <div className="fkm-empty fkm-empty-inline">
            <span className="fkm-empty-glyph" aria-hidden>
              {allDown ? '🔌' : narrowed ? '🔍' : '📡'}
            </span>
            <p className="fkm-empty-title">
              {allDown
                ? 'No service is answering'
                : narrowed
                  ? 'Nothing matches'
                  : 'Connected. Nothing said yet.'}
            </p>
            <p className="fkm-empty-body">
              {allDown ? (
                <>
                  All four consoles are unreachable. Start them in{' '}
                  <span className="fk-pill-mono">friends-kitchen-agent-backend</span> — 8100, 8101,
                  8102 and 8103. Each one is picked up on its own as it comes back.
                </>
              ) : narrowed ? (
                'No line in this scrollback fits the current filters. Widen one of them.'
              ) : (
                <>
                  {liveCount} of {CONSOLE_SOURCES.length} services are connected and none of them
                  has done anything yet. Unlike the panel above, this one does not need a console
                  open — send an errand from anywhere and it appears here as the agent works.
                </>
              )}
            </p>
          </div>
        ) : (
          <ol className="fkc-list" aria-label="Agent console output" aria-live="off">
            {shown.map((line) => (
              <Row key={line.id} line={line} onOpenTask={onOpenTask} />
            ))}
          </ol>
        )}
      </div>

      <div className="fkc-foot">
        <p className="fkc-count">
          <span className="fk-pill-mono">{shown.length}</span>
          {shown.length === lines.length ? ' lines' : ` of ${lines.length} lines`}
          {paused && held > 0 && <span className="fkc-foot-held">{held} held</span>}
        </p>

        {/* Only while the reader has scrolled away from the tail: a button that
            is always there is a button that stops meaning anything. */}
        {!tailing && (
          <button type="button" className="fkc-jump" onClick={toBottom}>
            ↓ {behind > 0 ? `${behind} new` : 'Jump to live'}
          </button>
        )}
      </div>
    </div>
  );
}
