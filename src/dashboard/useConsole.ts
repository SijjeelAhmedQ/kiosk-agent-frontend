/**
 * Four consoles, followed at once, for as long as the page is open.
 *
 * The other subscription on this page — `useLiveFeed` — follows *jobs*, and
 * follows only the few that are live, because a settled job's stream is a
 * finished story. This one follows *processes*, and follows all four the whole
 * time, because the question it answers is the one an operator asks before they
 * know which job to look at: what is each agent actually doing.
 *
 * Three things it has to get right, none of them optional:
 *
 *   · **A service that is down must not look like a service that is quiet.**
 *     Every stream carries a ping when nothing has been said, so silence on the
 *     wire is a real signal. Each source has its own link state and the panel
 *     draws all four whether they are answering or not.
 *   · **A reconnect must not replay.** `EventSource` retries on its own and
 *     re-requests the same URL, which means a service that was restarted — or a
 *     laptop that was shut — sends its backlog again. Lines are keyed by
 *     `service:seq`, which the service assigns, so a duplicate is dropped rather
 *     than shown twice.
 *   · **A flood must not lock the page.** A model streaming through a long
 *     errand can produce lines faster than React should re-render. Arrivals are
 *     buffered and applied on a timer, and the buffer is bounded — under load
 *     the oldest lines are dropped, which is what scrollback is.
 *
 * Nothing here writes. Same rule as the rest of this dashboard: these are `GET`s
 * and an `EventSource`, and no control on this page can start, stop or nudge
 * anything.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CONSOLE_SOURCES,
  toLine,
  type ConsoleLine,
  type ConsoleSource,
  type Link,
  type ServiceId,
} from './console';

/**
 * How much scrollback the page keeps, and how often it repaints.
 *
 * 1200 lines is a long errand in full and about a screen-hour of a quiet floor;
 * past that the oldest go, because the services' own ring buffers are the same
 * shape and pretending otherwise would just be this tab growing all shift. The
 * flush interval is the one number that decides whether a busy floor feels live
 * or feels janky — 140ms is under the threshold where a log reads as delayed and
 * well above the frame budget for a hundred rows.
 */
const LINES_KEPT = 1200;
const FLUSH_MS = 140;

/** A stream is called dead if it has not even pinged in this long. */
const SILENT_MS = 45_000;

export interface ConsoleView {
  lines: ConsoleLine[];
  links: Record<ServiceId, Link>;
  /** True while no service has answered at all — a different empty from "quiet". */
  allDown: boolean;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  /** How many lines arrived while paused and are waiting to be shown. */
  held: number;
  /** Forget the scrollback *on this page*. The services keep their own. */
  clear: () => void;
}

function freshLinks(): Record<ServiceId, Link> {
  return Object.fromEntries(
    CONSOLE_SOURCES.map((source) => [
      source.id,
      { state: 'connecting', lastAt: 0, count: 0, seq: 0 } as Link,
    ]),
  ) as Record<ServiceId, Link>;
}

export function useConsole(): ConsoleView {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [links, setLinks] = useState<Record<ServiceId, Link>>(freshLinks);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(0);

  /** Arrivals since the last repaint. Bounded — see `LINES_KEPT`. */
  const pending = useRef<ConsoleLine[]>([]);
  /** Every id already taken, so a replayed backlog is dropped rather than shown. */
  const seen = useRef(new Set<string>());
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const take = useCallback((line: ConsoleLine) => {
    if (seen.current.has(line.id)) return;
    seen.current.add(line.id);
    // The id set is bounded the same way the list is; a service restarted often
    // enough to wrap its own sequence is a service whose old ids are long gone
    // from the view anyway.
    if (seen.current.size > LINES_KEPT * 4) {
      seen.current = new Set(pending.current.map((entry) => entry.id));
    }
    pending.current.push(line);
    if (pending.current.length > LINES_KEPT) {
      pending.current = pending.current.slice(-LINES_KEPT);
    }
  }, []);

  // ------------------------------------------------------------------ //
  // The four subscriptions
  // ------------------------------------------------------------------ //
  useEffect(() => {
    const sockets: EventSource[] = [];
    let live = true;

    const mark = (id: ServiceId, patch: Partial<Link>) =>
      setLinks((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

    const follow = (source: ConsoleSource) => {
      // The backlog first, over plain HTTP. The stream replays it too, but this
      // is what fills the panel in one round trip instead of leaving it blank
      // while a connection is negotiated — and it is the request whose failure
      // tells us the service is not there at all.
      fetch(`${source.base}${source.prefix}/console`)
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => {
          if (!live || !payload?.data) return;
          const items = Array.isArray(payload.data.items) ? payload.data.items : [];
          for (const raw of items) {
            const line = toLine(raw, source);
            if (line) take(line);
          }
          mark(source.id, { state: 'live', lastAt: Date.now() });
        })
        .catch(() => {
          // Not an error to report: "that service is not running" is the most
          // common state this page is in, and it is a thing to draw.
          if (live) mark(source.id, { state: 'down' });
        });

      const socket = new EventSource(`${source.base}${source.prefix}/console/events`);

      socket.onopen = () => mark(source.id, { state: 'live', lastAt: Date.now() });

      socket.onmessage = (message) => {
        let raw: unknown;
        try {
          raw = JSON.parse(message.data);
        } catch {
          return;
        }
        const line = toLine(raw, source);
        if (!line) return;
        take(line);
        setLinks((current) => {
          const link = current[source.id];
          return {
            ...current,
            [source.id]: {
              state: 'live',
              lastAt: Date.now(),
              count: link.count + 1,
              seq: Math.max(link.seq, line.seq),
            },
          };
        });
      };

      // The heartbeat. A named event, so it never reaches `onmessage` and can
      // never be mistaken for a line — it moves the clock and nothing else.
      socket.addEventListener('ping', () => mark(source.id, { state: 'live', lastAt: Date.now() }));

      // `EventSource` reconnects by itself, so this is a report rather than a
      // retry: the state goes to `down`, the panel says so, and the browser
      // keeps trying underneath until the service comes back.
      socket.onerror = () => mark(source.id, { state: 'down' });

      sockets.push(socket);
    };

    CONSOLE_SOURCES.forEach(follow);

    return () => {
      live = false;
      for (const socket of sockets) socket.close();
    };
  }, [take]);

  // ------------------------------------------------------------------ //
  // Repainting, on a timer rather than per line
  // ------------------------------------------------------------------ //
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pending.current.length === 0) return;
      if (pausedRef.current) {
        setHeld(pending.current.length);
        return;
      }
      const arrived = pending.current;
      pending.current = [];
      setHeld(0);
      setLines((current) =>
        [...current, ...arrived]
          // Four independent streams interleave, so order is decided here rather
          // than by which socket happened to deliver first. `seq` breaks a tie
          // within a service; the id keeps the sort stable across services.
          .sort((left, right) => left.at - right.at || left.id.localeCompare(right.id))
          .slice(-LINES_KEPT),
      );
    }, FLUSH_MS);
    return () => window.clearInterval(timer);
  }, []);

  // A stream that has not even pinged has stopped being a stream. Checked on a
  // slow tick of its own rather than on every line, because the whole point is
  // that nothing is arriving.
  useEffect(() => {
    const timer = window.setInterval(() => {
      setLinks((current) => {
        let changed = false;
        const next = { ...current };
        for (const source of CONSOLE_SOURCES) {
          const link = current[source.id];
          if (link.state === 'live' && link.lastAt && Date.now() - link.lastAt > SILENT_MS) {
            next[source.id] = { ...link, state: 'down' };
            changed = true;
          }
        }
        return changed ? next : current;
      });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  const clear = useCallback(() => {
    pending.current = [];
    setHeld(0);
    setLines([]);
  }, []);

  const allDown = useMemo(
    () => CONSOLE_SOURCES.every((source) => links[source.id]?.state === 'down'),
    [links],
  );

  return { lines, links, allDown, paused, setPaused, held, clear };
}
