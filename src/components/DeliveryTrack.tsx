import type { ReactNode } from 'react';
import { Panel } from '@/components/Panel';
import {
  AlertTriangle,
  CheckCircle,
  Home,
  Hourglass,
  MapPin,
  QuestionCircle,
  Scooter,
  StopOctagon,
  Storefront,
} from '@/icons';
import type { DeliveryContext, DeliveryJob, DeliveryStatus } from '@/types';
import { V } from '@/theme';

interface Props {
  context: DeliveryContext | null;
  job: DeliveryJob | null;
  /** The errand is still running — a job with no news yet is not stalled. */
  busy: boolean;
}

/**
 * The courier's journey, in the order it happens.
 *
 * Listed in full from the start rather than revealed a step at a time, so the
 * distance still to go is visible: a job at `picked_up` reads very differently
 * beside the two steps left than it does on its own.
 */
const JOURNEY: { status: DeliveryStatus; label: string }[] = [
  { status: 'requested', label: 'Sent to the courier' },
  { status: 'accepted', label: 'Courier accepted' },
  { status: 'courier_assigned', label: 'Rider assigned' },
  { status: 'picked_up', label: 'Collected from the branch' },
  { status: 'in_transit', label: 'On the way' },
  { status: 'delivered', label: 'With the customer' },
];

/** Where a status sits on the journey, or -1 for one that left it. */
const stepOf = (status: DeliveryStatus): number =>
  JOURNEY.findIndex((step) => step.status === status);

/** How the panel presents itself. The tone is the tile's, and it never rounds
 *  a delivery up: only `delivered` is allowed to be green. */
interface Headline {
  icon: ReactNode;
  title: string;
  tone?: 'amber' | 'leaf' | 'flame';
}

/** The headline: what is true right now, without rounding it up. */
function headline(job: DeliveryJob | null, busy: boolean): Headline {
  if (!job) {
    return busy
      ? { icon: <Hourglass />, title: 'No courier yet — the agent is still ordering', tone: 'amber' }
      : { icon: <MapPin />, title: 'No delivery was arranged' };
  }
  switch (job.status) {
    case 'delivered':
      return { icon: <CheckCircle />, title: 'Delivered to the customer', tone: 'leaf' };
    case 'failed':
      return { icon: <AlertTriangle />, title: 'The delivery failed', tone: 'flame' };
    case 'cancelled':
      return { icon: <StopOctagon />, title: 'The delivery was cancelled', tone: 'flame' };
    case 'unknown':
      // The courier said something this app does not recognise. Saying so is
      // the honest answer; guessing which way it leaned is not — which is also
      // why this one carries no tone at all rather than a hopeful amber.
      return {
        icon: <QuestionCircle />,
        title: 'The courier reported a status we do not recognise',
      };
    default:
      // Amber, never green. A job in transit is a paid order somebody has not
      // received, and the tile is the fastest-read thing on the card.
      return { icon: <Scooter />, title: 'On its way — not delivered yet', tone: 'amber' };
  }
}

/**
 * Where the order is, once the ordering is done.
 *
 * Kept apart from the run report on purpose. That panel answers "what did this
 * cost", which is settled the moment payment goes through; this one answers
 * "where is the food", which is still moving after the agent has finished
 * talking. Folding them together would make a paid order look complete.
 *
 * The one thing this panel will not do is call an order delivered before the
 * courier does. `delivered` comes from the delivery agent's own field, and
 * every other status renders as "on its way".
 */
export function DeliveryTrack({ context, job, busy }: Props) {
  // Nothing to say about a counter order — the panel is absent rather than
  // empty, so the column looks the same as it always did.
  if (!context) return null;

  const look = headline(job, busy);
  const reached = job ? stepOf(job.status) : -1;
  const stopped = job?.status === 'failed' || job?.status === 'cancelled';

  const { userLocation, restaurant, distanceKm } = context;

  // The coordinates go underneath a name, and stand in for one when there is
  // none — printed in both places they read as two different facts about the
  // address rather than the same one twice.
  const fix = `${userLocation.latitude.toFixed(5)}, ${userLocation.longitude.toFixed(5)}`;
  const named = userLocation.label !== null && userLocation.label !== undefined && userLocation.label !== '';

  return (
    <Panel
      icon={look.icon}
      tone={look.tone}
      title="The delivery"
      note={look.title}
      live={busy && !!job && !job.delivered}
      collapsible
      shrink
      className="fk-panel-delivery"
      extra={
        job?.etaMinutes != null && !job.delivered && !stopped ? (
          <span className="fk-badge">~{job.etaMinutes} min</span>
        ) : null
      }
    >
      {/* The route, once, at the top: the two ends of the journey are the
          context every status below is read against. */}
      <div className="fk-route">
        <div className="fk-route-leg">
          <span className="fk-route-pin fk-route-pin-from" aria-hidden>
            <Storefront />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="fk-route-label">Collected from</div>
            <div className="fk-route-value">{restaurant.name}</div>
            <div className="fk-route-sub">{restaurant.address}</div>
          </div>
        </div>

        <div className="fk-route-line" aria-hidden>
          <span className="fk-route-arrow">↓</span>
          {distanceKm != null && (
            <span className="fk-route-distance">{distanceKm.toFixed(1)} km</span>
          )}
        </div>

        <div className="fk-route-leg">
          <span className="fk-route-pin fk-route-pin-to" aria-hidden>
            <Home />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="fk-route-label">Delivered to</div>
            <div
              className="fk-route-value"
              style={named ? undefined : { fontFamily: V.fontMono }}
            >
              {named ? userLocation.label : fix}
            </div>
            {named && (
              <div className="fk-route-sub" style={{ fontFamily: V.fontMono }}>
                {fix}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Straight-line, and labelled as such wherever it appears: a courier
          drives roads, and a figure that looks like a delivery estimate when it
          is not is worse than no figure. */}
      {distanceKm != null && (
        <p className="fk-hint" style={{ marginTop: 10 }}>
          Distance is a straight line between the two, not a driving route.
        </p>
      )}

      {job ? (
        <>
          <div className="fk-eyebrow" style={{ marginTop: 16 }}>
            Where it has got to
          </div>

          <ol className="fk-journey">
            {JOURNEY.map((step, index) => {
              const done = reached >= 0 && index < reached;
              const now = reached === index;
              return (
                <li
                  key={step.status}
                  className={`fk-journey-step${done ? ' fk-journey-done' : ''}${
                    now ? ' fk-journey-now' : ''
                  }`}
                >
                  <span className="fk-journey-dot" aria-hidden />
                  <span className="fk-journey-label">{step.label}</span>
                  {now && job.message && (
                    <span className="fk-journey-note">{job.message}</span>
                  )}
                </li>
              );
            })}
          </ol>

          {stopped && (
            <p className="fk-step-refusal" style={{ marginTop: 10 }}>
              {job.message ?? 'The courier did not complete this delivery.'}
            </p>
          )}

          <div className="fk-delivery-facts">
            {job.deliveryService && (
              <span className="fk-badge">{job.deliveryService}</span>
            )}
            {job.courier && <span className="fk-badge">Rider · {job.courier}</span>}
            {job.fee && <span className="fk-badge">Fee · {job.fee}</span>}
            <span className="fk-badge fk-badge-mono">{job.jobId}</span>
          </div>

          {/* Spelled out under a job that is moving. The status words are the
              courier's, and "in_transit" beside a paid, finished-looking order
              is exactly where someone reads "done". */}
          {!job.delivered && !stopped && (
            <p className="fk-hint" style={{ marginTop: 10 }}>
              The order is paid and with the courier. It is not delivered until this
              says so.
            </p>
          )}
        </>
      ) : (
        <p className="fk-hint" style={{ marginTop: 14 }}>
          {busy
            ? 'The agent hands the order over once it is placed and paid.'
            : 'This errand finished without handing an order to a courier.'}
        </p>
      )}
    </Panel>
  );
}
