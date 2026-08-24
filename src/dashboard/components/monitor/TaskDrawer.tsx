/**
 * One task, opened right up — the drawer everything on this page can point at.
 *
 * The panel behind it is arranged by *kind of thing*: agents here, conversation
 * there, calls in a tab. That is the right arrangement for watching a floor and
 * the wrong one for answering "what happened to ORD-1024", which needs one task
 * cut the other way — its ownership, its conversation, its transfers, its calls,
 * its stages — with nothing from any other run in the way.
 *
 * So this is a side drawer rather than a page: the board stays where it was, and
 * closing it puts the operator back exactly where they were looking. Every
 * surface that can name a task opens this one — the run chips, a handover card,
 * a call row, a job in the assignment table downstairs — which is what makes the
 * task id on those surfaces worth printing at all.
 *
 * It is a reader, not a controller. There is no button in here that changes an
 * order, for the same reason the rest of the dashboard has none: this floor
 * already has three consoles that can, and a fourth place to change state is a
 * fourth place for two people to disagree about what happened.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ACTORS,
  ago,
  stamp,
  type Conversation,
  type MonitorEvent,
} from '../../monitor';
import {
  HANDOVER_LOOK,
  lifecycle,
  millis,
  ownership,
  type ApiCall,
  type Handover,
} from '../../ops';
import { ConversationView } from './ConversationView';
import { HandoverBoard } from './HandoverBoard';
import { Lifecycle } from './Lifecycle';
import { TechLog } from './TechLog';

interface Props {
  /** The conversation on screen, or null when the drawer is shut. */
  run: Conversation | null;
  /** Set when a task id was asked for that this page has no events for. */
  missingId: string | null;
  handovers: Handover[];
  calls: ApiCall[];
  now: number;
  onClose: () => void;
  onOpenTask: (correlationId: string) => void;
}

type Tab = 'overview' | 'conversation' | 'handovers' | 'calls' | 'timeline';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'overview', label: 'Overview', glyph: '🧾' },
  { id: 'conversation', label: 'Conversation', glyph: '💬' },
  { id: 'handovers', label: 'Handovers', glyph: '🔀' },
  { id: 'calls', label: 'API & tools', glyph: '⌘' },
  { id: 'timeline', label: 'Timeline', glyph: '🧭' },
];

/** The chain of agents that have held this task, drawn as the route it took. */
function OwnerChain({ run, handovers }: { run: Conversation; handovers: Handover[] }) {
  const chain = ownership(run, handovers);
  if (chain.length === 0) return null;

  return (
    <ol className="fko-chain">
      {chain.map((hop, index) => {
        const meta = ACTORS[hop.actor];
        const current = hop.until === null;
        return (
          <li key={`${hop.actor}-${hop.from}`} className="fko-chain-hop">
            {index > 0 && (
              <span className="fko-chain-link" aria-hidden>
                ↓
              </span>
            )}
            <div className={`fko-chain-card${current ? ' fko-chain-card-now' : ''}`}>
              <span className="fko-chain-glyph" aria-hidden>
                {meta.glyph}
              </span>
              <span className="fko-chain-text">
                <span className="fko-chain-name">
                  {meta.name}
                  {current && <span className="fko-chain-now">current owner</span>}
                </span>
                <span className="fko-chain-why">
                  {hop.by && (
                    <span className="fko-chain-by">
                      handed over by {ACTORS[hop.by].short} ·{' '}
                    </span>
                  )}
                  {hop.because}
                </span>
              </span>
              <span className="fko-chain-when">
                {stamp(hop.from)}
                {hop.until !== null && (
                  <span className="fko-chain-held">held {millis(hop.until - hop.from)}</span>
                )}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** The last thing anybody said, so the overview answers "and now?" without a tab change. */
function Latest({ events }: { events: MonitorEvent[] }) {
  const last = events[events.length - 1];
  if (!last) return null;
  return (
    <p className="fko-latest">
      <span className="fko-latest-who">
        <span aria-hidden>{ACTORS[last.from].glyph}</span>
        {ACTORS[last.from].short}
        {last.to && (
          <>
            <span aria-hidden> → </span>
            {ACTORS[last.to].short}
          </>
        )}
      </span>
      <span className="fko-latest-text">{last.title}</span>
    </p>
  );
}

export function TaskDrawer({
  run,
  missingId,
  handovers,
  calls,
  now,
  onClose,
  onOpenTask,
}: Props) {
  const [tab, setTab] = useState<Tab>('overview');

  // Escape closes it, because a drawer that can only be dismissed by finding a
  // small × is a drawer people leave open over the thing they were reading.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A new task opens on its overview. Keeping the previous tab would be a nicety
  // for one operator and a surprise for everybody who opened a task expecting to
  // see what it is.
  const runId = run?.id ?? missingId;
  useEffect(() => {
    setTab('overview');
  }, [runId]);

  const mine = useMemo(
    () => handovers.filter((move) => move.correlationId === run?.id),
    [handovers, run?.id],
  );
  const myCalls = useMemo(
    () => calls.filter((call) => call.correlationId === run?.id),
    [calls, run?.id],
  );
  const stages = useMemo(() => lifecycle(run), [run]);

  if (!run && !missingId) return null;

  const failures = run ? run.events.filter((event) => event.kind === 'error' || event.ok === false) : [];

  return (
    <div className="fko-drawer-layer" role="dialog" aria-modal="true" aria-label="Task detail">
      {/* The scrim closes it too. It is also what stops the board behind being
          clicked by mistake while a drawer is open over it. */}
      <button type="button" className="fko-scrim" onClick={onClose} aria-label="Close the task" />

      <aside className="fko-drawer">
        <header className="fko-drawer-head">
          <div className="fko-drawer-id">
            <p className="fko-drawer-eyebrow">Task</p>
            <h3 className="fko-drawer-ref">{run ? run.ref : missingId}</h3>
          </div>

          {run && (
            <span
              className={[
                'fko-drawer-state',
                run.live ? 'fko-drawer-state-live' : '',
                run.outcome === 'failed' ? 'fko-drawer-state-bad' : '',
                run.outcome === 'done' ? 'fko-drawer-state-done' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="fko-drawer-dot" aria-hidden />
              {run.live ? 'In progress' : run.outcome === 'failed' ? 'Failed' : 'Completed'}
            </span>
          )}

          <button type="button" className="fko-drawer-close" onClick={onClose} aria-label="Close">
            ⤫
          </button>
        </header>

        {!run ? (
          <div className="fkm-empty">
            <span className="fkm-empty-glyph" aria-hidden>
              📭
            </span>
            <p className="fkm-empty-title">Nothing recorded for this one</p>
            <p className="fkm-empty-body">
              This page has no events under <span className="fk-pill-mono">{missingId}</span>. The
              delivery board keeps the job itself, but the conversation around it only reaches this
              screen while the console that ran it is open — or if it happened before the shared log
              was last cleared.
            </p>
          </div>
        ) : (
          <>
            <nav className="fko-drawer-tabs" role="tablist" aria-label="Task views">
              {TABS.map((option) => {
                const count =
                  option.id === 'conversation'
                    ? run.events.length
                    : option.id === 'handovers'
                      ? mine.length
                      : option.id === 'calls'
                        ? myCalls.length
                        : option.id === 'timeline'
                          ? stages.length
                          : null;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === option.id}
                    className={`fko-drawer-tab${tab === option.id ? ' fko-drawer-tab-on' : ''}`}
                    onClick={() => setTab(option.id)}
                  >
                    <span aria-hidden>{option.glyph}</span>
                    {option.label}
                    {count !== null && <span className="fko-drawer-tab-count">{count}</span>}
                  </button>
                );
              })}
            </nav>

            <div className="fko-drawer-body">
              {tab === 'overview' && (
                <div className="fko-overview">
                  <dl className="fko-facts">
                    <div>
                      <dt>Task id</dt>
                      <dd className="fk-pill-mono">{run.id}</dd>
                    </div>
                    <div>
                      <dt>Opened</dt>
                      <dd>
                        {stamp(run.startedAt)} <span className="fko-facts-ago">({ago(run.startedAt, now)})</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Last event</dt>
                      <dd>
                        {stamp(run.lastAt)} <span className="fko-facts-ago">({ago(run.lastAt, now)})</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Elapsed</dt>
                      <dd>{millis((run.live ? now : run.lastAt) - run.startedAt)}</dd>
                    </div>
                    <div>
                      <dt>Channel</dt>
                      <dd>{run.channel}</dd>
                    </div>
                    <div>
                      <dt>Events</dt>
                      <dd>
                        {run.events.length}
                        {failures.length > 0 && (
                          <span className="fko-facts-bad">{failures.length} failed</span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <section className="fko-block">
                    <h4 className="fko-block-head">What it is doing</h4>
                    <p className="fko-headline">{run.headline}</p>
                    <Latest events={run.events} />
                  </section>

                  <section className="fko-block">
                    <h4 className="fko-block-head">
                      Who has held it
                      <span className="fko-block-note">read from the transfers, in order</span>
                    </h4>
                    <OwnerChain run={run} handovers={handovers} />
                  </section>

                  <section className="fko-block">
                    <h4 className="fko-block-head">
                      Everyone involved
                      <span className="fko-block-note">{run.participants.length} parties</span>
                    </h4>
                    <ul className="fko-parties">
                      {run.participants.map((actor) => (
                        <li key={actor} className={`fko-party-chip fko-party-chip-${ACTORS[actor].sort}`}>
                          <span aria-hidden>{ACTORS[actor].glyph}</span>
                          {ACTORS[actor].name}
                        </li>
                      ))}
                    </ul>
                  </section>

                  {failures.length > 0 && (
                    <section className="fko-block fko-block-bad">
                      <h4 className="fko-block-head">What went wrong</h4>
                      <ol className="fko-traces">
                        {failures.map((event) => (
                          <li key={event.id} className="fko-trace fko-trace-bad">
                            <span className="fko-trace-time">{stamp(event.at)}</span>
                            <span className="fko-trace-who">
                              <span aria-hidden>{ACTORS[event.from].glyph}</span>
                              {ACTORS[event.from].short}
                            </span>
                            <span className="fko-trace-text">
                              {event.title}
                              {event.detail && <span className="fko-trace-sub">{event.detail}</span>}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {mine.length > 0 && (
                    <section className="fko-block">
                      <h4 className="fko-block-head">
                        Handovers
                        <span className="fko-block-note">{mine.length} on this task</span>
                      </h4>
                      <ul className="fko-mini-moves">
                        {mine.map((move) => {
                          const look = HANDOVER_LOOK[move.status];
                          return (
                            <li key={move.id} className="fko-mini-move">
                              <span className={`fko-status fko-status-${look.tone}`}>
                                <span aria-hidden>{look.glyph}</span>
                                {look.label}
                              </span>
                              <span className="fko-mini-move-wire">
                                <span aria-hidden>{ACTORS[move.from].glyph}</span>
                                {ACTORS[move.from].short}
                                <span aria-hidden> → </span>
                                <span aria-hidden>{ACTORS[move.to].glyph}</span>
                                {ACTORS[move.to].short}
                              </span>
                              <span className="fko-mini-move-when">{stamp(move.at)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                </div>
              )}

              {tab === 'conversation' && (
                <div className="fko-drawer-convo">
                  <ConversationView run={run} now={now} />
                </div>
              )}

              {tab === 'handovers' && (
                <HandoverBoard
                  handovers={mine}
                  now={now}
                  onOpenTask={onOpenTask}
                  narrowed={false}
                />
              )}

              {tab === 'calls' && (
                <TechLog calls={myCalls} narrowed={false} onOpenTask={onOpenTask} />
              )}

              {tab === 'timeline' && <Lifecycle run={run} stages={stages} now={now} />}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
