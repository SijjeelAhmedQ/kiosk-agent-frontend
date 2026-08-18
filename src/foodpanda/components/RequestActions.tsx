import { Button } from 'antd';
import type { Job } from '../types';

/**
 * The customer's one request: find me a rider.
 *
 * This is the only control on this page that changes what happens to a delivery,
 * and it is deliberately narrow. It does not move the job: it opens a gate the
 * dispatcher is already waiting at, and the dispatcher still decides who rides
 * and still has to actually ride. So the button is a request, and it is worded
 * as one.
 *
 * It lights off `job.awaiting` — the server's own word for what it is holding
 * for, not a guess made here from the status. That matters on a page that polls:
 * a board that inferred "accepted means ask for a rider" would offer the button
 * again for the second and a half between the request landing and the rider
 * appearing, and the second click would 409.
 *
 * ── The gate that used to have a button ─────────────────────────────────────
 *
 * There was a second one here, "Deliver it to me", for the moment the rider is
 * outside the restaurant with the food in the bag. It is gone, and not because
 * the gate is: `useDeliveryBoard` answers it the instant it opens, for every job
 * on the board. Every delivery that reaches this agent is going to the customer,
 * so that gate only ever had one answer, and a button whose only job is to say
 * the default out loud is a rider standing still.
 *
 * What is left in its place is a line saying the order is on its way out. Said
 * rather than left blank, because an absent control and a broken one look the
 * same, and the difference is the whole story of what this delivery is doing.
 */

interface Props {
  job: Job;
  /** The rider request is in flight — the button is spent until it answers. */
  asking: boolean;
  onFindRider: () => void;
}

export function RequestActions({ job, asking, onFindRider }: Props) {
  const wantsRider = job.awaiting === 'rider';
  const wantsDelivery = job.awaiting === 'delivery';

  // At the delivery gate, which nobody has to open. The board has already asked
  // for this to go out; the stream is a second or two behind saying it has.
  if (wantsDelivery) {
    return (
      <div className="fp-asks">
        <p className="fp-asks-note">
          {job.courier?.name ?? 'The rider'} has the order at the restaurant and is
          being sent out now — this delivery does not wait to be asked for.
        </p>
        <p className="fk-hint">
          Deliver to <strong>{job.dropoff.address}</strong>
        </p>
      </div>
    );
  }

  // Nothing waiting and nothing to ask for. Said rather than left blank while a
  // job is still moving, because an empty space where a button was reads as a
  // control that has broken rather than one whose turn has passed.
  if (!wantsRider) {
    if (job.done) return null;
    return (
      <p className="fk-hint fp-gap">
        Nothing to ask for right now — the dispatcher is working. The next request
        appears here when it needs one. Being brought out to the customer will not
        be one of them: this delivery goes out without stopping here.
      </p>
    );
  }

  return (
    <div className="fp-asks">
      <p className="fp-asks-note">
        The dispatcher has taken this order on and is waiting to be asked for a
        rider.
      </p>

      <Button type="primary" size="large" block loading={asking} onClick={onFindRider}>
        Find a rider →
      </Button>

      {/* Where it is coming from, on the button's own row. The restaurant is the
          one fact worth confirming before asking for a rider, and it is
          otherwise two panels away. */}
      <p className="fk-hint">
        Collect from <strong>{job.pickup.name ?? job.pickup.address}</strong>
      </p>
    </div>
  );
}
