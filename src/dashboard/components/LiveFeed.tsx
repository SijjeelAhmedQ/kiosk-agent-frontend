/**
 * What the agents are doing, sentence by sentence, across every live job.
 *
 * The two panels above this one say *where* work is; this one says what is being
 * done to it. It is the difference between a queue depth of three and watching
 * the dispatcher read a request, check the distance, and refuse it — and on a
 * floor run by models rather than by state machines, the second is what tells
 * you whether the system is working or merely busy.
 *
 * Rows are stamped with the clock time they arrived here, not a time the service
 * sent: a backlog replayed on connect all lands in the same second, and pretending
 * otherwise would put a false history on screen. Newest at the bottom, the way a
 * log reads, with the view pinned there unless somebody has scrolled up.
 */

import { useEffect, useRef } from 'react';
import { clock } from '../derive';
import type { FeedRow } from '../types';

const KIND: Record<FeedRow['kind'], { glyph: string; className: string }> = {
  tool: { glyph: '→', className: 'fkd-feed-tool' },
  result: { glyph: '·', className: 'fkd-feed-result' },
  said: { glyph: '❝', className: 'fkd-feed-said' },
  step: { glyph: '◆', className: 'fkd-feed-step' },
  waiting: { glyph: '⏸', className: 'fkd-feed-waiting' },
  error: { glyph: '!', className: 'fkd-feed-error' },
};

export function LiveFeed({ rows, following }: { rows: FeedRow[]; following: number }) {
  const box = useRef<HTMLOListElement | null>(null);

  // Follow the tail, but only from the tail. Somebody reading back through the
  // log should not be yanked to the bottom every two seconds — which is the
  // single most common way a live log becomes unreadable.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    if (atBottom) node.scrollTop = node.scrollHeight;
  }, [rows]);

  if (rows.length === 0) {
    return (
      <p className="fk-hint">
        {following === 0
          ? 'Nothing is running. This fills up the moment a delivery lands on the board.'
          : 'Connected. Waiting for the agents to say something.'}
      </p>
    );
  }

  return (
    // An ordinary list, not a live region. A screen reader announcing every tool
    // call as it lands would talk over its user for as long as the floor is
    // busy — and the backlog a stream replays on connect arrives as one burst,
    // which would be a hundred sentences at once. The list is here to be read,
    // and the panel's own heading says what it is.
    <ol className="fkd-feed" ref={box} aria-label="Recent agent activity">
      {rows.map((row) => {
        const look = KIND[row.kind];
        const bad = row.kind === 'error' || row.ok === false;
        return (
          <li key={row.id} className={`fkd-feed-row ${look.className}${bad ? ' fkd-feed-bad' : ''}`}>
            <span className="fkd-feed-time">{clock(row.at)}</span>
            <span className="fkd-feed-glyph" aria-hidden>
              {bad ? '✕' : look.glyph}
            </span>
            <span className="fkd-feed-order">{row.orderNumber}</span>
            <span className="fkd-feed-text">{row.text}</span>
          </li>
        );
      })}
    </ol>
  );
}
