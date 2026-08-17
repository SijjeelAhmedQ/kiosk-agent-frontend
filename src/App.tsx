import { useCallback, useEffect, useState } from 'react';
import { Button } from 'antd';
import { DeliveryTrack } from '@/components/DeliveryTrack';
import { ErrandForm } from '@/components/ErrandForm';
import { RunReport } from '@/components/RunReport';
import { RunTrace } from '@/components/RunTrace';
import { ServiceStatus } from '@/components/ServiceStatus';
import { useAgentRun } from '@/hooks/useAgentRun';
import { agentApi } from '@/services/agentApi';
import type { AgentHealth, StartAgentRunInput } from '@/types';
import type { ColorScheme } from '@/theme';

interface Props {
  scheme: ColorScheme;
  onToggleScheme: () => void;
}

/** The run's state as one pill in the header — the thing you glance at. */
function RunPill({ status, busy }: { status: string; busy: boolean }) {
  if (status === 'idle') return null;

  const [dot, label] = busy
    ? ['fk-dot-busy fk-dot-live', status === 'queued' ? 'Waiting its turn' : 'On an errand']
    : status === 'done'
      ? ['fk-dot-ok', 'Errand done']
      : status === 'cancelled'
        ? ['fk-dot', 'Stopped']
        : ['fk-dot-bad', 'Errand failed'];

  return (
    <span className="fk-pill">
      <span className={`fk-dot ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

// The scheme toggle is parked — see the commented block in the header below.
// Its props stay on `Props` so main.tsx keeps supplying them, and bringing the
// button back is uncommenting that block plus the two bindings it names.
export default function App(_props: Props) {
  const run = useAgentRun();
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [checking, setChecking] = useState(true);

  const refreshHealth = useCallback(async () => {
    setHealth(await agentApi.health());
    setChecking(false);
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  // Re-check when a run settles: that is exactly when "is it busy" changes, and
  // when a service that died mid-run should stop being reported as healthy.
  useEffect(() => {
    if (!run.busy) void refreshHealth();
  }, [run.busy, refreshHealth]);

  const start = (input: StartAgentRunInput) => void run.start(input);

  /**
   * Clearing the last errand also re-reads the coupons.
   *
   * The errand that just finished may have spent the coupon it carried, and the
   * picker was filled when the page loaded — so the moment the operator asks for
   * a fresh errand is the moment to go and find out what is still spendable.
   */
  const [couponsRefreshKey, setCouponsRefreshKey] = useState(0);

  const newErrand = () => {
    run.reset();
    setCouponsRefreshKey((key) => key + 1);
  };

  // What is stopping a run, said plainly. The form puts this under the button,
  // so a disabled control always carries its own explanation.
  const blockedReason: string | null = !health
    ? 'The agent service is not running on port 8100.'
    : !health.hasApiKey
      ? // The server knows which provider is configured and what it is missing,
        // so it words this — the UI shouldn't assume Anthropic.
        (health.credentialProblem ?? 'The agent has no usable model credentials.')
      : !health.restaurantApi
        ? 'Friends Kitchen is not answering on port 8000 — start the Friends Kitchen backend.'
        : null;

  return (
    <div className="fk-shell">
      <header className="fk-header">
        <div className="fk-header-inner">
          {/* Friends Kitchen's own header, mark and all — this app is Friends
              Kitchen's agent, so it wears Friends Kitchen's name first and
              says what it is underneath. */}
          <div className="fk-brand">
            <img
              className="fk-mark"
              src="/logo.png"
              alt=""
              width={44}
              height={44}
              aria-hidden
            />
            <div style={{ minWidth: 0 }}>
              <h1 className="fk-brand-name">Friends Kitchen</h1>
              <div className="fk-brand-sub">
                Ordering agent — send it out with a coupon and a limit
              </div>
            </div>
          </div>

          <div className="fk-header-actions">
            {/* The capsule the Friends Kitchen header carries on the right, saying which
                of the family's screens you are on. */}
            <span className="fk-tag">
              <span aria-hidden>🤖</span>
              AI agent
            </span>

            {/* The way over to the A2A console. It is a second Vite entry, not a
                route in this app, so a plain href is the whole of it — a full
                page load is what we want anyway, since the other console talks
                to a different service and starts from a clean slate. */}
            <a className="fk-nav-link" href="/a2a.html" title="Open the A2A ordering console">
              <span aria-hidden>🤝</span>
              <span className="fk-nav-link-label">A2A ordering</span>
              <span className="fk-nav-link-arrow" aria-hidden>
                →
              </span>
            </a>

            {/* And over to the delivery agent's own board — the other half of
                `order → deliver`, run by a different agent on a different port. */}
            <a
              className="fk-nav-link"
              href="/foodpanda.html"
              title="Open the delivery agent's board"
            >
              <span aria-hidden>🛵</span>
              <span className="fk-nav-link-label">Delivery</span>
              <span className="fk-nav-link-arrow" aria-hidden>
                →
              </span>
            </a>

            <RunPill status={run.status} busy={run.busy} />

            {run.status !== 'idle' && !run.busy && (
              <Button onClick={newErrand}>New errand</Button>
            )}

            {/* Needs `Tooltip` back in the antd import, and these two bindings
                back at the top: `const { scheme, onToggleScheme } = _props`
                and `const dark = scheme === 'dark'`.
            <Tooltip title={dark ? 'Switch to light' : 'Switch to dark'}>
              <button
                type="button"
                className="fk-icon-btn"
                onClick={onToggleScheme}
                aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {dark ? '☀️' : '🌙'}
              </button>
            </Tooltip> */}
          </div>
        </div>
      </header>

      <main className="fk-content">
        <div className="fk-status-bar fk-rise">
          <ServiceStatus health={health} checking={checking} />
        </div>

        <div className="fk-columns">
          <div className="fk-col fk-rise fk-rise-1">
            <ErrandForm
              onRun={start}
              onCancel={() => void run.cancel()}
              busy={run.busy}
              blockedReason={blockedReason}
              couponsRefreshKey={couponsRefreshKey}
              delivery={health?.delivery}
              // Undefined from an agent server too old to report one, which the
              // form reads as "there is no saved address" rather than guessing.
              savedAddress={health?.customer ?? null}
            />
          </div>

          <div className="fk-col fk-col-stack fk-rise fk-rise-2">
            <RunTrace
              toolCalls={run.toolCalls}
              busy={run.busy}
              status={run.status}
              browserOpen={run.browserOpen}
            />
            <RunReport
              status={run.status}
              narration={run.narration}
              finalText={run.finalText}
              wallet={run.wallet}
              error={run.error}
            />
            {/* Under the report, not inside it. The report answers "what did
                this cost", which is settled the moment payment goes through;
                this answers "where is the food", which is still moving after
                the agent has stopped talking. Folded together, a paid order
                would look complete. Absent entirely on a counter order. */}
            <DeliveryTrack
              context={run.delivery}
              job={run.deliveryJob}
              busy={run.busy}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
