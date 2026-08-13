import { useCallback, useEffect, useState } from 'react';
import { Button } from 'antd';
import { Panel } from '@/components/Panel';
import { a2aApi } from './api';
import { ErrandForm } from './components/ErrandForm';
import { Outcome } from './components/Outcome';
import { Transcript } from './components/Transcript';
import { useNegotiation } from './useNegotiation';
import type { A2AHealth, StartA2ARunInput } from './types';

/**
 * The A2A console.
 *
 * A sibling of the errand console, not a tab inside it: this page talks to a
 * different service on a different port, and the two are separate so that
 * neither can be broken by a change to the other. What they share is the design
 * system — `Panel`, the theme, the stylesheet — imported, never edited.
 *
 * The layout follows what the operator actually does: fill in an errand on the
 * left, watch two agents settle it in the middle, read what it cost on the
 * right.
 */

function StatusPill({ status, busy }: { status: string; busy: boolean }) {
  if (status === 'idle') return null;
  const [dot, label] = busy
    ? ['fk-dot-busy fk-dot-live', status === 'queued' ? 'Waiting its turn' : 'Negotiating']
    : status === 'done'
      ? ['fk-dot-ok', 'Settled']
      : status === 'cancelled'
        ? ['fk-dot', 'Stopped']
        : ['fk-dot-bad', 'Broke down'];
  return (
    <span className="fk-pill">
      <span className={`fk-dot ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

/** Both sides' readiness, said separately — they are configured separately. */
function Services({ health }: { health: A2AHealth | null }) {
  if (!health) {
    return (
      <div className="fk-status a2a-services-down">
        <span className="fk-dot fk-dot-bad" aria-hidden />
        The A2A service is not answering on port 8101.
      </div>
    );
  }

  const sides = [
    { who: 'Buyer', side: health.buyer },
    { who: 'Merchant', side: health.merchant },
  ];

  return (
    <div className="a2a-services">
      <span className="fk-status">
        <span className={`fk-dot ${health.restaurantApi ? 'fk-dot-ok' : 'fk-dot-bad'}`} aria-hidden />
        Friends Kitchen
      </span>
      {sides.map(({ who, side }) => (
        <span className="fk-status" key={who} title={side.problem ?? undefined}>
          <span className={`fk-dot ${side.ready ? 'fk-dot-ok' : 'fk-dot-bad'}`} aria-hidden />
          {who}
          <span className="fk-pill-mono">
            {side.provider}
            {side.hands ? ` · ${side.hands}` : ''}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function App() {
  const run = useNegotiation();
  const [health, setHealth] = useState<A2AHealth | null>(null);
  const [couponsKey, setCouponsKey] = useState(0);

  const refreshHealth = useCallback(async () => {
    setHealth(await a2aApi.health());
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  // Re-check when a run settles: that is when "busy" changes, and when a
  // service that died mid-negotiation should stop being reported as healthy.
  useEffect(() => {
    if (!run.busy) void refreshHealth();
  }, [run.busy, refreshHealth]);

  const fresh = () => {
    run.reset();
    // The errand that just finished may have spent the coupon it carried, and
    // the picker was filled when the page loaded.
    setCouponsKey((key) => key + 1);
  };

  const blocked: string | null = !health
    ? 'The A2A service is not running on port 8101.'
    : !health.buyer.ready
      ? (health.buyer.problem ?? 'The buying agent has no usable model credentials.')
      : !health.merchant.ready
        ? (health.merchant.problem ?? 'The ordering desk has no usable model credentials.')
        : !health.restaurantApi
          ? 'Friends Kitchen is not answering on port 8000 — start the Friends Kitchen backend.'
          : null;

  return (
    <div className="fk-shell">
      <header className="fk-header">
        <div className="fk-header-inner">
          <div className="fk-brand">
            <img className="fk-mark" src="/logo.png" alt="" width={44} height={44} aria-hidden />
            <div style={{ minWidth: 0 }}>
              <h1 className="fk-brand-name">Friends Kitchen</h1>
              <div className="fk-brand-sub">
                Agent to agent — a buyer with a wallet, a restaurant with a menu
              </div>
            </div>
          </div>

          <div className="fk-header-actions">
            {/* The way back to the errand console — the same plain anchor it
                used to get here, since the two pages are separate entries. */}
            <a className="fk-nav-link" href="/" title="Back to the ordering agent">
              <span className="fk-nav-link-arrow" aria-hidden>
                ←
              </span>
              <span aria-hidden>🤖</span>
              <span className="fk-nav-link-label">Ordering agent</span>
            </a>

            <span className="fk-tag">
              <span aria-hidden>🤝</span>
              A2A
            </span>
            <StatusPill status={run.status} busy={run.busy} />
            {run.status !== 'idle' && !run.busy && <Button onClick={fresh}>New errand</Button>}
          </div>
        </div>
      </header>

      <main className="fk-content">
        <div className="fk-status-bar fk-rise">
          <Services health={health} />
        </div>

        <div className="a2a-columns">
          <div className="fk-col fk-rise fk-rise-1">
            {/* The form draws its own panel: the send button belongs in the
                panel's footer, pinned under the fields rather than scrolling
                away with them, and only the form knows what that button says. */}
            <ErrandForm
              onRun={(input: StartA2ARunInput) => void run.start(input)}
              onCancel={() => void run.cancel()}
              busy={run.busy}
              blockedReason={blocked}
              couponsKey={couponsKey}
            />
          </div>

          <div className="fk-col fk-rise fk-rise-2">
            <Panel
              icon={<span aria-hidden>💬</span>}
              title="The negotiation"
              note={
                run.merchantTaskId ? (
                  <>
                    conversation <span className="fk-pill-mono">{run.merchantTaskId}</span>
                  </>
                ) : (
                  'Both sides of the conversation, in the order it happened'
                )
              }
              live={run.busy}
              fill="scroll"
            >
              <Transcript entries={run.entries} busy={run.busy} status={run.status} />
            </Panel>
          </div>

          <div className="fk-col fk-col-stack fk-rise fk-rise-2">
            <Panel
              icon={<span aria-hidden>💰</span>}
              title="What it came to"
              note="The wallet, from the ledger — not from the report"
            >
              <Outcome
                wallet={run.wallet}
                finalText={run.finalText}
                finalAfterError={run.finalAfterError}
                paid={run.paid}
                orderNumber={run.orderNumber}
                error={run.error}
                status={run.status}
              />
            </Panel>
          </div>
        </div>
      </main>
    </div>
  );
}
