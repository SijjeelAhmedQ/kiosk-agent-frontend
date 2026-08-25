import { useCallback, useEffect, useState } from 'react';
import { AppShell, SidebarTrigger } from '@/components/AppShell';
import { Panel } from '@/components/Panel';
import { a2aApi } from './api';
import { ErrandForm } from './components/ErrandForm';
import { Outcome } from './components/Outcome';
import { Transcript } from './components/Transcript';
import { useNegotiation } from './useNegotiation';
import type { A2AHealth, DeliveryHealth, StartA2ARunInput } from './types';

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
function Services({
  health,
  delivery,
}: {
  health: A2AHealth | null;
  delivery: DeliveryHealth | null;
}) {
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

      {/* The third service. A paid take-away order is handed straight to it, so
          "there is no courier" is worth knowing before the money moves rather
          than from a tool result afterwards. It gates nothing — a negotiation
          runs and pays either way, and the A2A service is explicit that a failed
          handover leaves a bought order without a rider. */}
      <span
        className="fk-status"
        title={
          delivery
            ? (delivery.dispatcher.problem ??
              `${delivery.activeJobs} job${delivery.activeJobs === 1 ? '' : 's'} on the board`)
            : 'The delivery agent is not answering on port 8103. A paid order would have no rider.'
        }
      >
        <span
          className={`fk-dot ${
            delivery?.dispatcher.ready ? 'fk-dot-ok' : delivery ? 'fk-dot-busy' : 'fk-dot-bad'
          }`}
          aria-hidden
        />
        Delivery
        <span className="fk-pill-mono">{delivery?.service ?? 'offline'}</span>
      </span>
    </div>
  );
}

export default function App() {
  const run = useNegotiation();
  const [health, setHealth] = useState<A2AHealth | null>(null);
  const [delivery, setDelivery] = useState<DeliveryHealth | null>(null);
  const [couponsKey, setCouponsKey] = useState(0);

  // Two services, asked at once: neither answer depends on the other and the
  // strip has nothing useful to say until it has both.
  const refreshHealth = useCallback(async () => {
    const [a2a, courier] = await Promise.all([a2aApi.health(), a2aApi.deliveryHealth()]);
    setHealth(a2a);
    setDelivery(courier);
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

  // Same handler and the same condition the header's "New errand" button used.
  const canReset = run.status !== 'idle' && !run.busy;

  return (
    <AppShell
      active="a2a"
      action={{
        onClick: fresh,
        disabled: !canReset,
        title: canReset
          ? 'Clear the settled negotiation and start a new one'
          : run.busy
            ? 'A negotiation is running — stop it first'
            : 'The form is already clear and ready for an errand',
      }}
    >
      <div className="fk-shell">
        <header className="fk-header">
          <div className="fk-header-inner">
            {/* Branding and this page's own state stay here; the way across to
                the other consoles is the left rail's job now. */}
            <div className="fk-brand">
              <SidebarTrigger />
              <img className="fk-mark" src="/logo.png" alt="" width={44} height={44} aria-hidden />
              <div style={{ minWidth: 0 }}>
                <h1 className="fk-brand-name">Friends Kitchen</h1>
                <div className="fk-brand-sub">
                  Agent to agent — a buyer with a wallet, a restaurant with a menu
                </div>
              </div>
            </div>

            <div className="fk-header-actions">
              <span className="fk-tag">
                <span aria-hidden>🤝</span>
                A2A
              </span>
              <StatusPill status={run.status} busy={run.busy} />
            </div>
          </div>
        </header>

        <main className="fk-content">
          <div className="fk-status-bar fk-rise">
            <Services health={health} delivery={delivery} />
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
                // The courier and the address it would deliver to, so "Where it
                // goes" can name both. Null from a service that is not answering,
                // and undefined from one too old to report an address — the form
                // reads either as "there is nothing on file" rather than guessing.
                delivery={delivery}
                savedAddress={health?.customer ?? null}
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
              {/* The only card in this column now that the delivery panel is gone,
                  so it takes the column's height rather than sitting as a short
                  card over empty paper. `scroll`, because a long report is the one
                  thing in it that can outgrow the viewport. */}
              <Panel
                icon={<span aria-hidden>💰</span>}
                title="What it came to"
                note="The wallet, from the ledger — not from the report"
                fill="scroll"
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
    </AppShell>
  );
}
