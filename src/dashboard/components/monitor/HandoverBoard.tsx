/**
 * Every time work changed hands, drawn as the thing it is: a transfer.
 *
 * This is the one view on the floor that exists because the system is
 * multi-agent. Everything else here would still make sense with one worker doing
 * everything — a log, a transcript, a latency figure. A handover is where a
 * multi-agent system fails in ways a single agent cannot: the merchant thinks
 * the courier has it, the courier never answered, and both consoles look fine.
 *
 * So the card is built around the two facts that catch exactly that, and it puts
 * them where the eye lands first:
 *
 *   · **who now owns it** — the two parties, with the arrow between them, drawn
 *     as boxes rather than as a sentence, because "from → to" is the question;
 *   · **whether the receiver ever answered** — its own line, with the delay in
 *     milliseconds, because a handover nobody picked up is the failure this
 *     screen is for and it looks identical to a healthy one in a log.
 *
 * Nothing here is inferred beyond what `ops.ts` can point at. "Accepted" means a
 * real event from the receiver exists and it is listed underneath; a handover
 * with nothing after it says `pending` and stays pending, however long ago it
 * was. The temptation to round an old pending handover up to "probably fine" is
 * the temptation to make this whole panel worthless.
 */

import { ACTORS, ago, stamp, type MonitorEvent } from '../../monitor';
import { HANDOVER_LOOK, millis, unanswered, type Handover } from '../../ops';

interface Props {
  handovers: Handover[];
  now: number;
  /** Open the full task drawer for the run this handover happened in. */
  onOpenTask: (correlationId: string) => void;
  /** True when a filter is on, so "nothing here" can say which nothing it means. */
  narrowed: boolean;
}

/** One party's box in the transfer diagram. */
function Party({
  actor,
  caption,
  state,
}: {
  actor: Handover['from'];
  caption: string;
  state: 'from' | 'to';
}) {
  const meta = ACTORS[actor];
  return (
    <div className={`fko-party fko-party-${state}`}>
      <span className="fko-party-glyph" aria-hidden>
        {meta.glyph}
      </span>
      <span className="fko-party-text">
        <span className="fko-party-name">{meta.name}</span>
        <span className="fko-party-role">{caption}</span>
      </span>
    </div>
  );
}

/** A supporting event, listed small under the card. */
function Trace({ event, label }: { event: MonitorEvent; label?: string }) {
  const bad = event.kind === 'error' || event.ok === false;
  return (
    <li className={`fko-trace${bad ? ' fko-trace-bad' : ''}`}>
      <span className="fko-trace-time">{stamp(event.at)}</span>
      <span className="fko-trace-who">
        <span aria-hidden>{ACTORS[event.from].glyph}</span>
        {ACTORS[event.from].short}
        {event.to && (
          <>
            <span className="fko-trace-arrow" aria-hidden>
              →
            </span>
            {ACTORS[event.to].short}
          </>
        )}
      </span>
      <span className="fko-trace-text">{event.title}</span>
      {label && <span className="fko-trace-tag">{label}</span>}
    </li>
  );
}

function Card({
  handover,
  now,
  onOpenTask,
}: {
  handover: Handover;
  now: number;
  onOpenTask: (id: string) => void;
}) {
  const look = HANDOVER_LOOK[handover.status];
  const stale = unanswered(handover, now);

  return (
    <article
      className={[
        'fko-move',
        `fko-move-${look.tone}`,
        stale ? 'fko-move-stale' : '',
        handover.sort === 'assignment' ? 'fko-move-assign' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="fko-move-head">
        <span className={`fko-status fko-status-${look.tone}`}>
          <span aria-hidden>{look.glyph}</span>
          {look.label}
        </span>

        <span className="fko-move-kind">
          {handover.sort === 'assignment' ? 'Task assigned' : 'Automatic handover'}
        </span>

        <button
          type="button"
          className="fko-move-ref"
          onClick={() => onOpenTask(handover.correlationId)}
          title="Open the full task"
        >
          {handover.ref}
        </button>

        <span className="fko-move-when">
          {stamp(handover.at)} · {ago(handover.at, now)}
        </span>
      </header>

      {/* The transfer itself. Two boxes and an arrow — the same shape as the
          sketch an operator would draw on paper when asked what happened. */}
      <div className="fko-transfer">
        <Party actor={handover.from} caption="previous owner" state="from" />

        <div className={`fko-arrow${handover.status === 'pending' ? ' fko-arrow-open' : ''}`}>
          <span className="fko-arrow-line" aria-hidden>
            <span className="fko-arrow-pulse" />
          </span>
          <span className="fko-arrow-label">
            {handover.answerMs === null ? 'awaiting answer' : `answered in ${millis(handover.answerMs)}`}
          </span>
          <span className="fko-arrow-head" aria-hidden>
            ▸
          </span>
        </div>

        <Party actor={handover.to} caption="new owner" state="to" />
      </div>

      <dl className="fko-move-facts">
        <div>
          <dt>Reason given</dt>
          <dd className="fko-move-reason">{handover.reason}</dd>
        </div>
        <div>
          <dt>Receiver's first move</dt>
          <dd>
            {handover.acceptedWith ? (
              <>
                <span className="fko-move-accept">{handover.acceptedWith}</span>
                <span className="fko-move-accept-when">{stamp(handover.acceptedAt!)}</span>
              </>
            ) : (
              <span className="fko-move-none">
                {stale
                  ? `Nothing heard from ${ACTORS[handover.to].short} since`
                  : 'Waiting on the receiver'}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd>
            {handover.settledWith ? (
              <>
                <span>{handover.settledWith}</span>
                <span className="fko-move-accept-when">{stamp(handover.settledAt!)}</span>
              </>
            ) : (
              <span className="fko-move-none">Not finished yet</span>
            )}
          </dd>
        </div>
      </dl>

      {handover.detail && <p className="fko-move-detail">{handover.detail}</p>}

      {/* Before and after, on the same card. "What happened after the handover"
          is a question with an answer here rather than a reason to go hunting in
          the log — including when the answer lives in a different run, which is
          what a delivery job is. */}
      {(handover.before.length > 0 || handover.after.length > 0) && (
        <details className="fko-move-context">
          <summary>
            What happened around it
            <span className="fko-move-context-count">
              {handover.before.length} before · {handover.after.length} after
            </span>
          </summary>
          <div className="fko-move-context-body">
            {handover.before.length > 0 && (
              <>
                <p className="fko-move-context-head">Before</p>
                <ol className="fko-traces">
                  {handover.before.map((event) => (
                    <Trace key={event.id} event={event} />
                  ))}
                </ol>
              </>
            )}
            {handover.after.length > 0 && (
              <>
                <p className="fko-move-context-head">After</p>
                <ol className="fko-traces">
                  {handover.after.map((event) => (
                    <Trace
                      key={event.id}
                      event={event}
                      label={
                        handover.linkedId && event.correlationId === handover.linkedId
                          ? 'new job'
                          : undefined
                      }
                    />
                  ))}
                </ol>
              </>
            )}
            {handover.linkedId && (
              <button
                type="button"
                className="fko-move-follow"
                onClick={() => onOpenTask(handover.linkedId!)}
              >
                Follow the job this opened <span aria-hidden>›</span>
              </button>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

export function HandoverBoard({ handovers, now, onOpenTask, narrowed }: Props) {
  if (handovers.length === 0) {
    return (
      <div className="fkm-empty">
        <span className="fkm-empty-glyph" aria-hidden>
          {narrowed ? '🔍' : '🔀'}
        </span>
        <p className="fkm-empty-title">
          {narrowed ? 'No handover matches' : 'No work has changed hands yet'}
        </p>
        <p className="fkm-empty-body">
          {narrowed
            ? 'No transfer in this range fits the current filters. Widen one of them.'
            : 'A handover appears the moment one agent gives a task to another — the ordering desk passing a paid order to the courier, or the dispatcher putting a job on a bike. Nothing is drawn here until that actually happens.'}
        </p>
      </div>
    );
  }

  const open = handovers.filter(
    (move) => move.status === 'pending' || move.status === 'accepted' || move.status === 'in_progress',
  ).length;

  return (
    <div className="fko-moves">
      <p className="fko-moves-lead">
        <strong>{handovers.length}</strong> {handovers.length === 1 ? 'transfer' : 'transfers'}
        {open > 0 && (
          <>
            {' · '}
            <span className="fko-moves-open">{open} still open</span>
          </>
        )}
      </p>

      {handovers.map((handover) => (
        <Card key={handover.id} handover={handover} now={now} onOpenTask={onOpenTask} />
      ))}
    </div>
  );
}
