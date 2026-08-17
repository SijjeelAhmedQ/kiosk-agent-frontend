import { Button } from 'antd';
import type { Job } from '../types';

/**
 * The customer's two requests: find me a rider, and bring it out.
 *
 * These are the only controls on this page that change what happens to a
 * delivery, and they are deliberately narrow. Neither one moves the job: each
 * one opens a gate the dispatcher is already waiting at, and the dispatcher
 * still decides who rides and still has to actually ride. So the buttons are
 * requests, and they are worded as requests.
 *
 * Exactly one is ever live, off `job.awaiting` — the server's own word for what
 * it is holding for, not a guess made here from the status. That matters on a
 * page that polls: a board that inferred "accepted means ask for a rider" would
 * offer the button again for the second and a half between the request landing
 * and the rider appearing, and the second click would 409.
 */

interface Props {
  job: Job;
  /** A request is in flight. Both buttons go down — there is one dispatcher. */
  asking: boolean;
  onFindRider: () => void;
  onDeliver: () => void;
}

export function RequestActions({ job, asking, onFindRider, onDeliver }: Props) {
  const wantsRider = job.awaiting === 'rider';
  const wantsDelivery = job.awaiting === 'delivery';

  // Nothing waiting and nothing to ask for. Said rather than left blank while a
  // job is still moving, because an empty space where a button was reads as a
  // control that has broken rather than one whose turn has passed.
  if (!wantsRider && !wantsDelivery) {
    if (job.done) return null;
    return (
      <p className="fk-hint fp-gap">
        Nothing to ask for right now — the dispatcher is working. The next request
        appears here when it needs one.
      </p>
    );
  }

  return (
    <div className="fp-asks">
      <p className="fp-asks-note">
        {wantsRider
          ? 'The dispatcher has taken this order on and is waiting to be asked for a rider.'
          : `${job.courier?.name ?? 'The rider'} has the order at the restaurant and is waiting to be sent out.`}
      </p>

      <Button
        type="primary"
        size="large"
        block
        loading={asking}
        onClick={wantsRider ? onFindRider : onDeliver}
      >
        {wantsRider ? 'Find a rider →' : 'Deliver it to me →'}
      </Button>

      {/* Where it is going, on the button's own row. The address is the one fact
          worth confirming before asking for a delivery, and it is otherwise two
          panels away. */}
      <p className="fk-hint">
        {wantsRider ? 'Collect from' : 'Deliver to'}{' '}
        <strong>{wantsRider ? (job.pickup.name ?? job.pickup.address) : job.dropoff.address}</strong>
      </p>
    </div>
  );
}
