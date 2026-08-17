import type { Job, Place } from '../types';

/**
 * The delivery request, as it arrived.
 *
 * This is the A2A message itself — what the Friends Kitchen ordering agent put
 * on the wire, rendered rather than paraphrased. It is shown before anything
 * this agent decided, because every decision below is only as good as what came
 * in, and an operator asking "why did it refuse that?" should be able to answer
 * it from this card.
 *
 * The coordinates are printed in full. A delivery agent's most consequential
 * input is a pair of numbers nobody reads until they are wrong.
 */

interface Props {
  job: Job;
}

function Coordinates({ place }: { place: Place }) {
  return (
    <span className="fp-coords">
      {place.latitude.toFixed(5)}, {place.longitude.toFixed(5)}
    </span>
  );
}

export function RequestCard({ job }: Props) {
  return (
    <div className="fp-request">
      <div className="fp-route">
        <div className="fp-route-leg">
          <span className="fp-route-pin fp-route-pin-from" aria-hidden>
            🏪
          </span>
          <div className="fp-route-text">
            <div className="fk-eyebrow">Collect from</div>
            <div className="fp-route-name">{job.pickup.name ?? 'The restaurant'}</div>
            <div className="fp-route-sub">{job.pickup.address}</div>
            <Coordinates place={job.pickup} />
          </div>
        </div>

        <div className="fp-route-rule" aria-hidden>
          <span className="fp-route-arrow">↓</span>
          {job.distanceKm !== null && (
            <span className="fp-route-distance">{job.distanceKm.toFixed(1)} km</span>
          )}
        </div>

        <div className="fp-route-leg">
          <span className="fp-route-pin fp-route-pin-to" aria-hidden>
            🏠
          </span>
          <div className="fp-route-text">
            <div className="fk-eyebrow">Deliver to</div>
            <div className="fp-route-name">{job.dropoff.address}</div>
            {job.dropoff.note && <div className="fp-route-sub">{job.dropoff.note}</div>}
            <Coordinates place={job.dropoff} />
          </div>
        </div>
      </div>

      {job.distanceKm !== null && (
        <p className="fk-hint">
          Straight-line distance between the two, not a driving route — it is what the
          dispatcher measures its service radius against.
        </p>
      )}

      <div className="fk-eyebrow fp-gap">Carrying</div>
      <ul className="fp-items">
        {job.items.map((item, index) => (
          <li key={`${item.name}-${index}`}>
            <span className="fp-item-qty">{item.quantity}×</span>
            <span className="fp-item-name">{item.name}</span>
            {item.note && <span className="fp-item-note">{item.note}</span>}
          </li>
        ))}
      </ul>

      {job.notes && (
        <>
          <div className="fk-eyebrow fp-gap">For the rider</div>
          <p className="fp-notes">{job.notes}</p>
        </>
      )}

      <div className="fp-facts">
        <span className="fk-badge">Order · {job.orderNumber}</span>
        <span className="fk-badge">Paid</span>
        {job.branchId && <span className="fk-badge">{job.branchId}</span>}
        <span className="fk-badge fk-badge-mono">{job.jobId}</span>
      </div>
    </div>
  );
}
