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
import { TestRequestForm } from './components/TestRequestForm';
import { useDeliveryBoard } from './useDeliveryBoard';
import type { AgentCard, FoodpandaHealth } from './types';

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
  const [card, setCard] = useState<AgentCard | null>(null);

  const refreshHealth = useCallback(async () => {
    setHealth(await foodpandaApi.health());
  }, []);

  useEffect(() => {
    void refreshHealth();
    void foodpandaApi.card().then(setCard);
  }, [refreshHealth]);

  // Re-read when the followed job settles: that is when "on the road" changes,
  // and when a service that died mid-ride should stop being reported as healthy.
  useEffect(() => {
    if (!board.live) void refreshHealth();
  }, [board.live, refreshHealth]);

  const job = board.selected;
  const blocked = !health
    ? 'The delivery agent is not running on port 8103.'
    : !health.dispatcher.ready
      ? (health.dispatcher.problem ?? 'The dispatcher has no usable model credentials.')
      : null;

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

        {/* Said once, at the top, where anybody reading this page sees it before
            they read a status. The dispatcher is a real agent; the motorbike is
            not, and a console that let that be discovered later would be the
            dishonest version of this whole exercise. */}
        <p className="fp-disclosure fk-rise">
          <strong>What is real here:</strong> the dispatcher is an AI agent making its
          own decisions — it reads each request, judges whether it can be delivered,
          and refuses the ones it cannot. <strong>What is simulated:</strong> the ride.
          Each leg is compressed to seconds and waited out, never skipped, so a job
          only reaches <em>delivered</em> after the whole journey has actually run.
          This service is not connected to Foodpanda.
        </p>

        {/* Said only when it is true. The gate is configuration on the delivery
            agent, and an instruction to press a button that never appears would
            be worse than no instruction at all. */}
        {health?.operatorSteps && (
          <p className="fp-disclosure fk-rise">
            <strong>Two steps are yours:</strong> the dispatcher decides whether it
            will take a delivery, then waits — first to be asked for a rider, and
            again to be asked to bring the order out. Both requests are on the
            right, under <em>Where it has got to</em>.
          </p>
        )}

        <div className="fp-columns">
          <div className="fk-col fk-col-stack fk-rise fk-rise-1">
            <Panel
              icon={<span aria-hidden>📋</span>}
              title="The board"
              note="Deliveries handed over by the ordering agent"
              fill="scroll"
              className="fp-share-3"
              // Folds away when the operator is watching one delivery rather
              // than triaging the queue — the log and the journey then take the
              // height the list was using.
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

            <Panel
              icon={<span aria-hidden>🧪</span>}
              title="Send a test request"
              note="The same message, typed by hand instead of by an agent"
              collapsible
              defaultOpen={board.jobs.length === 0}
              fill="scroll"
              className="fp-share-2"
            >
              <TestRequestForm
                onSend={(input) => void board.send(input)}
                disabled={blocked !== null}
                radiusKm={health?.radiusKm ?? null}
              />
              {blocked && <p className="fp-fault fp-gap">{blocked}</p>}
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

            {card && (
              <Panel
                icon={<span aria-hidden>🪪</span>}
                title="Agent card"
                note={
                  <>
                    served at <span className="fk-pill-mono">/.well-known/agent-card.json</span>
                  </>
                }
                collapsible
                defaultOpen={false}
                fill="scroll"
                className="fp-share-1"
              >
                <p className="fp-card-desc">{card.description}</p>
                <ul className="fp-skills">
                  {card.skills.map((skill) => (
                    <li key={skill.id}>
                      <span className="fp-skill-name">{skill.name}</span>
                      <span className="fp-skill-id">{skill.id}</span>
                    </li>
                  ))}
                </ul>
                {card['x-service'] && (
                  <p className="fk-hint fp-gap">{card['x-service'].simulation}</p>
                )}
              </Panel>
            )}
          </div>
        </div>

        {board.error && <p className="fp-fault fp-gap">{board.error}</p>}
      </main>
    </div>
  );
}
