import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Home,
  Hourglass,
  QuestionCircle,
  Scooter,
  StopOctagon,
  Storefront,
} from '@/icons';
import { Panel } from '@/components/Panel';
import type { A2ADelivery } from '../types';

/**
 * Where the negotiated order went, once the two agents had settled it.
 *
 * The console had nothing to say about this until now, which was a hole rather
 * than a simplification: an A2A run has been dispatching a courier since the
 * handover was written into `agent/a2a/merchant_tools.py`, so the operator was
 * watching a paid take-away order leave the building with no acknowledgement
 * anywhere on the page that it had.
 *
 * Nothing is asked for here and nothing is arranged. The panel reports what came
 * back on the payment, and the reason it is a panel of its own rather than a few
 * more lines in "What it came to" is the same reason it is on the errand
 * console: that panel answers *what did this cost*, which is settled the moment
 * the charge goes through, and this one answers *where is the food*, which is
 * still moving after both agents have stopped talking. Together they would make
 * a paid order look like a finished one.
 *
 * The one rule this panel keeps: it never calls an order delivered before the
 * courier does. `delivered` is the service's own boolean, and every other status
 * renders as "not there yet" — in amber, which is the honest colour for a paid
 * order somebody has not received.
 */

interface Props {
  delivery: A2ADelivery | null;
  /** The negotiation is still going — no handover yet is not a failed one. */
  busy: boolean;
  /** Idle means nothing has been run; the panel stays off the page entirely. */
  status: string;
  /**
   * Who would take it, from the delivery agent's own health — so the panel can
   * name the courier while it is still waiting for one. Null when that service
   * is not answering, which is worth saying rather than papering over: an order
   * about to be paid for has nowhere to go.
   */
  service: string | null;
}

/**
 * The journey, listed in full from the start rather than revealed a step at a
 * time, so the distance still to go is visible. Same six as the errand console's
 * — the courier is the same courier and its words are the same words.
 */
const JOURNEY: { status: string; label: string }[] = [
  { status: 'requested', label: 'Handed to the courier' },
  { status: 'accepted', label: 'Courier accepted' },
  { status: 'courier_assigned', label: 'Rider assigned' },
  { status: 'picked_up', label: 'Collected from the branch' },
  { status: 'in_transit', label: 'On the way' },
  { status: 'delivered', label: 'With the customer' },
];

interface Headline {
  icon: ReactNode;
  title: string;
  tone?: 'amber' | 'leaf' | 'flame';
}

/** What is true right now, without rounding it up. */
function headline(delivery: A2ADelivery | null, busy: boolean): Headline {
  if (!delivery) {
    return busy
      ? {
          icon: <Hourglass />,
          title: 'Nothing handed over yet — they are still negotiating',
          tone: 'amber',
        }
      : { icon: <Storefront />, title: 'No courier was arranged for this errand' };
  }
  if (!delivery.ok) {
    return { icon: <AlertTriangle />, title: 'Paid, but no rider', tone: 'flame' };
  }
  if (delivery.delivered) {
    return { icon: <CheckCircle />, title: 'With the customer', tone: 'leaf' };
  }
  switch (delivery.status) {
    case 'failed':
      return { icon: <AlertTriangle />, title: 'The delivery failed', tone: 'flame' };
    case 'cancelled':
      return { icon: <StopOctagon />, title: 'The delivery was cancelled', tone: 'flame' };
    case 'unknown':
      return {
        icon: <QuestionCircle />,
        title: 'The courier reported a status we do not recognise',
      };
    default:
      return { icon: <Scooter />, title: 'On the board — not delivered yet', tone: 'amber' };
  }
}

export function Delivery({ delivery, busy, status, service }: Props) {
  // Before anything has been run there is nothing to report and nothing to
  // promise, so the column looks exactly as it did.
  if (status === 'idle') return null;

  const look = headline(delivery, busy);
  const handed = delivery?.ok === true;
  const reached = handed ? JOURNEY.findIndex((step) => step.status === delivery.status) : -1;
  const stopped = delivery?.status === 'failed' || delivery?.status === 'cancelled';

  return (
    <Panel
      icon={look.icon}
      tone={look.tone}
      title="The delivery"
      note={look.title}
      // Only while the negotiation is running. What comes back on the payment is
      // a snapshot, not a subscription — this console never hears from the
      // courier again — so a bar still sweeping after the run has settled would
      // be claiming to be watching something it is not.
      live={busy}
      className="a2a-panel-delivery"
      extra={
        handed && delivery.etaMinutes != null && !delivery.delivered && !stopped ? (
          <span className="fk-badge">~{delivery.etaMinutes} min</span>
        ) : null
      }
    >
      {handed ? (
        <>
          {/* The two ends of the journey, at the top, because every status
              underneath is read against them: "collected" means nothing until
              you know collected from where. */}
          <div className="fk-route">
            <div className="fk-route-leg">
              <span className="fk-route-pin fk-route-pin-from" aria-hidden>
                <Storefront />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="fk-route-label">Collected from</div>
                <div className="fk-route-value">{delivery.pickupFrom ?? 'the nearest branch'}</div>
              </div>
            </div>

            <div className="fk-route-line" aria-hidden>
              <span className="fk-route-arrow">↓</span>
              {delivery.distanceKm != null && (
                <span className="fk-route-distance">{delivery.distanceKm.toFixed(1)} km</span>
              )}
            </div>

            <div className="fk-route-leg">
              <span className="fk-route-pin fk-route-pin-to" aria-hidden>
                <Home />
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="fk-route-label">Delivered to</div>
                <div className="fk-route-value">{delivery.deliveringTo ?? 'the saved address'}</div>
              </div>
            </div>
          </div>

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
                </li>
              );
            })}
          </ol>

          <div className="fk-delivery-facts">
            {delivery.deliveryService && (
              <span className="fk-badge">{delivery.deliveryService}</span>
            )}
            {delivery.fee && <span className="fk-badge">Fee · {delivery.fee}</span>}
            {delivery.jobId && (
              <span className="fk-badge fk-badge-mono">{delivery.jobId}</span>
            )}
          </div>

          {/* The service's own sentence, kept rather than paraphrased. It is
              written to stop "a courier has it" being read as "it arrived", and
              rewording it here would be this console picking a fight with the
              one place that actually knows. */}
          {!delivery.delivered && !stopped && delivery.note && (
            <p className="a2a-delivery-note">{delivery.note}</p>
          )}

          {/* The board is where a rider is actually asked for, and it is a
              different console — so the panel that says "waiting to be asked"
              hands over the way to go and ask. */}
          {!delivery.delivered && !stopped && (
            <a className="a2a-delivery-link" href="/foodpanda.html">
              <span aria-hidden>🛵</span>
              Open the delivery board
              <span className="fk-nav-link-arrow" aria-hidden>
                →
              </span>
            </a>
          )}
        </>
      ) : delivery ? (
        // The handover failed. The money moved anyway, and that half must not be
        // lost in the report of the half that did not.
        <>
          <p className="a2a-delivery-fault">
            {delivery.error ?? 'The order was paid for, but no courier took it.'}
          </p>
          <p className="fk-hint" style={{ marginTop: 12 }}>
            The order stands at the restaurant. Nothing here undoes the payment.
          </p>
        </>
      ) : (
        <p className="fk-hint">
          {busy
            ? `A take-away order goes to ${service ?? 'the delivery agent'} the moment it is paid for — nobody has to ask.`
            : 'This negotiation ended without an order for a courier to collect — a dine-in order, or one that was never paid for.'}
        </p>
      )}

      {/* The courier is down and a negotiation is live. Said here as well as in
          the strip at the top of the page, because this is the panel somebody
          watching a run is looking at. */}
      {busy && !delivery && !service && (
        <p className="a2a-delivery-fault" style={{ marginTop: 12 }}>
          The delivery agent is not answering. If this order is paid for, it will
          be bought and left without a rider.
        </p>
      )}

      {/* Said once, at the foot, whatever happened: a negotiation is two agents
          on a port with no customer in it, so there is no browser to ask for an
          address and nothing on the form to type one into. The drop is the
          saved address, and an operator who does not know that will read the
          missing field as a missing feature. */}
      <p className="a2a-delivery-why">
        Two agents, no customer on the line — a delivery from here always goes to
        the customer’s saved address.
      </p>
    </Panel>
  );
}
