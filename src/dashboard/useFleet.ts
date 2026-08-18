/**
 * The floor, polled — and remembered for as long as the page is open.
 *
 * Four health endpoints and one job list, every couple of seconds. Polling
 * rather than streaming, and that is not a compromise: three of the five reads
 * are "what are you doing *now*", which is a question with no event to subscribe
 * to, and the fourth — the board — is already polled by the delivery console for
 * the reason given there (new work arrives without warning, and there is no
 * stream for a job that does not exist yet).
 *
 * The one thing this hook keeps that the services do not is **history of state**.
 * The errand server and the A2A server hold their runs in memory and publish no
 * list of them, so nothing anywhere can answer "was the ordering agent busy ten
 * minutes ago". Sampling the answer every tick and keeping the last few hundred
 * samples is the honest version of that: it is a record of what this page saw,
 * it starts empty when the page is opened, and the strips draw the part they
 * were not there for as nothing rather than as idle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentHealth } from '@/types';
import type { A2AHealth } from '../a2a/types';
import type { FoodpandaHealth } from '../foodpanda/types';
import { dashboardApi, type CourierHealth } from './api';
import { roster } from './derive';
import type { AgentId, AgentState, AgentView, Job, Sample } from './types';

/** Same cadence the delivery board runs at — fast enough to feel live, cheap. */
const POLL_MS = 2500;

/**
 * How many samples the strips keep. At 2.5s a tick, 168 is seven minutes —
 * long enough to show a run beginning and ending, short enough that a cell in
 * the strip is still wide enough to see.
 */
export const SAMPLES_KEPT = 168;

export interface Fleet {
  agents: AgentView[];
  jobs: Job[];
  samples: Sample[];
  ordering: AgentHealth | null;
  a2a: A2AHealth | null;
  courier: CourierHealth | null;
  dispatcher: FoodpandaHealth | null;
  /** Ticked once per poll — what the memoised derivations key off. */
  tick: number;
  /** Ticked once a second, for ages and countdowns that must not lag. */
  now: number;
  /** True until the first round of reads has come back. */
  loading: boolean;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  refresh: () => void;
}

export function useFleet(): Fleet {
  const [ordering, setOrdering] = useState<AgentHealth | null>(null);
  const [a2a, setA2a] = useState<A2AHealth | null>(null);
  const [courier, setCourier] = useState<CourierHealth | null>(null);
  const [dispatcher, setDispatcher] = useState<FoodpandaHealth | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);

  // Read by the poll without being a dependency of it: flipping pause should
  // stop the next tick, not tear down and rebuild the interval.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const round = useCallback(async () => {
    // All five at once. They are five different processes and any of them may be
    // down; running them in series would make one dead service cost every other
    // panel its refresh, one timeout at a time.
    const [orderingNext, a2aNext, courierNext, dispatcherNext, jobsNext] = await Promise.all([
      dashboardApi.ordering(),
      dashboardApi.a2a(),
      dashboardApi.courier(),
      dashboardApi.dispatcher(),
      dashboardApi.jobs(),
    ]);
    if (!alive.current) return;

    setOrdering(orderingNext);
    setA2a(a2aNext);
    setCourier(courierNext);
    setDispatcher(dispatcherNext);
    setJobs(jobsNext);
    setLoading(false);

    // The sample is taken from the same five answers the panels are about to
    // render, rather than from the rendered state a beat later — so a strip and
    // the roster beside it can never disagree about what an agent was doing.
    const states = roster(
      { ordering: orderingNext, a2a: a2aNext, courier: courierNext, dispatcher: dispatcherNext },
      jobsNext,
    ).reduce<Record<AgentId, AgentState>>(
      (into, agent) => {
        into[agent.id] = agent.state;
        return into;
      },
      {} as Record<AgentId, AgentState>,
    );

    setSamples((previous) => [...previous, { at: Date.now(), states }].slice(-SAMPLES_KEPT));
    setTick((value) => value + 1);
  }, []);

  useEffect(() => {
    void round();
    const timer = setInterval(() => {
      if (!pausedRef.current) void round();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [round]);

  // A second, faster clock for the things that count upwards on their own —
  // a job's age, a delivery's remaining seconds. Kept apart from `tick` so a
  // one-second re-render never re-derives thirty buckets of chart geometry.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const agents = useMemo(
    () => roster({ ordering, a2a, courier, dispatcher }, jobs),
    [ordering, a2a, courier, dispatcher, jobs],
  );

  return {
    agents,
    jobs,
    samples,
    ordering,
    a2a,
    courier,
    dispatcher,
    tick,
    now,
    loading,
    paused,
    setPaused,
    refresh: () => void round(),
  };
}
