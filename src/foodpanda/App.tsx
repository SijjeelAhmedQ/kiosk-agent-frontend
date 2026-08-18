import { useCallback, useEffect, useState } from 'react';
import { Button } from 'antd';
import { Panel } from '@/components/Panel';
import { foodpandaApi } from './api';
import { DispatcherLog } from './components/DispatcherLog';
import { JobBoard } from './components/JobBoard';
import { Journey } from './components/Journey';
import { Outcome } from './components/Outcome';
import { RequestActions } from './components/RequestActions';
import { RequestCard } from './components/RequestCard';
import { StatusPill } from './components/StatusPill';
import { useDeliveryBoard } from './useDeliveryBoard';
import type { FoodpandaHealth } from './types';

/**
 * The delivery agent's own console.
 *
 * A third page beside the errand console and the A2A console — not a tab inside
 * either. It talks to a different service, on a different port, run by a
 * different agent, and the separation is the honest shape: this is what the
 * *courier* sees. Nothing on this page can reach the restaurant's cart, wallet
 * or menu, because the agent behind it cannot either.
 *
 * What they share is the design system — `Panel`, the theme, the stylesheet —
 * imported and never edited.
 *
 * The layout follows the question an operator actually has: what work is there
 * (left), what did the agent make of this one (middle), where has it got to and
 * what did it cost (right).
 */

/** The dispatcher's readiness, and what it is running on. */
function Services({ health }: { health: FoodpandaHealth | null }) {
  if (!health) {
    return (
      <div className="fk-status fp-services-down">
        <span className="fk-dot fk-dot-bad" aria-hidden />
        The delivery agent is not answering on port 8103.
      </div>
    );
  }

  return (
    <div className="fp-services">
      <span className="fk-status" title={health.dispatcher.problem ?? undefined}>
        <span
          className={`fk-dot ${health.dispatcher.ready ? 'fk-dot-ok' : 'fk-dot-bad'}`}
          aria-hidden
        />
        Dispatcher
        <span className="fk-pill-mono">
          {health.dispatcher.provider} · {health.dispatcher.model}
        </span>
      </span>

      <span className="fk-status">
        <span className="fk-dot fk-dot-ok" aria-hidden />
        Service radius
        <span className="fk-pill-mono">{health.radiusKm} km</span>
      </span>

      <span className="fk-status">
        <span className={`fk-dot ${health.activeJobs > 0 ? 'fk-dot-busy fk-dot-live' : ''}`} aria-hidden />
        {health.activeJobs} on the road
        <span className="fk-pill-mono">{health.totalJobs} today</span>
      </span>
    </div>
  );
}

export default function App() {
  const board = useDeliveryBoard();
  const [health, setHealth] = useState<FoodpandaHealth | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealth(await foodpandaApi.health());
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  // Re-read when the followed job settles: that is when "on the road" changes,
  // and when a service that died mid-ride should stop being reported as healthy.
  useEffect(() => {
    if (!board.live) void refreshHealth();
  }, [board.live, refreshHealth]);

  const job = board.selected;

  return (
    <div className="fk-shell">
      <header className="fk-header">
        <div className="fk-header-inner">
          <div className="fk-brand">
            <span className="fp-mark" aria-hidden>
              🛵
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="fk-brand-name">Foodpanda Delivery</h1>
              <div className="fk-brand-sub">
                A dispatcher agent — it takes orders from the restaurant’s agent and
                carries them to the customer
              </div>
            </div>
          </div>

          <div className="fk-header-actions">
            {/* Plain anchors, because the three consoles are separate Vite
                entries rather than routes in one app. */}
            <a className="fk-nav-link" href="/" title="Back to the ordering agent">
              <span className="fk-nav-link-arrow" aria-hidden>
                ←
              </span>
              <span aria-hidden>🤖</span>
              <span className="fk-nav-link-label">Ordering agent</span>
            </a>

            <a
              className="fk-nav-link"
              href="/dashboard.html"
              title="Open the operations dashboard"
            >
              <span aria-hidden>📊</span>
              <span className="fk-nav-link-label">Operations</span>
              <span className="fk-nav-link-arrow" aria-hidden>
                →
              </span>
            </a>

            <span className="fk-tag">
              <span aria-hidden>🛵</span>
              Delivery
            </span>

            {job && <StatusPill status={job.status} live={!job.done} />}

            {job && !job.done && (
              <Button danger onClick={() => void board.cancel()}>
                Cancel delivery
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="fk-content">
        <div className="fk-status-bar fk-rise">
          <Services health={health} />
        </div>

        <div className="fp-columns">
          <div className="fk-col fk-col-stack fk-rise fk-rise-1">
            <Panel
              icon={<span aria-hidden>📋</span>}
              title="The board"
              note="Deliveries handed over by the ordering agent"
              fill="scroll"
              className="fp-share-3"
              // Folds away when the operator is watching one delivery rather
              // than triaging the queue.
              //
              // No refresh button beside the chevron: the board re-reads itself
              // every couple of seconds, so the control would only ever do what
              // was about to happen anyway — and two controls in this header
              // squeeze the title onto three lines.
              collapsible
            >
              <JobBoard
                jobs={board.jobs}
                selectedId={board.selectedId}
                onSelect={board.select}
              />
            </Panel>
          </div>

          <div className="fk-col fk-col-stack fk-rise fk-rise-2">
            <Panel
              icon={<span aria-hidden>📨</span>}
              title="The request, as it arrived"
              note={
                job ? (
                  <>
                    from the Friends Kitchen ordering agent · order{' '}
                    <span className="fk-pill-mono">{job.orderNumber}</span>
                  </>
                ) : (
                  'The A2A message this agent was sent'
                )
              }
              collapsible
              fill="scroll"
              className="fp-share-2"
            >
              {job ? (
                <RequestCard job={job} />
              ) : (
                <p className="fk-hint">Nothing selected.</p>
              )}
            </Panel>

            <Panel
              icon={<span aria-hidden>🧠</span>}
              title="What the dispatcher did"
              note="Every tool call, in the order it made them"
              live={board.live}
              // Folds away once the reasoning has been read and the request
              // above it is what's being checked against. The live bar stays on
              // the header either way, so a folded panel still shows a run
              // going on underneath it.
              collapsible
              fill="scroll"
              className="fp-share-3"
            >
              <DispatcherLog rows={board.rows} live={board.live} />
            </Panel>
          </div>

          <div className="fk-col fk-col-stack fk-rise fk-rise-2">
            <Panel
              icon={<span aria-hidden>🗺️</span>}
              title="Where it has got to"
              note={job ? job.message : 'The journey, from request to doorstep'}
              live={board.live}
              extra={
                job && !job.done && job.etaSeconds !== null ? (
                  <span className="fk-badge">~{job.etaSeconds}s</span>
                ) : null
              }
              fill="scroll"
              className="fp-share-3"
            >
              {job ? (
                <>
                  {/* Above the journey, not below it: this is what somebody came
                      to this panel to do, and a control under six steps and a
                      paragraph is a control found by scrolling. */}
                  <RequestActions
                    job={job}
                    asking={board.asking}
                    onFindRider={() => void board.findRider()}
                    onDeliver={() => void board.deliver()}
                  />
                  <Journey job={job} />
                  <Outcome job={job} />
                </>
              ) : (
                <p className="fk-hint">
                  Nothing selected. Jobs appear on the board as the ordering agent
                  hands them over.
                </p>
              )}
            </Panel>
          </div>
        </div>

        {board.error && <p className="fp-fault fp-gap">{board.error}</p>}
      </main>
    </div>
  );
}
