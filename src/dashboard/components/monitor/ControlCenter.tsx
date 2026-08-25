/**
 * The control centre — everything happening between the agents, on one screen.
 *
 * The rest of this dashboard is about *volume*: how much work arrived, how far
 * it got, how long each stage takes. Useful, and none of it answers the question
 * somebody actually has at 2pm on a Tuesday when an order is stuck — **what are
 * they saying to each other right now.**
 *
 * The layout is the argument. Left is the cast: who is on the floor, what each
 * one last did, who they said it to. Right is the script, and it is the same
 * events cut five ways because five different questions get asked of them:
 *
 *   Conversation — what was said, as a conversation
 *   Handovers    — where work changed hands, and whether anybody picked it up
 *   Timeline     — where this one task has got to
 *   Event log    — everything, in order, with payloads
 *   Code         — calls paired with their answers and their round trips
 *
 * Above both is the route — the parties this one request has passed through,
 * with the live hop lit. Read left to right and you go from "who" to "what",
 * which is the order the questions come in.
 *
 * One filter bar sits above all five tabs rather than one per tab. An operator
 * who narrows to the courier and then changes tab is still asking about the
 * courier; a panel that quietly widened back would be answering a question
 * nobody asked. Each tab applies that one query with its own predicate, all of
 * them from `ops.ts`, so the counts on screen can never disagree.
 *
 * On the honesty of what is drawn here. Two of the five agents stream their runs
 * only to whoever started them, so this page hears them by way of the shared bus
 * (`src/shared/agentBus.ts`) — the consoles re-broadcast what they were told, and
 * this reads it. The consequence is stated on screen rather than hidden: with no
 * console open, the two ordering agents are silent here, and the panel says so.
 * The alternative was seeding a demo conversation, which would make this screen
 * worthless for the one job it has.
 */

import { useMemo, useState } from 'react';
import {
  ACTORS,
  ago,
  matches,
  stamp,
  tally,
  type Actor,
  type Conversation,
  type Link,
} from '../../monitor';
import {
  callHits,
  handoverHits,
  hits,
  isNarrowed,
  lifecycle,
  millis,
  unanswered,
  type Query,
} from '../../ops';
import type { Monitor } from '../../useMonitor';
import type { AgentView } from '../../types';
import { AgentRail } from './AgentRail';
import { CommandBar } from './CommandBar';
import { ConversationView } from './ConversationView';
import { EventLog } from './EventLog';
import { FlowRibbon } from './FlowRibbon';
import { HandoverBoard } from './HandoverBoard';
import { Lifecycle } from './Lifecycle';
import { TechLog } from './TechLog';

interface Props {
  monitor: Monitor;
  agents: AgentView[];
  /** Opens the task drawer, which the page owns so every panel can reach it. */
  onOpenTask: (correlationId: string) => void;
}

/**
 * The panel's own pulse line — four readings and the state of the record.
 *
 * Deliberately *not* the eleven-tile grid the overview at the top of the page
 * carries. Those numbers are the page's headline and they are read once on
 * arrival; this line is read while watching, and what it has to answer is
 * narrower: is anything going on, how fast, how many parties, has anything
 * failed, and how stale is what I am looking at. Repeating the overview here
 * would be the same eight figures twice on one screen, which is how a control
 * room becomes a wall of numbers nobody reads.
 */
function PulseBar({ monitor, onReset }: { monitor: Monitor; onReset: () => void }) {
  const { pulse, metrics, now } = monitor;
  const quiet = pulse.events === 0;

  return (
    <div className="fkm-pulsebar">
      <div className="fkm-stat fkm-stat-lead">
        <span className={`fkm-beacon${pulse.live > 0 ? ' fkm-beacon-live' : ''}`} aria-hidden />
        <span className="fkm-stat-body">
          <span className="fkm-stat-value">{pulse.live}</span>
          <span className="fkm-stat-label">
            {pulse.live === 1 ? 'conversation live' : 'conversations live'}
          </span>
        </span>
      </div>

      <div className="fkm-stat">
        <span className="fkm-stat-body">
          <span className="fkm-stat-value">{pulse.perMinute}</span>
          <span className="fkm-stat-label">events in the last minute</span>
        </span>
      </div>

      <div className="fkm-stat">
        <span className="fkm-stat-body">
          <span className="fkm-stat-value">{pulse.talking}</span>
          <span className="fkm-stat-label">parties have spoken</span>
        </span>
      </div>

      <div className="fkm-stat">
        <span className="fkm-stat-body">
          <span className="fkm-stat-value">{millis(metrics.medianCallMs)}</span>
          <span className="fkm-stat-label">median response</span>
        </span>
      </div>

      <div className={`fkm-stat${pulse.errors > 0 ? ' fkm-stat-bad' : ''}`}>
        <span className="fkm-stat-body">
          <span className="fkm-stat-value">{pulse.errors}</span>
          <span className="fkm-stat-label">
            {pulse.errors === 1 ? 'failure' : 'failures'} recorded
          </span>
        </span>
      </div>

      <p className="fkm-pulsebar-when">
        {quiet ? 'nothing recorded yet' : `last event ${ago(pulse.lastAt!, now)}`}
      </p>

      {/* The only control on this whole page that changes anything, and what it
          changes is shared — the log lives in `localStorage`, so clearing it
          here clears it in the consoles too. Hence the confirmation: an
          accidental click here destroys the record of a run somebody in another
          tab may be halfway through reading. */}
      <button
        type="button"
        className="fkm-wipe"
        onClick={() => {
          const ok = window.confirm(
            `Clear all ${pulse.events} recorded events? This wipes the shared log in ` +
              'every open tab. Runs that are still going will start filling it again ' +
              'straight away.',
          );
          if (ok) onReset();
        }}
        disabled={quiet}
        title="Clear the recorded event history in every open tab"
      >
        Clear history
      </button>
    </div>
  );
}

/** The runs, newest first — one chip each, live ones marked. */
function RunPicker({
  runs,
  selected,
  onSelect,
  now,
}: {
  runs: Conversation[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  now: number;
}) {
  if (runs.length === 0) return null;

  const CHANNEL: Record<Conversation['channel'], string> = {
    ordering: '🤖',
    a2a: '🤝',
    delivery: '🛵',
  };

  return (
    <div className="fkm-runs" role="group" aria-label="Pick a conversation">
      {runs.slice(0, 10).map((run) => (
        <button
          key={run.id}
          type="button"
          className={[
            'fkm-run',
            run.id === selected ? 'fkm-run-on' : '',
            run.live ? 'fkm-run-live' : '',
            run.outcome === 'failed' ? 'fkm-run-bad' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={run.id === selected}
          onClick={() => onSelect(run.id === selected ? null : run.id)}
        >
          <span aria-hidden>{CHANNEL[run.channel]}</span>
          <span className="fkm-run-ref">{run.ref}</span>
          <span className="fkm-run-meta">
            {run.live ? 'live' : run.outcome === 'failed' ? 'failed' : ago(run.lastAt, now)}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Who has called whom, as a list of directed wires.
 *
 * Direction is kept — `buyer → merchant` and `merchant → buyer` are two rows —
 * because "the merchant has stopped answering" is a state this list should be
 * able to show, and a symmetric edge cannot show it.
 *
 * A row is also a filter: clicking one narrows every tab on the right to that
 * agent, which is the move somebody makes immediately after spotting a wire with
 * failures on it.
 */
function LinkStrip({
  links,
  now,
  focus,
  onFocus,
}: {
  links: Link[];
  now: number;
  focus: Actor | null;
  onFocus: (actor: Actor) => void;
}) {
  if (links.length === 0) {
    return <p className="fkm-links-empty">No agent has called another one yet.</p>;
  }

  return (
    <ul className="fkm-links">
      {links.slice(0, 8).map((link) => (
        <li
          key={link.key}
          className={[
            'fkm-link',
            link.hot ? 'fkm-link-hot' : '',
            link.errors > 0 ? 'fkm-link-bad' : '',
            focus === link.from || focus === link.to ? 'fko-link-focus' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className="fko-link-hit"
            onClick={() => onFocus(link.from)}
            aria-label={`Show only ${ACTORS[link.from].name}`}
          />
          <p className="fkm-link-head">
            <span className="fkm-link-who">
              <span aria-hidden>{ACTORS[link.from].glyph}</span>
              {ACTORS[link.from].short}
            </span>
            <span className="fkm-link-arrow" aria-hidden>
              <span className="fkm-link-arrow-line" />→
            </span>
            <span className="fkm-link-who">
              <span aria-hidden>{ACTORS[link.to].glyph}</span>
              {ACTORS[link.to].short}
            </span>
            <span className="fkm-link-count">{link.count}</span>
          </p>
          <p className="fkm-link-last" title={link.lastTitle}>
            {link.lastTitle}
          </p>
          <p className="fkm-link-when">
            {stamp(link.lastAt)} · {ago(link.lastAt, now)}
            {link.errors > 0 && <span className="fkm-link-errs">{link.errors} failed</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}

type Tab = 'conversation' | 'handovers' | 'timeline' | 'log' | 'code';

export function ControlCenter({ monitor, agents, onOpenTask }: Props) {
  /** The run the operator pinned, or null to follow whatever is newest. */
  const [pinned, setPinned] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('conversation');
  const [query, setQuery] = useState<Query>({
    text: '',
    agent: 'all',
    kind: 'all',
    status: 'all',
    minutes: null,
  });

  const { conversations, events, links, activity, now } = monitor;

  /**
   * The run on screen: the pinned one, or the newest that is still live, or
   * simply the newest. Following the live one by default is what makes this
   * panel work unattended — a screen on the wall should be showing the thing
   * that is happening without anybody touching it.
   */
  const run = useMemo(() => {
    if (pinned) return conversations.find((entry) => entry.id === pinned) ?? null;
    return conversations.find((entry) => entry.live) ?? conversations[0] ?? null;
  }, [conversations, pinned]);

  // The agent filter doubles as the rail's focus, so clicking a card and picking
  // an agent from the bar are the same act rather than two states that can
  // disagree on screen.
  const focus = query.agent === 'all' ? null : query.agent;
  const setFocus = (actor: Actor) =>
    setQuery((current) => ({ ...current, agent: current.agent === actor ? 'all' : actor }));

  // The tabs follow the pin, not the auto-selection: a view that silently
  // narrowed itself because a new run started would hide the row somebody was
  // reading.
  const scoped = useMemo(
    () => (pinned && run ? run.events : events),
    [events, pinned, run],
  );

  // Everything except the kind, so the log's chips can carry honest counts and
  // still be a live control over the same query.
  const base = useMemo(
    () => scoped.filter((event) => hits(event, { ...query, kind: 'all' }, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scoped, query.text, query.agent, query.status, query.minutes, Math.floor(now / 5000)],
  );
  const counts = useMemo(() => tally(base), [base]);
  const logEvents = useMemo(
    () => base.filter((event) => matches(event, query.kind)),
    [base, query.kind],
  );

  const moves = useMemo(
    () =>
      monitor.handovers.filter(
        (move) =>
          (!pinned || move.correlationId === pinned) && handoverHits(move, query, now),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monitor.handovers, pinned, query, Math.floor(now / 5000)],
  );

  const calls = useMemo(
    () =>
      monitor.calls.filter(
        (call) => (!pinned || call.correlationId === pinned) && callHits(call, query, now),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monitor.calls, pinned, query, Math.floor(now / 5000)],
  );

  const stages = useMemo(() => lifecycle(run), [run]);

  const quiet = events.length === 0;
  const narrowed = isNarrowed(query);

  /**
   * The transcript, under the same query as everything else.
   *
   * The alternative — leaving the conversation unfiltered while the bar above it
   * reports a narrowed count — is the one arrangement that is actually wrong: it
   * puts a number on screen that does not describe what is under it. Searching
   * inside a long negotiation is also the thing people try first, and it only
   * works if the transcript answers.
   */
  const runView = useMemo(() => {
    if (!run || !narrowed) return run;
    return { ...run, events: run.events.filter((event) => hits(event, query, now)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, narrowed, query, Math.floor(now / 5000)]);
  const stuck = monitor.handovers.filter((move) => unanswered(move, now)).length;

  const TABS: { id: Tab; label: string; glyph: string; count: number; alert?: boolean }[] = [
    { id: 'conversation', label: 'Conversation', glyph: '💬', count: runView?.events.length ?? 0 },
    {
      id: 'handovers',
      label: 'Handovers',
      glyph: '🔀',
      count: moves.length,
      alert: stuck > 0,
    },
    { id: 'timeline', label: 'Timeline', glyph: '🧭', count: stages.length },
    { id: 'log', label: 'Event log', glyph: '🗂️', count: logEvents.length },
    { id: 'code', label: 'Code', glyph: '⌘', count: calls.length },
  ];

  const noun =
    tab === 'handovers' ? 'handovers' : tab === 'code' ? 'calls' : tab === 'timeline' ? 'stages' : 'events';
  const showing =
    tab === 'handovers'
      ? moves.length
      : tab === 'code'
        ? calls.length
        : tab === 'timeline'
          ? stages.length
          : tab === 'conversation'
            ? (runView?.events.length ?? 0)
            : logEvents.length;
  const total =
    tab === 'handovers'
      ? monitor.handovers.length
      : tab === 'code'
        ? monitor.calls.length
        : tab === 'timeline'
          ? stages.length
          : tab === 'conversation'
            ? (run?.events.length ?? 0)
            : scoped.length;

  return (
    <div className="fkm">
      <PulseBar monitor={monitor} onReset={monitor.reset} />

      <div className="fkm-top">
        <RunPicker runs={conversations} selected={pinned} onSelect={setPinned} now={now} />
        <FlowRibbon run={run} now={now} />
      </div>

      {quiet && (
        <div className="fkm-note">
          <span className="fkm-note-glyph" aria-hidden>
            📡
          </span>
          <div>
            <p className="fkm-note-title">Listening. Nothing has been said yet.</p>
            <p className="fkm-note-body">
              The delivery dispatcher streams to this page directly, so its work appears here on
              its own. The <a href="/">ordering agent</a> and the{' '}
              <a href="/a2a.html">A2A desk</a> stream only to whoever started a run — so their
              conversations reach this screen while one of those consoles is open in another tab,
              and this panel stays empty rather than showing you an invented one. The console
              panel below has no such gap: it reads each process directly and fills whether or not
              anybody is driving one from here.
            </p>
          </div>
        </div>
      )}

      {/* The one thing on this panel worth interrupting somebody for: work that
          was handed to an agent which has not answered. Everything else here is
          a view; this is a symptom. */}
      {stuck > 0 && (
        <button
          type="button"
          className="fko-alert"
          onClick={() => {
            setTab('handovers');
            setPinned(null);
          }}
        >
          <span className="fko-alert-glyph" aria-hidden>
            ⚠️
          </span>
          <span className="fko-alert-text">
            <strong>
              {stuck} {stuck === 1 ? 'handover has' : 'handovers have'} not been answered
            </strong>
            <span>Work was passed to an agent that has said nothing since. Open the board.</span>
          </span>
          <span className="fko-alert-go" aria-hidden>
            ›
          </span>
        </button>
      )}

      <div className="fkm-split">
        <section className="fkm-pane fkm-pane-left" aria-label="Agents and their traffic">
          <header className="fkm-pane-head">
            <h3 className="fkm-pane-title">On the floor</h3>
            <p className="fkm-pane-note">
              Health from the poll, activity from the wire — a card shows both
            </p>
            {focus && (
              <button
                type="button"
                className="fkm-unfocus"
                onClick={() => setQuery((current) => ({ ...current, agent: 'all' }))}
              >
                <span aria-hidden>⤫</span> {ACTORS[focus].short} only
              </button>
            )}
          </header>

          <AgentRail
            agents={agents}
            activity={activity}
            now={now}
            focus={focus}
            onFocus={setFocus}
          />

          <div className="fkm-links-block">
            <h4 className="fkm-sub">Who is calling whom</h4>
            <LinkStrip links={links} now={now} focus={focus} onFocus={setFocus} />
          </div>
        </section>

        <section className="fkm-pane fkm-pane-right" aria-label="Conversation, handovers and logs">
          <header className="fkm-pane-head fko-pane-head">
            <div className="fkm-tabs" role="tablist" aria-label="What to show">
              {TABS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === option.id}
                  className={[
                    'fkm-tab',
                    tab === option.id ? 'fkm-tab-on' : '',
                    option.alert ? 'fko-tab-alert' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setTab(option.id)}
                >
                  <span aria-hidden>{option.glyph}</span> {option.label}
                  <span className="fkm-tab-count">{option.count}</span>
                </button>
              ))}
            </div>

            {run && (
              <p className="fkm-pane-note fkm-pane-note-right">
                {run.ref} · started {stamp(run.startedAt)} ·{' '}
                {run.live ? 'in progress' : run.outcome === 'failed' ? 'failed' : 'finished'}
                <button
                  type="button"
                  className="fko-inspect"
                  onClick={() => onOpenTask(run.id)}
                  title="Open the whole task in a drawer"
                >
                  Inspect <span aria-hidden>⤢</span>
                </button>
              </p>
            )}
          </header>

          <CommandBar
            query={query}
            onQuery={setQuery}
            showing={showing}
            total={total}
            noun={noun}
          />

          {pinned && (
            <p className="fko-scope-line">
              <span aria-hidden>📌</span> Showing one task — <strong>{run?.ref ?? pinned}</strong>
              <button type="button" className="fko-scope-clear" onClick={() => setPinned(null)}>
                see the whole floor
              </button>
            </p>
          )}

          <div className="fkm-pane-body">
            {tab === 'conversation' &&
              (narrowed && runView && runView.events.length === 0 ? (
                <div className="fkm-empty">
                  <span className="fkm-empty-glyph" aria-hidden>
                    🔍
                  </span>
                  <p className="fkm-empty-title">Nothing in this conversation matches</p>
                  <p className="fkm-empty-body">
                    {run?.ref} has {run?.events.length} events, none of which fit the current
                    filters. Clear them to read the whole thing.
                  </p>
                </div>
              ) : (
                <ConversationView run={runView} now={now} />
              ))}

            {tab === 'handovers' && (
              <HandoverBoard
                handovers={moves}
                now={now}
                onOpenTask={onOpenTask}
                narrowed={narrowed || pinned !== null}
              />
            )}

            {tab === 'timeline' && <Lifecycle run={run} stages={stages} now={now} />}

            {tab === 'log' && (
              <EventLog
                events={logEvents}
                counts={counts}
                kind={query.kind}
                onKind={(kind) => setQuery((current) => ({ ...current, kind }))}
                onOpenTask={onOpenTask}
                narrowed={narrowed}
              />
            )}

            {tab === 'code' && (
              <TechLog calls={calls} narrowed={narrowed || pinned !== null} onOpenTask={onOpenTask} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
