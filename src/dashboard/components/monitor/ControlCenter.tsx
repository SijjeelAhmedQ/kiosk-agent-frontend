/**
 * The control centre — everything happening between the agents, on one screen.
 *
 * The rest of this dashboard is about *volume*: how much work arrived, how far
 * it got, how long each stage takes. Useful, and none of it answers the question
 * somebody actually has at 2pm on a Tuesday when an order is stuck — **what are
 * they saying to each other right now.**
 *
 * The layout is the argument. Left is the cast: who is on the floor, what each
 * one last did, who they said it to. Right is the script: the conversation as a
 * conversation, and behind it the full log with every payload. Above both is the
 * route — the parties this one request has passed through, with the live hop
 * lit. Read left to right and you go from "who" to "what", which is the order
 * the questions come in.
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
import { ACTORS, ago, stamp, type Actor, type Conversation, type Link } from '../../monitor';
import type { Monitor } from '../../useMonitor';
import type { AgentView } from '../../types';
import { AgentRail } from './AgentRail';
import { ConversationView } from './ConversationView';
import { EventLog } from './EventLog';
import { FlowRibbon } from './FlowRibbon';

interface Props {
  monitor: Monitor;
  agents: AgentView[];
}

/** The four numbers along the top. Each one is a different kind of "is it ok". */
function PulseBar({ monitor, onReset }: { monitor: Monitor; onReset: () => void }) {
  const { pulse, now } = monitor;
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
 */
function LinkStrip({ links, now }: { links: Link[]; now: number }) {
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
          ]
            .filter(Boolean)
            .join(' ')}
        >
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

export function ControlCenter({ monitor, agents }: Props) {
  /** The run the operator pinned, or null to follow whatever is newest. */
  const [pinned, setPinned] = useState<string | null>(null);
  const [tab, setTab] = useState<'conversation' | 'log'>('conversation');
  const [focus, setFocus] = useState<Actor | null>(null);

  const { conversations, events, counts, links, activity, now } = monitor;

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

  // The log follows the pin, not the auto-selection: a log that silently
  // narrowed itself because a new run started would hide the row somebody was
  // reading. Focusing an agent narrows it further, and says so on the chip.
  const logEvents = useMemo(() => {
    const base = pinned && run ? run.events : events;
    return focus ? base.filter((event) => event.from === focus || event.to === focus) : base;
  }, [events, focus, pinned, run]);

  const quiet = events.length === 0;

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
              and this panel stays empty rather than showing you an invented one.
            </p>
          </div>
        </div>
      )}

      <div className="fkm-split">
        <section className="fkm-pane fkm-pane-left" aria-label="Agents and their traffic">
          <header className="fkm-pane-head">
            <h3 className="fkm-pane-title">On the floor</h3>
            <p className="fkm-pane-note">
              Health from the poll, activity from the wire — a card shows both
            </p>
            {focus && (
              <button type="button" className="fkm-unfocus" onClick={() => setFocus(null)}>
                <span aria-hidden>⤫</span> {ACTORS[focus].short} only
              </button>
            )}
          </header>

          <AgentRail
            agents={agents}
            activity={activity}
            now={now}
            focus={focus}
            onFocus={(actor) => setFocus((current) => (current === actor ? null : actor))}
          />

          <div className="fkm-links-block">
            <h4 className="fkm-sub">Who is calling whom</h4>
            <LinkStrip links={links} now={now} />
          </div>
        </section>

        <section className="fkm-pane fkm-pane-right" aria-label="Conversation and event log">
          <header className="fkm-pane-head">
            <div className="fkm-tabs" role="tablist" aria-label="What to show">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'conversation'}
                className={`fkm-tab${tab === 'conversation' ? ' fkm-tab-on' : ''}`}
                onClick={() => setTab('conversation')}
              >
                <span aria-hidden>💬</span> Conversation
                {run && <span className="fkm-tab-count">{run.events.length}</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'log'}
                className={`fkm-tab${tab === 'log' ? ' fkm-tab-on' : ''}`}
                onClick={() => setTab('log')}
              >
                <span aria-hidden>🗂️</span> Event log
                <span className="fkm-tab-count">{logEvents.length}</span>
              </button>
            </div>

            {tab === 'conversation' && run && (
              <p className="fkm-pane-note fkm-pane-note-right">
                {run.ref} · started {stamp(run.startedAt)} ·{' '}
                {run.live ? 'in progress' : run.outcome === 'failed' ? 'failed' : 'finished'}
              </p>
            )}
          </header>

          <div className="fkm-pane-body">
            {tab === 'conversation' ? (
              <ConversationView run={run} now={now} />
            ) : (
              <EventLog
                events={logEvents}
                counts={counts}
                scope={pinned}
                onClearScope={() => setPinned(null)}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
