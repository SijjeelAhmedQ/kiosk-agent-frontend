/**
 * The delivery board: every job the agent has, and one of them followed live.
 *
 * Two different jobs, and they are watched two different ways on purpose.
 *
 * * **The board** is polled. New work arrives here without warning — the
 *   ordering agent hands a delivery over whenever a customer finishes paying,
 *   and there is no stream for "a job that does not exist yet". A few seconds
 *   of latency on a list is nothing; a socket per page that mostly carries
 *   nothing is not free.
 * * **The selected job** is streamed. That one is a story being told — the
 *   dispatcher reading the request, deciding, calling a rider — and polling it
 *   would show a rider assigned without ever showing the thinking that assigned
 *   them.
 *
 * The fold into rows is append-only and order-preserving. Nothing is re-sorted
 * and nothing is grouped, because in a delivery the sequence *is* the content:
 * `picked_up` before `accepted` would be a serious bug, and a view that quietly
 * sorted them would hide it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { foodpandaApi } from './api';
import type { FoodpandaEvent, Job, LogRow } from './types';

/** How often the board re-reads the list. Fast enough that a handover from the
 *  ordering agent appears while the operator is still looking at the screen. */
const POLL_MS = 2500;

interface Board {
  jobs: Job[];
  selected: Job | null;
  selectedId: string | null;
  rows: LogRow[];
  /** The selected job is still moving — the panel draws its live bar. */
  live: boolean;
  error: string | null;
  select: (jobId: string) => void;
  /** Ask for a rider on the selected job. */
  findRider: () => Promise<void>;
  /** The rider request is in flight — the button it came from is spent. */
  asking: boolean;
  cancel: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useDeliveryBoard(): Board {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Job | null>(null);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const unsubscribe = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    setJobs(await foodpandaApi.jobs());
  }, []);

  // -- the board --------------------------------------------------------- //
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const items = await foodpandaApi.jobs();
      if (alive) setJobs(items);
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  // Follow the newest job until the operator picks one for themselves. A board
  // that stayed blank while a delivery ran would be the wrong default for the
  // one thing this page exists to show.
  useEffect(() => {
    if (selectedId === null && jobs.length > 0) setSelectedId(jobs[0].jobId);
  }, [jobs, selectedId]);

  // -- the followed job -------------------------------------------------- //
  const absorb = useCallback((event: FoodpandaEvent) => {
    switch (event.type) {
      case 'status':
        setSelected(event.job);
        // Patch the board row in place rather than waiting for the next poll,
        // so the list and the detail never disagree about where a job is.
        setJobs((list) =>
          list.map((job) => (job.jobId === event.job.jobId ? event.job : job)),
        );
        setRows((list) => [
          ...list,
          {
            kind: 'step',
            step: {
              status: event.status,
              message: event.message,
              at: event.at,
              elapsedSeconds: event.elapsedSeconds,
            },
          },
        ]);
        break;

      case 'awaiting':
        // Not a status: where the delivery has got to has not changed, only
        // whether it is waiting on somebody. So the job view is patched — the
        // buttons key off `awaiting` — and the log gets a row of its own rather
        // than another step on the journey.
        setSelected(event.job);
        setJobs((list) =>
          list.map((job) => (job.jobId === event.job.jobId ? event.job : job)),
        );
        setRows((list) => [
          ...list,
          { kind: 'waiting', step: event.step, message: event.message },
        ]);
        break;

      case 'tool':
        setRows((list) => {
          const last = list[list.length - 1];
          const call = { toolUseId: event.toolUseId, name: event.name, ok: null, summary: null };
          // Fold into the strip already at the bottom, unless something has
          // happened since — a tool call after a status starts a new strip.
          if (last?.kind === 'tools') {
            return [...list.slice(0, -1), { ...last, calls: [...last.calls, call] }];
          }
          return [...list, { kind: 'tools', calls: [call] }];
        });
        break;

      case 'tool_result':
        setRows((list) =>
          list.map((row) =>
            row.kind === 'tools' && row.calls.some((c) => c.toolUseId === event.toolUseId)
              ? {
                  ...row,
                  calls: row.calls.map((c) =>
                    c.toolUseId === event.toolUseId
                      ? { ...c, ok: event.ok, summary: event.summary }
                      : c,
                  ),
                }
              : row,
          ),
        );
        break;

      case 'say':
        if (event.text.trim()) {
          setRows((list) => [...list, { kind: 'said', text: event.text }]);
        }
        break;

      case 'error':
        setRows((list) => [...list, { kind: 'error', message: event.message }]);
        break;

      case 'end':
        // The job is settled. Nothing to change on screen — the last status
        // event already said where it ended up.
        break;
    }
  }, []);

  useEffect(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setRows([]);
    setSelected(null);
    setError(null);

    if (selectedId === null) return;

    let alive = true;
    // The snapshot fills the panel immediately; the stream replays its backlog
    // a moment later and takes over. Both, because a job with no events left to
    // replay — one the registry kept from an earlier run — would otherwise show
    // an empty panel.
    void foodpandaApi.job(selectedId).then((job) => {
      if (alive && job) setSelected((current) => current ?? job);
    });

    unsubscribe.current = foodpandaApi.subscribe(selectedId, absorb, setError);

    return () => {
      alive = false;
      unsubscribe.current?.();
      unsubscribe.current = null;
    };
  }, [selectedId, absorb]);

  // An EventSource left open keeps a queue alive on the server for every
  // reload, so closing on unmount matters more here than on a normal page.
  useEffect(() => () => unsubscribe.current?.(), []);

  // -- "deliver it to me", answered without being asked -------------------- //
  // There is no button for this. Every job that reaches this board is going to
  // the customer, so the only answer the gate was ever going to get is yes, and
  // holding food on a rider's back until somebody clicks it is a wait for
  // nothing. The request the button used to send is sent here instead, the
  // moment the gate opens.
  //
  // Off the polled list rather than off the selected job, because the gate is
  // not the operator's to sit at: a job nobody has clicked on would otherwise
  // wait at it for as long as the board is pointed somewhere else.
  //
  // Once per job. The gate closes on the first ask and a second one is a 409,
  // so the id is remembered *before* the request goes out — the poll ticks
  // every couple of seconds and would fire again underneath a request still in
  // flight. A failure is reported and not retried for the same reason: a gate
  // that answers itself must not also hammer itself.
  const answered = useRef(new Set<string>());

  useEffect(() => {
    for (const job of jobs) {
      if (job.awaiting !== 'delivery' || answered.current.has(job.jobId)) continue;
      answered.current.add(job.jobId);
      void foodpandaApi.deliver(job.jobId).catch((exc) => {
        setError(exc instanceof Error ? exc.message : String(exc));
      });
    }
  }, [jobs]);

  // -- the rider request --------------------------------------------------- //
  // Nothing is patched into the job here on success. The dispatcher is waiting
  // inside a tool call for exactly this, and what it does next — assign a named
  // rider, ride to the restaurant — arrives on the stream within the second. A
  // board that also wrote its own optimistic "rider requested" state would be
  // guessing at an answer it is about to be told.
  const [asking, setAsking] = useState(false);

  const ask = useCallback(
    async (request: (jobId: string) => Promise<void>) => {
      if (!selectedId) return;
      setAsking(true);
      setError(null);
      try {
        await request(selectedId);
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : String(exc));
      } finally {
        setAsking(false);
      }
    },
    [selectedId],
  );

  const findRider = useCallback(() => ask(foodpandaApi.findRider), [ask]);

  const cancel = useCallback(async () => {
    if (selectedId) {
      await foodpandaApi.cancel(selectedId);
      await refresh();
    }
  }, [selectedId, refresh]);

  return {
    jobs,
    selected,
    selectedId,
    rows,
    live: selected !== null && !selected.done,
    error,
    select: setSelectedId,
    findRider,
    asking,
    cancel,
    refresh,
  };
}
