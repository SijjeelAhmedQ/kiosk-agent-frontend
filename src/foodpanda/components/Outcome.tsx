import type { Job } from '../types';

/**
 * What the dispatcher decided, and what it cost.
 *
 * Sits under the journey because it answers a different question: the journey is
 * *where*, this is *why and how much*. The decision line is the agent's own
 * sentence, kept verbatim — paraphrasing a refusal into a category ("out of
 * area") loses the half a person actually needs, which is what to do instead.
 */

export function Outcome({ job }: { job: Job }) {
  return (
    <>
      {job.decision && (
        <div className={`fp-decision${job.status === 'rejected' ? ' fp-decision-no' : ''}`}>
          <span className="fk-eyebrow">
            {job.status === 'rejected' ? 'Why it was refused' : 'Why it was taken'}
          </span>
          <p>{job.decision}</p>
        </div>
      )}

      <div className="fp-tiles">
        <div className="fp-tile">
          <span className="fp-tile-label">Rider</span>
          <span className="fp-tile-value">{job.courier?.name ?? '—'}</span>
        </div>
        <div className="fp-tile">
          <span className="fp-tile-label">Delivery fee</span>
          {/* Null on a job nobody agreed to make. A price against a refusal
              reads as a charge, and the restaurant would be right to pass it on
              to a customer who is not getting any food. */}
          <span className="fp-tile-value">{job.fee ?? '—'}</span>
        </div>
        <div className="fp-tile">
          <span className="fp-tile-label">{job.done ? 'Took' : 'ETA'}</span>
          <span className="fp-tile-value">
            {job.done
              ? job.timeline.length > 0
                ? `${job.timeline[job.timeline.length - 1].elapsedSeconds.toFixed(0)}s`
                : '—'
              : job.etaSeconds !== null
                ? `~${job.etaSeconds}s`
                : '—'}
          </span>
        </div>
      </div>

      {job.finalText && (
        <div className="fp-final">
          <span className="fk-eyebrow">Reported back to the restaurant</span>
          <p>{job.finalText}</p>
        </div>
      )}

      {job.error && <p className="fp-fault fp-gap">{job.error}</p>}
    </>
  );
}
