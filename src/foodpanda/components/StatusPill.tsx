import type { DeliveryStatus } from '../types';

/**
 * Where a job is, in a word and a colour.
 *
 * The colour rule is the whole point and it is one line: **only `delivered` is
 * green.** Everything else on the way there is amber, however far along it is,
 * because an amber pill on a job that is nearly finished is a small annoyance
 * and a green one on a job that is not is somebody told their food arrived when
 * it is still on a motorbike.
 */

const LOOK: Record<DeliveryStatus, { label: string; tone: 'amber' | 'leaf' | 'flame' | 'grey' }> = {
  requested: { label: 'Requested', tone: 'grey' },
  accepted: { label: 'Accepted', tone: 'amber' },
  courier_assigned: { label: 'Rider assigned', tone: 'amber' },
  picked_up: { label: 'Collected', tone: 'amber' },
  in_transit: { label: 'On the way', tone: 'amber' },
  delivered: { label: 'Delivered', tone: 'leaf' },
  rejected: { label: 'Refused', tone: 'flame' },
  failed: { label: 'Failed', tone: 'flame' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
};

export function StatusPill({ status, live }: { status: DeliveryStatus; live?: boolean }) {
  const look = LOOK[status] ?? { label: status, tone: 'grey' as const };
  return (
    <span className={`fp-pill fp-pill-${look.tone}`}>
      <span className={`fp-pill-dot${live ? ' fp-pill-dot-live' : ''}`} aria-hidden />
      {look.label}
    </span>
  );
}
