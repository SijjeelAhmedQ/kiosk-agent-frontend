/**
 * The usage estimate, wired up — one owner for the drawer and for the chip that
 * opens it.
 *
 * Both surfaces show the same two numbers, and they must never disagree: a
 * button that says `1.24M tokens · $4.82` and a drawer that opens on `980K ·
 * $3.10` because it scopes its own window differently is a bug an operator
 * cannot see and cannot un-see once they have. So the range picker lives here,
 * above both of them, and everything either one renders is derived from this
 * hook.
 *
 * Nothing here polls or fetches. `usage.ts` explains why in full: no service on
 * this floor reports token usage, so every figure below is estimated from the
 * events the control centre already holds. This hook's whole job is scoping,
 * grouping and memoising that estimate.
 */

import { useMemo, useState } from 'react';
import {
  billingPeriod,
  byActor,
  families,
  ledger,
  loadBudget,
  saveBudget,
  series,
  span,
  totals,
  within,
  type ActorUsage,
  type Brain,
  type Brains,
  type Family,
  type Series,
  type Span,
  type Totals,
  type Turn,
  type WindowId,
} from './usage';
import { isoDay } from './usage';
import type { Actor, MonitorEvent } from './monitor';

export interface CustomRange {
  from: string;
  to: string;
}

/** What the credentials look like across every agent that holds a model. */
export interface Credentials {
  ready: number;
  total: number;
  problems: { actor: Actor; problem: string }[];
}

export interface Usage {
  /** Every turn this page can see, newest first — unscoped. */
  all: Turn[];
  /** The turns inside the picked window. */
  scoped: Turn[];
  range: Span;
  window: WindowId;
  setWindow: (id: WindowId) => void;
  custom: CustomRange;
  setCustom: (range: CustomRange) => void;
  totals: Totals;
  /** This calendar month, which is what a bill and a budget are measured over. */
  period: Span;
  periodTotals: Totals;
  budget: number;
  setBudget: (value: number) => void;
  agents: ActorUsage[];
  groups: Family[];
  series: Series;
  brains: Brains;
  credentials: Credentials;
  /** Every distinct provider in use, so the header can say "anthropic" or "mixed". */
  providers: string[];
}

export function useUsage(events: MonitorEvent[], brains: Brains, now: number): Usage {
  const [window, setWindow] = useState<WindowId>('today');
  const [custom, setCustom] = useState<CustomRange>(() => ({
    from: isoDay(Date.now()),
    to: isoDay(Date.now()),
  }));
  const [budget, setBudgetValue] = useState<number>(() => loadBudget());

  const setBudget = (value: number) => {
    setBudgetValue(value);
    saveBudget(value);
  };

  // The window is re-cut every half minute rather than every second. Its edges
  // do move — "today" ends at now — but a token chart that re-buckets sixty
  // times a minute is sixty rebuilds nobody can see, on the page's busiest tick.
  const coarse = Math.floor(now / 30_000);

  const all = useMemo(() => ledger(events, brains), [events, brains]);

  const range = useMemo(
    () => span(window, custom, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [window, custom, coarse],
  );
  const period = useMemo(
    () => billingPeriod(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coarse],
  );

  const scoped = useMemo(() => within(all, range), [all, range]);
  const monthToDate = useMemo(() => within(all, period), [all, period]);

  const agents = useMemo(() => byActor(scoped, brains), [scoped, brains]);

  return {
    all,
    scoped,
    range,
    window,
    setWindow,
    custom,
    setCustom,
    totals: useMemo(() => totals(scoped), [scoped]),
    period,
    periodTotals: useMemo(() => totals(monthToDate), [monthToDate]),
    budget,
    setBudget,
    agents,
    groups: useMemo(() => families(agents), [agents]),
    series: useMemo(() => series(scoped, range), [scoped, range]),
    brains,
    credentials: useMemo(() => {
      const entries = Object.entries(brains) as [Actor, Brains[Actor]][];
      return {
        ready: entries.filter(([, brain]) => brain?.ready).length,
        total: entries.length,
        problems: entries
          .filter(([, brain]) => brain && !brain.ready)
          .map(([actor, brain]) => ({ actor, problem: brain?.problem ?? 'Not ready.' })),
      };
    }, [brains]),
    providers: useMemo(
      () =>
        [
          ...new Set(
            Object.values(brains)
              .filter((brain): brain is Brain => Boolean(brain))
              .map((brain) => brain.provider),
          ),
        ].sort(),
      [brains],
    ),
  };
}
