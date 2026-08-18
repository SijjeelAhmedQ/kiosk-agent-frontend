/**
 * Every job, and whose hands it is in.
 *
 * The board on the delivery console answers "what is there"; this answers "who
 * has it" — which is the same list read for a different reason, and the reason
 * is that some of these rows are not moving. A delivery waiting to be asked for
 * a rider looks, from a status column alone, exactly like one that is being
 * worked on. It is not, and the whole point of this table is that the two never
 * share a row style.
 *
 * Sorted newest first and never re-sorted, the same as the board it mirrors.
 * A triage list that quietly reorders itself under the pointer is a list people
 * stop trusting; the filter above it is how you get to the urgent rows instead.
 */

import { useState } from 'react';
import { clock, humanDuration } from '../derive';
import type { Assignment, Owner } from '../types';
import type { DeliveryStatus } from '../../foodpanda/types';

/**
 * The delivery statuses in words and colours.
 *
 * A second copy of `foodpanda/components/StatusPill.tsx`'s table, and the
 * duplication is on purpose: that component's styling lives in the delivery
 * console's own stylesheet, and importing it here would mean importing a whole
 * console's CSS into a page that shares only the design system with it. What is
 * copied is one rule, and it is short enough to keep right in both places —
 * **only `delivered` is green.** Amber on a job that is nearly finished is a
 * small annoyance; green on one that is not is telling somebody their food has
 * arrived when it is on a motorbike.
 */
const STAGE: Record<DeliveryStatus, { label: string; tone: string }> = {
  requested: { label: 'Requested', tone: 'idle' },
  accepted: { label: 'Accepted', tone: 'work' },
  courier_assigned: { label: 'Rider assigned', tone: 'work' },
  picked_up: { label: 'Collected', tone: 'work' },
  in_transit: { label: 'On the way', tone: 'work' },
  delivered: { label: 'Delivered', tone: 'good' },
  rejected: { label: 'Refused', tone: 'bad' },
  failed: { label: 'Failed', tone: 'bad' },
  cancelled: { label: 'Cancelled', tone: 'idle' },
};

const OWNER: Record<Owner, { label: string; glyph: string; className: string }> = {
  dispatcher: { label: 'Dispatcher', glyph: '🛵', className: 'fkd-own-agent' },
  rider: { label: 'Rider', glyph: '🏍️', className: 'fkd-own-agent' },
  operator: { label: 'You', glyph: '👤', className: 'fkd-own-you' },
  settled: { label: 'Nobody', glyph: '—', className: 'fkd-own-done' },
};

export function AssignmentTable({ rows }: { rows: Assignment[] }) {
  const [onlyMine, setOnlyMine] = useState(false);
  const stuck = rows.filter((row) => row.stuck).length;
  const shown = onlyMine ? rows.filter((row) => row.stuck) : rows;

  return (
    <div className="fkd-assign">
      <div className="fkd-assign-bar">
        <p className="fkd-assign-count">
          {rows.length} {rows.length === 1 ? 'job' : 'jobs'} in range
          {stuck > 0 && (
            <>
              {' · '}
              <strong className="fkd-assign-stuck">{stuck} waiting on you</strong>
            </>
          )}
        </p>
        <button
          type="button"
          className="fkd-toggle"
          aria-pressed={onlyMine}
          onClick={() => setOnlyMine((value) => !value)}
          disabled={stuck === 0 && !onlyMine}
        >
          Only what needs me
        </button>
      </div>

      {shown.length === 0 ? (
        <p className="fk-hint">
          {onlyMine
            ? 'Nothing is waiting on you. Every live job is with an agent.'
            : 'No jobs in this range. Widen it, or send an errand from the ordering console.'}
        </p>
      ) : (
        <div className="fkd-table-wrap">
          <table className="fkd-table fkd-table-wide">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Stage</th>
                <th scope="col">With</th>
                <th scope="col">Doing</th>
                <th scope="col">Age</th>
                <th scope="col">Arrived</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ job, owner: who, doing, ageSeconds, stuck: waiting }) => {
                const stage = STAGE[job.status] ?? { label: job.status, tone: 'idle' };
                const own = OWNER[who];
                return (
                  <tr key={job.jobId} className={waiting ? 'fkd-row-stuck' : undefined}>
                    <th scope="row">
                      <span className="fkd-order">{job.orderNumber}</span>
                      <span className="fkd-order-sub">
                        {job.itemCount} {job.itemCount === 1 ? 'item' : 'items'}
                        {job.distanceKm !== null && ` · ${job.distanceKm.toFixed(1)} km`}
                      </span>
                    </th>
                    <td>
                      <span className={`fkd-chip fkd-chip-${stage.tone}`}>
                        <span className="fkd-chip-dot" aria-hidden />
                        {stage.label}
                      </span>
                    </td>
                    <td>
                      <span className={`fkd-chip ${own.className}`}>
                        <span aria-hidden>{own.glyph}</span>
                        {own.label}
                      </span>
                    </td>
                    <td className="fkd-doing">
                      {waiting && <span aria-hidden>⏸ </span>}
                      {doing}
                    </td>
                    <td className="fkd-num">{humanDuration(ageSeconds)}</td>
                    <td className="fkd-num">{clock(new Date(job.createdAt).getTime())}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
