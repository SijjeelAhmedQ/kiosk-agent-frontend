import { useEffect, useRef } from 'react';
import { StatusPill } from './StatusPill';
import { toolLabel } from '../toolLabels';
import type { LogRow } from '../types';

/**
 * What the dispatcher did, in the order it did it.
 *
 * This is the panel that makes the difference between "a delivery service" and
 * "a delivery *agent*" visible. The statuses would look the same either way; the
 * tool calls and the sentences between them are the agent thinking, and putting
 * them on the screen is what lets somebody check that the refusal was reasoned
 * rather than random.
 *
 * Interleaved deliberately. A tool strip above a status entry means the status
 * came *from* those calls, which is the causal story, and separating the two
 * into their own panels would leave the reader to reconstruct it.
 */

interface Props {
  rows: LogRow[];
  live: boolean;
}

function Tick({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className="fp-tool-dot fp-tool-dot-run" aria-hidden />;
  return (
    <span className={`fp-tool-dot ${ok ? 'fp-tool-dot-ok' : 'fp-tool-dot-bad'}`} aria-hidden />
  );
}

export function DispatcherLog({ rows, live }: Props) {
  const foot = useRef<HTMLDivElement>(null);

  // Follow the job as it happens. `block: 'nearest'` so the whole page does not
  // jump when the log is already the thing being looked at.
  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <div className="fk-empty">
        <div className="fk-empty-art" aria-hidden>
          🧠
        </div>
        <p className="fk-empty-title">No dispatcher yet</p>
        <p className="fk-empty-note">
          Pick a job on the left and you will see the agent read it, decide on it,
          and run it — every tool call, as it happens.
        </p>
      </div>
    );
  }

  return (
    <div className="fp-log">
      {rows.map((row, index) => {
        switch (row.kind) {
          case 'tools':
            return (
              <ul className="fp-tools" key={`t${index}`}>
                {row.calls.map((call) => (
                  <li key={call.toolUseId} className={call.ok === false ? 'fp-tool-failed' : ''}>
                    <Tick ok={call.ok} />
                    <span className="fp-tool-name">{toolLabel(call.name)}</span>
                    {/* Only failures explain themselves. A successful call's
                        summary repeats what the status entry underneath already
                        says, and printing both trains the eye to skip the row. */}
                    {call.ok === false && call.summary && (
                      <span className="fp-tool-why">{call.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
            );

          case 'step':
            return (
              <div className="fp-entry" key={`s${index}`}>
                <div className="fp-entry-head">
                  <StatusPill status={row.step.status} />
                  <span className="fp-entry-clock">+{row.step.elapsedSeconds.toFixed(1)}s</span>
                </div>
                <p className="fp-entry-said">{row.step.message}</p>
              </div>
            );

          case 'waiting':
            // Two rows in one shape, because they are two halves of one fact:
            // the dispatcher stopped for a person, and then a person answered.
            // Drawn as neither a status nor a tool call, since nothing about the
            // delivery moved either time.
            return (
              <div
                className={`fp-hold${row.step === null ? ' fp-hold-freed' : ''}`}
                key={`w${index}`}
              >
                <span className="fp-hold-mark" aria-hidden>
                  {row.step === null ? '▶' : '⏸'}
                </span>
                <p className="fp-hold-text">{row.message}</p>
              </div>
            );

          case 'said':
            return (
              <div className="fp-report" key={`r${index}`}>
                <span className="fp-report-who">Dispatcher</span>
                <p className="fp-report-text">{row.text}</p>
              </div>
            );

          case 'error':
            return (
              <div className="fp-fault" key={`e${index}`}>
                {row.message}
              </div>
            );
        }
      })}

      {live && (
        <div className="fp-thinking">
          <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
          working
        </div>
      )}

      <div ref={foot} />
    </div>
  );
}
