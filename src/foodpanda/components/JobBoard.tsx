import { StatusPill } from './StatusPill';
import type { Job } from '../types';

/**
 * Everything the dispatcher is carrying, newest first.
 *
 * A board rather than a queue: jobs do not leave it when they land, because
 * "what happened to that delivery an hour ago" is a question somebody asks and
 * a queue that empties itself cannot answer.
 */

interface Props {
  jobs: Job[];
  selectedId: string | null;
  onSelect: (jobId: string) => void;
}

/** The clock time a job arrived, which is what an operator scans for. */
function arrived(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? ''
    : at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function JobBoard({ jobs, selectedId, onSelect }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="fk-empty">
        <div className="fk-empty-art" aria-hidden>
          🛵
        </div>
        <p className="fk-empty-title">Nothing to deliver yet</p>
        <p className="fk-empty-note">
          Jobs land here when the Friends Kitchen ordering agent finishes an order and
          hands it over. You can also send one by hand below.
        </p>
      </div>
    );
  }

  return (
    <ul className="fp-board">
      {jobs.map((job) => (
        <li key={job.jobId}>
          <button
            type="button"
            className={`fp-job${job.jobId === selectedId ? ' fp-job-on' : ''}`}
            onClick={() => onSelect(job.jobId)}
            aria-current={job.jobId === selectedId}
          >
            <div className="fp-job-top">
              <span className="fp-job-order">{job.orderNumber}</span>
              <StatusPill status={job.status} live={!job.done} />
            </div>

            <div className="fp-job-line">
              {job.itemCount} {job.itemCount === 1 ? 'item' : 'items'}
              {job.distanceKm !== null && <> · {job.distanceKm.toFixed(1)} km</>}
              {job.courier && <> · {job.courier.name}</>}
            </div>

            {/* A job holding for a request is the one thing on this list that
                needs somebody, so it says so on the row rather than only once
                the row has been opened. */}
            {job.awaiting && (
              <div className="fp-job-waiting">
                {job.awaiting === 'rider' ? 'Waiting for a rider request' : 'Waiting to be sent out'}
              </div>
            )}

            <div className="fp-job-foot">
              <span className="fp-job-time">{arrived(job.createdAt)}</span>
              <span className="fp-job-id">{job.jobId}</span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
