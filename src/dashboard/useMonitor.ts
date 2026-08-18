/**
 * The control centre's live wire.
 *
 * Two sources, joined here and nowhere else:
 *
 *   · the shared bus, which carries what the ordering console and the A2A desk
 *     saw on their own run streams — the only way this page can hear those two
 *     agents at all (`src/shared/agentBus.ts` explains why);
 *   · the delivery dispatcher's SSE feed, which this page already subscribes to
 *     directly and which `useLiveFeed` hands over as rows.
 *
 * No polling. The bus pushes, the feed pushes, and everything below is derived
 * from what has arrived. The one-second clock is not a poll — it is what makes
 * "12s ago" tick over and a hot link cool off when nothing more is said, which
 * is a real state change with no event behind it.
 */

import { useEffect, useMemo, useState } from 'react';
import { clear, onCleared, snapshot, subscribe, type BusEvent } from '@/shared/agentBus';
import {
  activity,
  conversations,
  links,
  merge,
  pulse,
  tally,
  type ActorActivity,
  type Conversation,
  type FilterId,
  type Link,
  type MonitorEvent,
  type Pulse,
} from './monitor';
import type { Actor } from '@/shared/agentBus';
import type { FeedRow } from './types';

export interface Monitor {
  /** Everything, oldest first. */
  events: MonitorEvent[];
  conversations: Conversation[];
  links: Link[];
  activity: Record<Actor, ActorActivity>;
  pulse: Pulse;
  counts: Record<FilterId, number>;
  /** Ticks once a second — what "just now" and the hot rings are keyed to. */
  now: number;
  /** Wipes the shared log, in this tab and every other one. */
  reset: () => void;
}

export function useMonitor(feed: FeedRow[]): Monitor {
  // Seeded from the stored ring rather than from empty, so a dashboard opened
  // halfway through a negotiation has the first half of it.
  const [bus, setBus] = useState<BusEvent[]>(() => snapshot());

  useEffect(() => {
    // Re-read on mount as well as subscribing: between the `useState` seed and
    // this effect, another tab may have published — under StrictMode that gap
    // is two renders wide, which is exactly long enough to lose an event.
    setBus(snapshot());

    const stop = subscribe((event) =>
      setBus((previous) =>
        previous.some((entry) => entry.id === event.id) ? previous : [...previous, event],
      ),
    );
    const stopClear = onCleared(() => setBus([]));

    return () => {
      stop();
      stopClear();
    };
  }, []);

  // One second, not the fleet's 2.5s poll. Ages on this panel are read in
  // seconds — "the merchant last spoke 4 seconds ago" is the whole point — and
  // a clock that lags the thing it measures reads as a broken panel.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const events = useMemo(() => merge(bus, feed), [bus, feed]);

  // Keyed to the newest event rather than to `now`: the groupings only change
  // when something is said, and re-deriving four structures every second for a
  // clock tick is work nobody sees. `live` and `hot`, which genuinely do decay
  // with time, are computed from `now` inside the memo below them.
  const lastAt = events.length === 0 ? 0 : events[events.length - 1].at;

  const runs = useMemo(
    () => conversations(events, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, lastAt, Math.floor(now / 5000)],
  );

  const wires = useMemo(
    () => links(events, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, lastAt, Math.floor(now / 2000)],
  );

  const who = useMemo(
    () => activity(events, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, lastAt, Math.floor(now / 2000)],
  );

  const counts = useMemo(() => tally(events), [events]);
  const beat = useMemo(
    () => pulse(events, runs, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, runs, Math.floor(now / 5000)],
  );

  return {
    events,
    conversations: runs,
    links: wires,
    activity: who,
    pulse: beat,
    counts,
    now,
    reset: clear,
  };
}
