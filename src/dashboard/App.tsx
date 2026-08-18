import { useCallback, useMemo, useRef, useState } from 'react';
import { Panel, PanelFoldContext, type PanelFold } from '@/components/Panel';
import { Bars, Columns, Figure, NoData } from './components/Charts';
import { AgentRoster } from './components/AgentRoster';
import { AssignmentTable } from './components/AssignmentTable';
import { KpiRow } from './components/KpiRow';
import { LiveFeed } from './components/LiveFeed';
import { Pipeline } from './components/Pipeline';
import { ControlCenter } from './components/monitor/ControlCenter';
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
import { useMonitor } from './useMonitor';

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

/**
 * The status bar — the range picker, the two counts, and the poll switch.
 *
 * The one strip on this page that is *not* a section: it scopes every number
 * below it, so it pins to the top of the scroll box and has no fold of its own.
 * A control that scopes the page cannot be one of the things the page hides.
 *
 * The two counts are set as a pair of stat blocks rather than as the sentence
 * they used to be. "3 jobs in range · 0 live" reads as one fact with a middle
 * dot in it; they are two different questions — how much work the charts below
 * are counting, and how much of it is happening this second — and the second
 * one is the one somebody is actually watching, so it carries the live dot and
 * lights up when it is non-zero.
 */
function Toolbar({
  lookback,
  onLookback,
  paused,
  onPause,
  jobs,
  live,
  rangeLabel,
  allOpen,
  onFoldAll,
}: {
  lookback: Lookback;
  onLookback: (lookback: Lookback) => void;
  paused: boolean;
  onPause: (paused: boolean) => void;
  jobs: number;
  live: number;
  rangeLabel: string;
  allOpen: boolean;
  onFoldAll: (open: boolean) => void;
}) {
  return (
    <div className="fkd-toolbar" role="region" aria-label="Range and floor status">
      <div className="fkd-toolbar-lead">
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

        <div className="fkd-readout">
          <div className="fkd-readout-stat">
            <p className="fkd-readout-label">Jobs in range</p>
            <p className="fkd-readout-value">
              {jobs}
              <span className="fkd-readout-unit">{jobs === 1 ? 'job' : 'jobs'}</span>
            </p>
            <p className="fkd-readout-hint">{rangeLabel.toLowerCase()}</p>
          </div>

          <span className="fkd-readout-rule" aria-hidden />

          <div className={`fkd-readout-stat${live > 0 ? ' fkd-readout-stat-hot' : ''}`}>
            <p className="fkd-readout-label">
              <span
                className={`fk-dot${live > 0 ? ' fk-dot-busy fk-dot-live' : ''}`}
                aria-hidden
              />
              Live jobs
            </p>
            <p className="fkd-readout-value">{live}</p>
            <p className="fkd-readout-hint">{live === 0 ? 'floor is quiet' : 'on the floor now'}</p>
          </div>
        </div>
      </div>

      <div className="fkd-toolbar-actions">
        {/* Housekeeping for a long page, not a control over the data: it folds
            the sections away and leaves every number exactly as it was. */}
        <button
          type="button"
          className="fkd-foldall"
          onClick={() => onFoldAll(!allOpen)}
          title={allOpen ? 'Fold every section away' : 'Open every section'}
        >
          <span aria-hidden>{allOpen ? '⤡' : '⤢'}</span>
          <span className="fkd-foldall-label">{allOpen ? 'Collapse all' : 'Expand all'}</span>
        </button>

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

  // The control centre's own wire: the shared bus joined to the dispatcher feed
  // above. Deliberately not scoped by the toolbar's lookback — the range picker
  // scopes *counting*, and a live monitor that hid the sentence an agent said
  // sixteen minutes ago because the range is fifteen would be hiding the start
  // of the run it is showing you the end of.
  const monitor = useMonitor(feed);

  const everythingDown = fleet.agents.every((agent) => agent.state === 'offline');

  // "Collapse all" / "Expand all". A broadcast rather than a lock — each panel
  // applies it once and then owns its own state again, so folding everything
  // away does not stop one section being opened on its own afterwards.
  const [fold, setFold] = useState<PanelFold | null>(null);
  const [allOpen, setAllOpen] = useState(true);
  const nonce = useRef(0);
  const foldAll = useCallback((open: boolean) => {
    nonce.current += 1;
    setFold({ open, nonce: nonce.current });
    setAllOpen(open);
  }, []);

  return (
    <PanelFoldContext.Provider value={fold}>
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
              {/* The floor's vitals, in the header rather than in a panel: this is
                  the one line that has to be readable from across the room, and
                  on a page that scrolls, a panel is not always on screen. Both
                  halves are read off state this page already holds — nothing here
                  is a new request. */}
              <p
                className={`fkd-vitals${kpis.agentsUp < kpis.agentsTotal ? ' fkd-vitals-warn' : ''}`}
              >
                <span>
                  <strong>
                    {kpis.agentsUp}/{kpis.agentsTotal}
                  </strong>{' '}
                  answering
                </span>
                <span className="fkd-vitals-sep" aria-hidden />
                <span>
                  <strong>{monitor.pulse.live}</strong> live
                </span>
                <span className="fkd-vitals-sep" aria-hidden />
                <span>
                  <strong>{monitor.pulse.perMinute}</strong> events/min
                </span>
              </p>

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
            rangeLabel={rangeLabel}
            allOpen={allOpen}
            onFoldAll={foldAll}
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

          <div className="fkd-block fkd-block-kpis fk-rise">
            {/* The tiles were bare on the sheet before, which made them the one
                part of the page that could not be folded away. They keep their
                own look — a Panel around them would put a card inside a card —
                so the surface is stripped back to the header and the fold. */}
            <Panel
              icon={<span aria-hidden>📊</span>}
              title="At a glance"
              note={`The five numbers the floor is judged on, across ${rangeLabel.toLowerCase()}`}
              className="fkd-panel-bare"
              collapsible
              persistKey="fkd.kpis"
            >
              <KpiRow kpis={kpis} arrivals={charts.arrivals.points} rangeLabel={rangeLabel} />
            </Panel>
          </div>

          <div className="fkd-block fkd-block-monitor fk-rise fk-rise-1">
            <Panel
              icon={<span aria-hidden>🛰️</span>}
              title="Agent control centre"
              note="What the agents are saying to each other, as they say it — every call, every answer, every handover"
              live={monitor.pulse.live > 0}
              tone={monitor.pulse.errors > 0 ? 'flame' : monitor.pulse.live > 0 ? 'amber' : undefined}
              collapsible
              persistKey="fkd.monitor"
            >
              <ControlCenter monitor={monitor} agents={fleet.agents} />
            </Panel>
          </div>

          <div className="fkd-block fk-rise fk-rise-1">
            <Panel
              icon={<span aria-hidden>🗺️</span>}
              title="How a request moves"
              note="Every agent on the floor, in the order work passes through them — with what each is holding"
              live={kpis.inFlight > 0 && !fleet.paused}
              collapsible
              persistKey="fkd.pipeline"
            >
              <Pipeline agents={fleet.agents} jobs={scoped} />
            </Panel>
          </div>

          <div className="fkd-split fk-rise fk-rise-2">
            <Panel
              icon={<span aria-hidden>👥</span>}
              title="The agents"
              note="What each one is, what it runs on, and how busy it has been since this page opened"
              collapsible
              persistKey="fkd.roster"
            >
              <AgentRoster agents={fleet.agents} samples={fleet.samples} />
            </Panel>

            <div className="fkd-stack">
              <Panel
                icon={<span aria-hidden>📋</span>}
                title="Who is holding what"
                note="Every job in range, and whether it is moving on its own"
                collapsible
                persistKey="fkd.assignments"
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
                collapsible
                persistKey="fkd.feed"
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
              collapsible
              persistKey="fkd.figures"
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
              persistKey="fkd.provenance"
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
    </PanelFoldContext.Provider>
  );
}
