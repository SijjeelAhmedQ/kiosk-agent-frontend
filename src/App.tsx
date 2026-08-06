import { useCallback, useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
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

export default function App({ scheme, onToggleScheme }: Props) {
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

  // What is stopping a run, said plainly. The form puts this under the button,
  // so a disabled control always carries its own explanation.
  const blockedReason: string | null = !health
    ? 'The agent service is not running on port 8100.'
    : !health.hasApiKey
      ? // The server knows which provider is configured and what it is missing,
        // so it words this — the UI shouldn't assume Anthropic.
        (health.credentialProblem ?? 'The agent has no usable model credentials.')
      : !health.restaurantApi
        ? 'Friends Kitchen is not answering on port 8000 — start the kiosk backend.'
        : null;

  const dark = scheme === 'dark';

  return (
    <div className="fk-shell">
      <div className="fk-aura" aria-hidden />

      <header className="fk-header">
        <div className="fk-header-inner">
          <div className="fk-brand">
            <span className="fk-mark" aria-hidden>
              🤖
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="fk-brand-name">Ordering agent</h1>
              <div className="fk-brand-sub">
                Send it to Friends Kitchen with a coupon and a limit
              </div>
            </div>
          </div>

          <div className="fk-header-actions">
            <RunPill status={run.status} busy={run.busy} />

            {run.status !== 'idle' && !run.busy && (
              <Button onClick={run.reset}>New errand</Button>
            )}

            <Tooltip title={dark ? 'Switch to light' : 'Switch to dark'}>
              <button
                type="button"
                className="fk-icon-btn"
                onClick={onToggleScheme}
                aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              >
                {dark ? '☀️' : '🌙'}
              </button>
            </Tooltip>
          </div>
        </div>
      </header>

      <main className="fk-content">
        <div className="fk-rise" style={{ marginBottom: 18 }}>
          <ServiceStatus health={health} checking={checking} />
        </div>

        <div className="fk-columns">
          <div className="fk-col-sticky fk-rise fk-rise-1">
            <ErrandForm
              onRun={start}
              onCancel={() => void run.cancel()}
              busy={run.busy}
              blockedReason={blockedReason}
            />
          </div>

          <div className="fk-col-stack fk-rise fk-rise-2">
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
  );
}
