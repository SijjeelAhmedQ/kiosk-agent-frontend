/**
 * One task, from the moment it arrived to wherever it has got to.
 *
 * A vertical spine with a node per stage, and the stage the task is *in* is the
 * only one that is lit. Stages that have not happened are absent rather than
 * greyed out — a lifecycle diagram with five future steps drawn in pale grey
 * teaches the eye to skip greys, and the single thing this component has to
 * communicate is where the task is right now.
 *
 * Every node opens. Underneath it is not a description of what happened at that
 * stage but the actual events, with their timestamps — which is what makes the
 * duration on the node a claim somebody can check rather than a number to
 * believe. A stage that took four minutes is either a slow tool or an agent that
 * sat waiting for a person, and the events are the only thing that says which.
 */

import { useState } from 'react';
import { ACTORS, stamp, type MonitorEvent } from '../../monitor';
import { millis, type Stage } from '../../ops';
import type { Conversation } from '../../monitor';

interface Props {
  run: Conversation | null;
  stages: Stage[];
  now: number;
}

const STATE_LOOK: Record<Stage['state'], { className: string; glyph: string }> = {
  done: { className: 'fko-node-done', glyph: '✓' },
  current: { className: 'fko-node-current', glyph: '◐' },
  failed: { className: 'fko-node-failed', glyph: '✕' },
};

function Node({ stage, index, now }: { stage: Stage; index: number; now: number }) {
  const [open, setOpen] = useState(false);
  const look = STATE_LOOK[stage.state];
  const meta = ACTORS[stage.actor];

  return (
    <li className={`fko-node ${look.className}`}>
      <span className="fko-node-rail" aria-hidden>
        <span className="fko-node-dot">{look.glyph}</span>
      </span>

      <div className="fko-node-body">
        <button
          type="button"
          className="fko-node-hit"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <span className="fko-node-step" aria-hidden>
            {index + 1}
          </span>

          <span className="fko-node-main">
            <span className="fko-node-label">
              {stage.label}
              {stage.state === 'current' && <span className="fko-node-live">happening now</span>}
            </span>
            <span className="fko-node-note">{stage.note}</span>
          </span>

          <span className="fko-node-who">
            <span aria-hidden>{meta.glyph}</span>
            {meta.short}
            {stage.facing && (
              <>
                <span className="fko-node-arrow" aria-hidden>
                  →
                </span>
                {ACTORS[stage.facing].short}
              </>
            )}
          </span>

          <span className="fko-node-times">
            <span className="fko-node-clock">{stamp(stage.at)}</span>
            <span className="fko-node-took">
              {stage.durationMs === null
                ? `${millis(Math.max(0, now - stage.at))} so far`
                : millis(stage.durationMs)}
            </span>
          </span>

          <span className="fko-node-caret" aria-hidden>
            {open ? '−' : '+'}
          </span>
        </button>

        {open && (
          <div className="fko-node-detail">
            <p className="fko-node-detail-head">
              {stage.events.length} {stage.events.length === 1 ? 'event' : 'events'} in this stage
            </p>
            <ol className="fko-traces">
              {stage.events.map((event: MonitorEvent) => (
                <li
                  key={event.id}
                  className={`fko-trace${event.kind === 'error' || event.ok === false ? ' fko-trace-bad' : ''}`}
                >
                  <span className="fko-trace-time">{stamp(event.at)}</span>
                  <span className="fko-trace-who">
                    <span aria-hidden>{ACTORS[event.from].glyph}</span>
                    {ACTORS[event.from].short}
                    {event.to && (
                      <>
                        <span className="fko-trace-arrow" aria-hidden>
                          →
                        </span>
                        {ACTORS[event.to].short}
                      </>
                    )}
                  </span>
                  <span className="fko-trace-text">{event.title}</span>
                  {event.toolName && <span className="fko-trace-tag">{event.toolName}</span>}
                </li>
              ))}
            </ol>
            {stage.head.detail && <pre className="fko-node-json">{stage.head.detail}</pre>}
          </div>
        )}
      </div>
    </li>
  );
}

export function Lifecycle({ run, stages, now }: Props) {
  if (!run || stages.length === 0) {
    return (
      <div className="fkm-empty">
        <span className="fkm-empty-glyph" aria-hidden>
          🧭
        </span>
        <p className="fkm-empty-title">No task to trace</p>
        <p className="fkm-empty-body">
          Pick a task above, or send one from a console. Its stages appear here as it passes
          through them — created, assigned, worked, handed over, finished — each with the events it
          was read from.
        </p>
      </div>
    );
  }

  const total = stages[stages.length - 1].at - stages[0].at;

  return (
    <div className="fko-life">
      <p className="fko-life-lead">
        <span className="fko-life-ref">{run.ref}</span>
        <span className="fko-life-sep" aria-hidden>
          ·
        </span>
        {stages.length} {stages.length === 1 ? 'stage' : 'stages'} · opened {stamp(stages[0].at)} ·{' '}
        {run.live ? `${millis(Math.max(0, now - stages[0].at))} so far` : millis(total)} end to end
      </p>

      <ol className="fko-nodes">
        {stages.map((stage, index) => (
          <Node key={`${stage.key}-${stage.at}`} stage={stage} index={index} now={now} />
        ))}
      </ol>

      {/* What has *not* happened, said once in words rather than drawn as five
          grey boxes. A task that never reached a handover should read as a task
          that did not need one, not as a task with a missing step. */}
      <p className="fko-life-foot">
        {run.live
          ? 'Still going — new stages appear here as the task reaches them.'
          : run.outcome === 'failed'
            ? 'This task ended badly. The failed stage above holds the events that say why.'
            : 'This task is finished. Nothing more will be added to it.'}
      </p>
    </div>
  );
}
