import { useEffect, useState } from 'react';
import { Panel } from '@/components/Panel';
import type { AgentRunStatus, AgentToolCall } from '@/types';
import { toolLabel } from '@/toolLabels';

interface Props {
  toolCalls: AgentToolCall[];
  busy: boolean;
  status: AgentRunStatus | 'idle';
  browserOpen: boolean;
}

/** mm:ss — long enough for any errand, short enough to read at a glance. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${`${s}`.padStart(2, '0')}`;
}

/**
 * How long this run has been going, ticking while it does.
 *
 * Display only — nothing about the run depends on it. It exists because a
 * browser-mode errand can take a minute, and a page with no clock on it makes
 * thirty seconds feel like failure.
 */
function useElapsed(busy: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!busy) return;
    setSeconds(0);
    const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);

  return seconds;
}

/** A dot per step: running, succeeded, or refused. */
function Dot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="fk-step-dot fk-step-dot-run">•</span>;
  return (
    <span className={`fk-step-dot ${ok ? 'fk-step-dot-ok' : 'fk-step-dot-bad'}`}>
      {ok ? '✓' : '!'}
    </span>
  );
}

/**
 * What the agent did, step by step.
 *
 * A refused step is not a crash — the wallet turning down an over-budget
 * payment shows up here in red and the agent is expected to carry on. So
 * failures are rendered as part of the story rather than as an error state.
 */
export function RunTrace({ toolCalls, busy, status, browserOpen }: Props) {
  const elapsed = useElapsed(busy);
  const done = toolCalls.filter((call) => call.ok !== null).length;

  const note =
    toolCalls.length === 0
      ? 'Every step, as it happens'
      : `${done} of ${toolCalls.length} step${toolCalls.length === 1 ? '' : 's'} finished`;

  return (
    <Panel
      icon="🧭"
      title="What the agent did"
      note={note}
      live={busy}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {browserOpen && (
            <span className="fk-badge">
              <span aria-hidden>🖥️</span> Browser open
            </span>
          )}
          {(busy || elapsed > 0) && status !== 'idle' && (
            <span className="fk-pill fk-pill-mono">{clock(elapsed)}</span>
          )}
        </div>
      }
    >
      {toolCalls.length === 0 ? (
        <div className="fk-empty">
          <span className="fk-empty-art" aria-hidden>
            {busy ? '🤔' : '🛒'}
          </span>
          <p className="fk-empty-title">
            {busy ? 'Thinking about where to start…' : 'Nothing yet'}
          </p>
          <p className="fk-empty-note">
            {busy
              ? 'The first step will appear here the moment the agent takes it.'
              : 'Write an errand and send the agent — its steps land here as it takes them.'}
          </p>
        </div>
      ) : (
        <ol className="fk-trace">
          {toolCalls.map((call) => {
            const meta = toolLabel(call.name);
            const failed = call.ok === false;

            return (
              <li key={call.toolUseId} className="fk-step">
                <Dot ok={call.ok} />

                <div className="fk-step-body">
                  <div className="fk-step-title">
                    <span aria-hidden>{meta.icon}</span>
                    <span>{meta.label}</span>
                    {meta.spends && <span className="fk-badge">spends money</span>}
                  </div>

                  <div className={`fk-step-summary${failed ? ' fk-step-summary-bad' : ''}`}>
                    {call.summary ?? (
                      <span className="fk-working">
                        working
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}
