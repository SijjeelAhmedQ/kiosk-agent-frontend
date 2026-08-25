import { useCallback, useEffect, useState } from 'react';
import { AppShell, SidebarTrigger } from '@/components/AppShell';
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

  /**
   * "New errand", exactly as the header button had it.
   *
   * Same handler, same condition — it did nothing while a run was going and
   * there was nothing to clear before one had finished. What changed is that
   * the rail shows the row at all times and dims it instead of removing it,
   * because a nav item that appears and disappears makes the list jump.
   */
  const canReset = run.status !== 'idle' && !run.busy;

  return (
    <AppShell
      active="ordering"
      action={{
        onClick: newErrand,
        disabled: !canReset,
        title: canReset
          ? 'Clear the finished errand and start a new one'
          : run.busy
            ? 'An errand is running — stop it first'
            : 'The form is already clear and ready for an errand',
      }}
    >
      <div className="fk-shell">
        <header className="fk-header">
          <div className="fk-header-inner">
            {/* Friends Kitchen's own header, mark and all — this app is Friends
                Kitchen's agent, so it wears Friends Kitchen's name first and
                says what it is underneath. The console-to-console links that
                used to sit on the right are the left rail's job now; what stays
                here is branding and the state of this page's run. */}
            <div className="fk-brand">
              {/* Only real under 1024px, where the rail is a drawer. */}
              <SidebarTrigger />
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

              <RunPill status={run.status} busy={run.busy} />

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
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}
