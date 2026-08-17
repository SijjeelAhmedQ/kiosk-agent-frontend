import type { DeliveryStatus, Job } from '../types';

/**
 * The journey, listed in full from the start.
 *
 * Shown whole rather than revealed a step at a time, so the distance still to go
 * is visible: a job at `picked_up` reads very differently beside the two steps
 * left than it does on its own. The lie this shape prevents is the one where a
 * board shows three green ticks and a person reads it as finished.
 *
 * A refusal or a failure ends the list where it stopped rather than greying out
 * the rest — those are not steps that are still coming.
 */

const JOURNEY: { status: DeliveryStatus; label: string; note: string }[] = [
  { status: 'requested', label: 'Request received', note: 'From the ordering agent' },
  { status: 'accepted', label: 'Job accepted', note: 'The dispatcher took it on' },
  { status: 'courier_assigned', label: 'Rider assigned', note: 'On the way to the restaurant' },
  { status: 'picked_up', label: 'Order collected', note: 'In the rider’s bag' },
  { status: 'in_transit', label: 'On the way', note: 'Riding to the customer' },
  { status: 'delivered', label: 'With the customer', note: 'Handed over' },
];

const STOPPED: DeliveryStatus[] = ['rejected', 'failed', 'cancelled'];

export function Journey({ job }: { job: Job }) {
  const stopped = STOPPED.includes(job.status);
  const reached = JOURNEY.findIndex((step) => step.status === job.status);

  // Where the job got to before it stopped: the last status on the journey that
  // it actually reached, read off its own history rather than guessed from the
  // status it is in now — a refusal leaves it at `requested`.
  const lastOnPath = stopped
    ? job.timeline.reduce((best, entry) => {
        const index = JOURNEY.findIndex((step) => step.status === entry.status);
        return index > best ? index : best;
      }, -1)
    : reached;

  return (
    <>
      <ol className="fp-journey">
        {JOURNEY.map((step, index) => {
          const done = index < lastOnPath || (index === lastOnPath && job.delivered);
          // A delivered job has no "now" — it is all behind it. Without this the
          // last step is both done and current, and the amber of "where it is"
          // paints over the green of "it arrived", which is the one distinction
          // this list exists to make.
          const now = !stopped && !job.delivered && index === reached;
          const reachedHere = index <= lastOnPath;
          return (
            <li
              key={step.status}
              className={[
                'fp-step',
                done ? 'fp-step-done' : '',
                now ? 'fp-step-now' : '',
                !reachedHere ? 'fp-step-todo' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="fp-step-dot" aria-hidden />
              <div className="fp-step-text">
                <span className="fp-step-label">{step.label}</span>
                <span className="fp-step-note">
                  {now && job.message ? job.message : step.note}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {stopped && (
        <p className="fp-halt">
          {job.status === 'rejected'
            ? 'The dispatcher refused this delivery. '
            : job.status === 'cancelled'
              ? 'This delivery was called off. '
              : 'This delivery did not complete. '}
          {job.message}
        </p>
      )}

      {/* Spelled out under a job that is moving. The status words are the
          courier's, and "in_transit" beside a paid, finished-looking order is
          exactly where somebody reads "done". */}
      {!job.done && (
        <p className="fk-hint fp-gap">
          The order is paid and with this agent. It is not delivered until the last
          step says so.
        </p>
      )}
    </>
  );
}
