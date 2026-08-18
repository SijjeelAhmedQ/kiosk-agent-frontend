/**
 * What the agents are saying, right now, across every job at once.
 *
 * The delivery console follows one job because it is a console for one job. This
 * page follows several, because the question it answers is not "what is
 * happening to this order" but "is anything happening at all" — and an operator
 * who has to click through six jobs to find the one that is moving has been
 * given a worse tool than a list.
 *
 * Only *live* jobs are followed, and only the newest few. A settled job's stream
 * is a finished story the board already tells in one line, and an EventSource
 * left open holds a queue alive on the server for as long as the tab is.
 */

import { useEffect, useRef, useState } from 'react';
import { toolLabel } from '../foodpanda/toolLabels';
import { dashboardApi } from './api';
import type { FeedRow, Job } from './types';

/**
 * How many jobs are followed at once, and how many lines are kept.
 *
 * Four streams is a cheap ceiling that still covers a busy floor — the board
 * beneath is what shows the rest — and 160 rows is more scrollback than anybody
 * reads while keeping the list from growing without bound over a long shift.
 */
const FOLLOW_LIMIT = 4;
const ROWS_KEPT = 160;

export function useLiveFeed(jobs: Job[]): FeedRow[] {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const streams = useRef(new Map<string, () => void>());

  // The ids to follow, as one string — so the effect below re-runs when the set
  // changes and *not* on every poll that hands back an equal set of jobs.
  const live = jobs.filter((job) => !job.done).slice(0, FOLLOW_LIMIT);
  const key = live.map((job) => job.jobId).join(',');
  const names = new Map(live.map((job) => [job.jobId, job.orderNumber]));

  // Read inside the effect without being a dependency of it: the order number
  // is a label on the row, and re-subscribing every time the map identity
  // changes would replay every backlog on every poll.
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    const wanted = new Set(key ? key.split(',') : []);
    const open = streams.current;

    // Drop the ones that have settled or fallen off the end of the list.
    for (const [jobId, close] of open) {
      if (!wanted.has(jobId)) {
        close();
        open.delete(jobId);
      }
    }

    for (const jobId of wanted) {
      if (open.has(jobId)) continue;

      let sequence = 0;
      const push = (row: Omit<FeedRow, 'id' | 'at' | 'orderNumber' | 'agent' | 'jobId'>) => {
        sequence += 1;
        const entry: FeedRow = {
          // The job id and a counter, not a timestamp: two events can land in
          // the same millisecond and React needs the keys to stay distinct.
          id: `${jobId}-${sequence}`,
          at: Date.now(),
          agent: 'dispatcher',
          orderNumber: namesRef.current.get(jobId) ?? jobId,
          jobId,
          ...row,
        };
        setRows((previous) => [...previous, entry].slice(-ROWS_KEPT));
      };

      // The name of the last tool this job's agent called, so a result row can
      // be attributed. The stream pairs them by `toolUseId`, but the dispatcher
      // runs one tool at a time per job, which makes "the last one" exact.
      let lastTool: string | undefined;

      open.set(
        jobId,
        dashboardApi.follow(jobId, (event) => {
          if (event.type === 'tool') lastTool = event.name;
          switch (event.type) {
            case 'status':
              push({ kind: 'step', text: event.message, stage: event.status });
              break;
            case 'awaiting':
              push({ kind: 'waiting', text: event.message });
              break;
            case 'tool':
              push({ kind: 'tool', text: toolLabel(event.name), toolName: event.name });
              break;
            case 'tool_result':
              // The tool's own name is not on the result event — the stream
              // sends an id — so it is carried forward from the call that
              // opened it. Without it the monitor cannot say whether the
              // dispatcher was talking to a rider or to the restaurant.
              push({
                kind: 'result',
                text: event.summary,
                ok: event.ok,
                toolName: lastTool,
              });
              break;
            case 'say':
              if (event.text.trim()) push({ kind: 'said', text: event.text.trim() });
              break;
            case 'error':
              push({ kind: 'error', text: event.message });
              break;
            case 'end':
              break;
          }
        }),
      );
    }
  }, [key]);

  // Every stream closed on unmount, for the same reason the delivery board does
  // it: a reload that leaves four sockets open leaves four server-side queues
  // with it.
  useEffect(() => {
    const open = streams.current;
    return () => {
      for (const close of open.values()) close();
      open.clear();
    };
  }, []);

  return rows;
}
