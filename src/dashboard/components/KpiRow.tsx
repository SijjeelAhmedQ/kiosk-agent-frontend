/**
 * The overview — the numbers the floor is judged on, in two weights.
 *
 * The page answers questions in a fixed order: what is happening *now*, who is
 * doing it, how is it going, what has already happened. This section is the
 * first two of those, and it is built in two tiers because those questions are
 * not equal:
 *
 *   · **Primary** — the delivery floor. A hero figure for what is live this
 *     second, then what came in, what landed, how long it took, and whether the
 *     services are answering. These are read from across a desk, so they get
 *     paper, a large figure and room around it.
 *   · **Secondary** — the agent fleet. How many agents are actually talking,
 *     how many conversations are open, how much work has changed hands, how many
 *     calls went out and how fast they came back. Set smaller and on a single
 *     sunken rail, because they are the *diagnostic* layer: you go looking for
 *     them, they do not shout.
 *
 * Two tiers rather than eleven identical tiles is the whole point. A grid where
 * every number is the same size has no hierarchy, and a reader has to price each
 * one themselves every time they look at it.
 *
 * A stat tile rather than a chart wherever the answer is one number — a
 * single-bar bar chart is a number wearing a costume. Every tile that can be
 * unknown says so with an em dash rather than a zero: "no delivery has finished
 * yet" and "deliveries are taking no time at all" are different facts and they
 * must not share a rendering. Nothing here carries a trend arrow, for the same
 * reason: this page holds no history to compare against, and an arrow drawn
 * without one is decoration that reads as evidence.
 */

import { Meter, Sparkline } from './Charts';
import { humanDuration } from '../derive';
import { millis, type OpsMetrics } from '../ops';
import type { Kpis } from '../derive';
import type { Point } from '../types';

interface Props {
  kpis: Kpis;
  arrivals: Point[];
  /** What the range is called, so every tile can say what it counted. */
  rangeLabel: string;
  /** The agent-side numbers, from the same wire the control centre reads. */
  metrics: OpsMetrics;
  /** How many agent-to-agent turns have been seen — the negotiation tally. */
  a2aMessages: number;
  /** First paint, before any service has answered. */
  loading: boolean;
}

/** One tile on the secondary rail: a number, what it is, and one line under it. */
function Stat({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: string | number;
  foot: string;
  tone?: 'live' | 'good' | 'bad';
}) {
  return (
    <article className={`fkd-stat${tone ? ` fkd-stat-${tone}` : ''}`}>
      <p className="fkd-stat-label">
        {tone === 'live' && <span className="fkd-stat-dot" aria-hidden />}
        {label}
      </p>
      <p className="fkd-stat-value">{value}</p>
      <p className="fkd-stat-foot">{foot}</p>
    </article>
  );
}

/**
 * The shape of the section before the first poll answers.
 *
 * Drawn as the tiles that are coming rather than as a spinner: a spinner says
 * "wait", a skeleton says "five tiles, here, this size" — and on a page whose
 * layout is the information, the second is the one that stops the content
 * jumping under the reader a second later.
 */
function Skeleton() {
  return (
    <div className="fkd-overview" aria-busy="true" aria-label="Loading the floor">
      <div className="fkd-kpis">
        <div className="fkd-kpi fkd-kpi-hero fkd-skel-card">
          <span className="fkd-skel fkd-skel-label" />
          <span className="fkd-skel fkd-skel-hero" />
          <span className="fkd-skel fkd-skel-line" />
        </div>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="fkd-kpi fkd-skel-card">
            <span className="fkd-skel fkd-skel-label" />
            <span className="fkd-skel fkd-skel-value" />
            <span className="fkd-skel fkd-skel-line" />
          </div>
        ))}
      </div>
      <div className="fkd-fleet">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <div key={index} className="fkd-stat">
            <span className="fkd-skel fkd-skel-label" />
            <span className="fkd-skel fkd-skel-value" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KpiRow({ kpis, arrivals, rangeLabel, metrics, a2aMessages, loading }: Props) {
  if (loading) return <Skeleton />;

  const rate = kpis.successRate;
  const range = rangeLabel.toLowerCase();
  const blocked = kpis.agentsTotal - kpis.agentsUp;

  return (
    <div className="fkd-overview">
      <div className="fkd-kpis">
        <article className="fkd-kpi fkd-kpi-hero">
          <p className="fkd-kpi-label">Live right now</p>
          <p className="fkd-hero">{kpis.inFlight}</p>
          <p className="fkd-kpi-foot">
            {kpis.inFlight === 1 ? 'delivery on the floor' : 'deliveries on the floor'}
            {kpis.waiting > 0 && (
              <>
                {' · '}
                <span className="fkd-kpi-alert">⏸ {kpis.waiting} waiting on you</span>
              </>
            )}
          </p>
          <Sparkline points={arrivals} />
          <p className="fkd-kpi-hint">Arrivals across {range}</p>
        </article>

        <article className="fkd-kpi">
          <p className="fkd-kpi-label">Requests taken in</p>
          <p className="fkd-kpi-value">{kpis.takenIn}</p>
          <p className="fkd-kpi-foot">handed over in {range}</p>
        </article>

        <article className="fkd-kpi">
          <p className="fkd-kpi-label">Delivered</p>
          <p className="fkd-kpi-value">{kpis.delivered}</p>
          <Meter ratio={rate} tone="good" label="Share of settled jobs that were delivered" />
          <p className="fkd-kpi-foot">
            {rate === null
              ? 'nothing has settled yet'
              : `${Math.round(rate * 100)}% of ${kpis.settled} settled`}
          </p>
        </article>

        <article className="fkd-kpi">
          <p className="fkd-kpi-label">To the doorstep</p>
          <p className="fkd-kpi-value">
            {kpis.doorstep === null ? '—' : humanDuration(kpis.doorstep)}
          </p>
          <p className="fkd-kpi-foot">
            {kpis.doorstep === null
              ? 'no delivery has landed yet'
              : `median, request to customer${kpis.delivered > 1 ? `, of ${kpis.delivered}` : ''}`}
          </p>
        </article>

        <article className={`fkd-kpi${blocked > 0 ? ' fkd-kpi-warn' : ''}`}>
          <p className="fkd-kpi-label">Agents answering</p>
          <p className="fkd-kpi-value">
            {kpis.agentsUp}
            <span className="fkd-kpi-of">/{kpis.agentsTotal}</span>
          </p>
          <p className="fkd-kpi-foot">
            {blocked === 0 ? 'every service is up' : `${blocked} not answering — see the roster`}
          </p>
        </article>
      </div>

      {/* The fleet rail. One sunken strip rather than six more cards: these are
          read together as a row and pricing them individually is what turns an
          overview into a wall. */}
      <div className="fkd-fleet" role="group" aria-label="Agent fleet">
        <Stat
          label="Agents talking"
          value={metrics.activeAgents}
          foot={
            metrics.agentsSeen === 0
              ? 'none has spoken yet'
              : `of ${metrics.agentsSeen} seen on the wire`
          }
          tone={metrics.activeAgents > 0 ? 'live' : undefined}
        />
        <Stat
          label="Live conversations"
          value={metrics.activeTasks}
          foot={`${metrics.tasks} ${metrics.tasks === 1 ? 'task' : 'tasks'} recorded`}
          tone={metrics.activeTasks > 0 ? 'live' : undefined}
        />
        <Stat
          label="A2A messages"
          value={a2aMessages}
          foot="agent-to-agent turns"
        />
        <Stat
          label="Handovers"
          value={metrics.handovers}
          foot={metrics.handoversOpen === 0 ? 'none open' : `${metrics.handoversOpen} still open`}
          tone={metrics.handoversOpen > 0 ? 'live' : undefined}
        />
        <Stat
          label="Tool & API calls"
          value={metrics.calls}
          foot={metrics.callsFailed === 0 ? 'none failed' : `${metrics.callsFailed} failed`}
          tone={metrics.callsFailed > 0 ? 'bad' : undefined}
        />
        <Stat
          label="Median response"
          value={millis(metrics.medianCallMs)}
          foot={metrics.medianCallMs === null ? 'nothing measured yet' : 'per call, round trip'}
        />
        <Stat
          label="Completed"
          value={metrics.completed}
          foot="tasks that finished"
          tone={metrics.completed > 0 ? 'good' : undefined}
        />
        <Stat
          label="Failed or blocked"
          value={metrics.failed + blocked}
          foot={
            metrics.failed + blocked === 0
              ? 'nothing to look at'
              : `${metrics.failed} failed · ${blocked} not answering`
          }
          tone={metrics.failed + blocked > 0 ? 'bad' : undefined}
        />
      </div>
    </div>
  );
}
