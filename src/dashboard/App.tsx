import { useMemo, useState } from 'react';
import { Panel } from '@/components/Panel';
import { Bars, Columns, Figure, NoData } from './components/Charts';
import { AgentRoster } from './components/AgentRoster';
import { AssignmentTable } from './components/AssignmentTable';
import { KpiRow } from './components/KpiRow';
import { LiveFeed } from './components/LiveFeed';
import { Pipeline } from './components/Pipeline';
import {
  arrivals as bucketArrivals,
  assignments,
  funnel,
  humanDuration,
  inLookback,
  kpis as computeKpis,
  LOOKBACKS,
  outcomes,
  stageTimes,
  type Lookback,
} from './derive';
import { useFleet } from './useFleet';
import { useLiveFeed } from './useLiveFeed';

/**
 * The operations dashboard — the fourth console, and the only one that watches.
 *
 * The other three each drive an agent: you type an errand into one, follow a
 * negotiation in another, work the delivery gates in the third. This one drives
 * nothing. It reads all four services and answers the four questions an operator
 * has before they know which console to open —
 *
 *   · who is on the floor, and is any of them stuck (the roster, the diagram)
 *   · how is work arriving (the arrivals chart, the hero figure)
 *   · what is being done to it right now (the assignment table, the feed)
 *   · how is it ending up (the funnel, the outcomes, the doorstep median)
 *
 * — and every one of them is answered by something a person can act on rather
 * than by a gauge. There is no control on this page that changes anything, which
 * is the point: an overview that can also press buttons becomes a fifth place
 * where the state of an order can be changed, and this floor already has enough.
 *
 * On what is *not* here. Neither ordering service publishes a list of its runs,
 * so this page cannot show a history of errands — only whether one is happening.
 * Rather than fill that hole with an estimate, the roster says "no queue
 * published" out loud and the strips draw only what this page has watched with
 * its own eyes. Everything with a past tense on this screen comes from the
 * delivery board, which is the one service here that keeps a timeline.
 */

/** The range everything below the toolbar is scoped to. One control, one slice. */
function Toolbar({
  lookback,
  onLookback,
  paused,
  onPause,
  jobs,
  live,
}: {
  lookback: Lookback;
  onLookback: (lookback: Lookback) => void;
  paused: boolean;
  onPause: (paused: boolean) => void;
  jobs: number;
  live: number;
}) {
  return (
    <div className="fkd-toolbar">
      <div className="fkd-seg" role="group" aria-label="Time range">
        {LOOKBACKS.map((option) => (
          <button
            key={option.label}
            type="button"
            className={`fkd-seg-btn${option.value === lookback ? ' fkd-seg-on' : ''}`}
            aria-pressed={option.value === lookback}
            onClick={() => onLookback(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="fkd-toolbar-read">
        <strong>{jobs}</strong> {jobs === 1 ? 'job' : 'jobs'} in range · <strong>{live}</strong> live
      </p>

      {/* Pausing freezes the poll, not the page: a board that repaints under
          somebody who is reading a row is a board they lose their place in. */}
      <button
        type="button"
        className={`fkd-live${paused ? ' fkd-live-off' : ''}`}
        aria-pressed={!paused}
        onClick={() => onPause(!paused)}
      >
        <span className={`fk-dot ${paused ? '' : 'fk-dot-busy fk-dot-live'}`} aria-hidden />
        {paused ? 'Paused' : 'Live'}
      </button>
    </div>
  );
}

export default function App() {
  const fleet = useFleet();
  const [lookback, setLookback] = useState<Lookback>(60);

  const rangeLabel = LOOKBACKS.find((option) => option.value === lookback)?.label ?? 'the range';

  // Every derivation keys off the poll counter rather than off the one-second
  // clock, so the charts are rebuilt when the data changes and not sixty times
  // a minute because a job got a second older.
  const scoped = useMemo(
    () => inLookback(fleet.jobs, lookback, Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fleet.jobs, lookback, fleet.tick],
  );

  const charts = useMemo(() => {
    const now = Date.now();
    return {
      arrivals: bucketArrivals(scoped, lookback, now),
      funnel: funnel(scoped),
      stages: stageTimes(scoped),
      outcomes: outcomes(scoped),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, lookback, fleet.tick]);

  const kpis = computeKpis(scoped, fleet.agents);
  const rows = assignments(scoped, fleet.now);
  const feed = useLiveFeed(fleet.jobs);
  const followingCount = fleet.jobs.filter((job) => !job.done).length;

  const everythingDown = fleet.agents.every((agent) => agent.state === 'offline');

  return (
    <div className="fk-shell fkd-shell">
      <header className="fk-header">
        <div className="fk-header-inner">
          <div className="fk-brand">
            <span className="fkd-mark" aria-hidden>
              🛰️
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="fk-brand-name">Agent operations</h1>
              <div className="fk-brand-sub">
                Five agents, four services — what came in, who is working it, how it ended
              </div>
            </div>
          </div>

          <div className="fk-header-actions">
            <span className="fk-tag">
              <span aria-hidden>📊</span>
              Dashboard
            </span>

            {/* Plain anchors: the four consoles are separate Vite entries rather
                than routes, so this is a page load by design. */}
            <a className="fk-nav-link" href="/" title="Open the ordering agent's console">
              <span aria-hidden>🤖</span>
              <span className="fk-nav-link-label">Ordering</span>
            </a>
            <a className="fk-nav-link" href="/a2a.html" title="Open the A2A ordering console">
              <span aria-hidden>🤝</span>
              <span className="fk-nav-link-label">A2A</span>
            </a>
            <a className="fk-nav-link" href="/foodpanda.html" title="Open the delivery agent's board">
              <span aria-hidden>🛵</span>
              <span className="fk-nav-link-label">Delivery</span>
            </a>
          </div>
        </div>
      </header>

      <main className="fk-content fkd-content">
        <Toolbar
          lookback={lookback}
          onLookback={setLookback}
          paused={fleet.paused}
          onPause={fleet.setPaused}
          jobs={scoped.length}
          live={kpis.inFlight}
        />

        {everythingDown && !fleet.loading && (
          <div className="fkd-alarm fk-rise">
            <p className="fkd-alarm-title">Nothing is answering.</p>
            <p className="fkd-alarm-body">
              None of the four services responded. Start them in{' '}
              <span className="fk-pill-mono">friends-kitchen-agent-backend</span> — the ordering
              agent on 8100, the A2A desk on 8101, the in-house courier on 8102 and the Foodpanda
              dispatcher on 8103. This page will pick each one up on its own as it comes back.
            </p>
          </div>
        )}

        <div className="fk-rise">
          <KpiRow kpis={kpis} arrivals={charts.arrivals.points} rangeLabel={rangeLabel} />
        </div>

        <div className="fkd-block fk-rise fk-rise-1">
          <Panel
            icon={<span aria-hidden>🗺️</span>}
            title="How a request moves"
            note="Every agent on the floor, in the order work passes through them — with what each is holding"
            live={kpis.inFlight > 0 && !fleet.paused}
          >
            <Pipeline agents={fleet.agents} jobs={scoped} />
          </Panel>
        </div>

        <div className="fkd-split fk-rise fk-rise-2">
          <Panel
            icon={<span aria-hidden>👥</span>}
            title="The agents"
            note="What each one is, what it runs on, and how busy it has been since this page opened"
          >
            <AgentRoster agents={fleet.agents} samples={fleet.samples} />
          </Panel>

          <div className="fkd-stack">
            <Panel
              icon={<span aria-hidden>📋</span>}
              title="Who is holding what"
              note="Every job in range, and whether it is moving on its own"
            >
              <AssignmentTable rows={rows} />
            </Panel>

            <Panel
              icon={<span aria-hidden>📡</span>}
              title="Live activity"
              note={
                followingCount === 0
                  ? 'Nothing running — this fills the moment a delivery lands'
                  : `Following ${Math.min(4, followingCount)} of ${followingCount} live ${followingCount === 1 ? 'job' : 'jobs'}`
              }
              live={followingCount > 0}
            >
              <LiveFeed rows={feed} following={followingCount} />
            </Panel>
          </div>
        </div>

        <div className="fkd-block fk-rise fk-rise-2">
          <Panel
            icon={<span aria-hidden>📈</span>}
            title="Arriving, moving, ending"
            note="Read from the delivery board's own timelines — the one service on this floor that keeps a history"
          >
            <div className="fkd-figs">
              <Figure
                title="Requests taken in"
                note={`One column per bucket across ${rangeLabel.toLowerCase()}. A gap is a quiet stretch, not missing data.`}
                table={{
                  head: ['Bucket', 'Requests'],
                  rows: charts.arrivals.points.map((point) => [
                    new Date(point.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    point.value,
                  ]),
                }}
              >
                {kpis.takenIn === 0 ? (
                  <NoData note="No requests in this range." />
                ) : (
                  <Columns points={charts.arrivals.points} bucketMs={charts.arrivals.bucketMs} />
                )}
              </Figure>

              <Figure
                title="How far each job got"
                note="Counted from each job's own timeline, so the bars can only descend. A steep step is where work is being lost."
                table={{
                  head: ['Stage', 'Jobs that reached it'],
                  rows: charts.funnel.map((row) => [row.label, row.value]),
                }}
              >
                {kpis.takenIn === 0 ? (
                  <NoData note="Nothing has come through yet." />
                ) : (
                  <Bars
                    rows={charts.funnel}
                    format={(value) => `${value}`}
                    max={charts.funnel[0]?.value || 1}
                    glyphs={{ delivered: '✓' }}
                  />
                )}
              </Figure>

              <Figure
                title="Where the time goes"
                note="Median time a job spends in each stage — including any stretch it spent waiting for somebody to press a button."
                table={{
                  head: ['Stage', 'Median', 'Samples'],
                  rows: charts.stages.map((row) => [
                    row.label,
                    humanDuration(row.value),
                    row.note ?? '',
                  ]),
                }}
              >
                {charts.stages.length === 0 ? (
                  <NoData note="No job has changed stage yet." />
                ) : (
                  <Bars rows={charts.stages} format={(value) => humanDuration(value)} />
                )}
              </Figure>

              <Figure
                title="How they ended"
                note="Settled jobs only. A delivery still on the road has no outcome yet and is not counted as a failure."
                table={{
                  head: ['Outcome', 'Jobs'],
                  rows: charts.outcomes.map((row) => [row.label, row.value]),
                }}
              >
                {kpis.settled === 0 ? (
                  <NoData note="Nothing has settled in this range." />
                ) : (
                  <Bars
                    rows={charts.outcomes}
                    format={(value) => `${value}`}
                    glyphs={{ delivered: '✓', rejected: '⊘', failed: '✕', cancelled: '—' }}
                  />
                )}
              </Figure>
            </div>
          </Panel>
        </div>

        <div className="fkd-block fk-rise fk-rise-2">
          <Panel
            icon={<span aria-hidden>📎</span>}
            title="Where these numbers come from"
            note="So nothing on this page has to be taken on trust"
            collapsible
            defaultOpen={false}
          >
            <dl className="fkd-provenance">
              <dt>Requests, stages, timings, outcomes</dt>
              <dd>
                <span className="fk-pill-mono">GET :8103/api/foodpanda/jobs</span> — every delivery
                the dispatcher has taken in, each with its own timeline. Stage counts are read from
                those timelines rather than from a job's current status, so a delivered order still
                counts towards every stage it passed.
              </dd>

              <dt>Who is holding a job</dt>
              <dd>
                Derived from <span className="fk-pill-mono">status</span> and{' '}
                <span className="fk-pill-mono">awaiting</span> together. An accepted job is the
                dispatcher's while it hunts for a rider and yours the moment it starts waiting to be
                asked for one — same status, and the difference is the whole point of the table.
              </dd>

              <dt>Agent state</dt>
              <dd>
                The four health endpoints, polled every 2.5 seconds:{' '}
                <span className="fk-pill-mono">:8100/api/agent/health</span>,{' '}
                <span className="fk-pill-mono">:8101/api/a2a/health</span>,{' '}
                <span className="fk-pill-mono">:8102/api/delivery/health</span>,{' '}
                <span className="fk-pill-mono">:8103/api/foodpanda/health</span>.
              </dd>

              <dt>The activity strips</dt>
              <dd>
                Not from any service — no agent here records its own busyness. Each strip is what
                this page has watched since it was opened, sampled once per poll. Reload it and the
                strips start empty, which is why the part before you arrived is drawn as nothing
                rather than as idle time.
              </dd>

              <dt>What is missing, and why</dt>
              <dd>
                The ordering agent and the A2A desk keep their runs in memory and publish no list of
                them, so this page can say whether one is running but not how many have run. Those
                two report “no queue published” instead of a number.
              </dd>
            </dl>
          </Panel>
        </div>
      </main>
    </div>
  );
}
