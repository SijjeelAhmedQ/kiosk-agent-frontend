/**
 * The five workers, each with what it is and what it has been doing.
 *
 * The card answers three questions in the order people ask them: *is it up*
 * (the state pill), *what is it for* (the role line), *has it been earning its
 * keep* (the strip). The third is the one nothing else on this floor can
 * answer — no service keeps a record of its own busyness — so it is drawn from
 * what this page has watched since it was opened, and it says so.
 */

import { strip, utilisation } from '../derive';
import { SAMPLES_KEPT } from '../useFleet';
import type { AgentState, AgentView, Sample } from '../types';

/**
 * A state's shape on the strip, as a share of the track's height.
 *
 * Height is the primary channel here and colour is the reinforcement, not the
 * other way round. These cells are two pixels wide — far too small for a hue to
 * be read reliably by anyone, and hopeless for a reader who cannot separate
 * amber from red — so the four states are ordered by how much of the track they
 * fill: working fills it, offline flatlines along the bottom, and the two
 * in-between states sit in between. The strip is legible in greyscale.
 */
const SHAPE: Record<AgentState, { height: number; fill: string }> = {
  working: { height: 1, fill: 'var(--viz-work)' },
  blocked: { height: 0.62, fill: 'var(--viz-bad)' },
  idle: { height: 0.28, fill: 'var(--viz-idle-wash)' },
  offline: { height: 0.12, fill: 'var(--viz-bad)' },
};

const PILL: Record<AgentState, { label: string; glyph: string; className: string }> = {
  working: { label: 'Working', glyph: '●', className: 'fkd-state-work' },
  idle: { label: 'Idle', glyph: '○', className: 'fkd-state-idle' },
  blocked: { label: 'Not ready', glyph: '▲', className: 'fkd-state-bad' },
  offline: { label: 'Offline', glyph: '✕', className: 'fkd-state-off' },
};

/**
 * The last few minutes of one agent, oldest on the left.
 *
 * `preserveAspectRatio="none"` is safe here and nowhere else on this page: the
 * strip holds no text and no round marks, only rectangles whose meaning is their
 * height, so stretching it horizontally to whatever width the card has costs
 * nothing.
 */
function Strip({ samples, agent }: { samples: Sample[]; agent: AgentView }) {
  const cells = strip(samples, agent.id, SAMPLES_KEPT);
  const share = utilisation(samples, agent.id);
  const seen = samples.length;

  return (
    <div className="fkd-strip-wrap">
      <svg
        className="fkd-strip"
        viewBox={`0 0 ${SAMPLES_KEPT} 20`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          share === null
            ? `No activity recorded for ${agent.name} yet.`
            : `${agent.name} was working ${Math.round(share * 100)} percent of the last ${Math.round((seen * 2.5) / 60)} minutes.`
        }
      >
        <rect x={0} y={0} width={SAMPLES_KEPT} height={20} fill="var(--viz-track)" rx={0} />
        {cells.map((state, index) =>
          state === null ? null : (
            <rect
              key={index}
              x={index}
              y={20 - SHAPE[state].height * 20}
              width={1}
              height={SHAPE[state].height * 20}
              fill={SHAPE[state].fill}
            />
          ),
        )}
      </svg>

      <div className="fkd-strip-foot">
        <span>
          {share === null
            ? 'watching…'
            : `working ${Math.round(share * 100)}% of the last ${Math.max(1, Math.round((seen * 2.5) / 60))} min`}
        </span>
        <span className="fkd-strip-hint">since this page opened</span>
      </div>
    </div>
  );
}

export function AgentRoster({ agents, samples }: { agents: AgentView[]; samples: Sample[] }) {
  return (
    <ul className="fkd-roster">
      {agents.map((agent) => {
        const pill = PILL[agent.state];
        return (
          <li key={agent.id} className={`fkd-agent fkd-agent-${agent.state}`}>
            <div className="fkd-agent-top">
              <span className="fkd-agent-glyph" aria-hidden>
                {agent.glyph}
              </span>
              <div style={{ minWidth: 0 }}>
                <a className="fkd-agent-name" href={agent.href}>
                  {agent.name}
                </a>
                <p className="fkd-agent-role">{agent.role}</p>
              </div>
              {/* Glyph and word together, always. Four states in three colours
                  is not a distinction anybody should have to make by hue. */}
              <span className={`fkd-state ${pill.className}`}>
                <span aria-hidden>{pill.glyph}</span>
                {pill.label}
              </span>
            </div>

            <div className="fkd-agent-meta">
              <span className="fk-pill-mono">:{agent.port}</span>
              {agent.brain && <span className="fk-pill-mono">{agent.brain}</span>}
              {agent.holding !== null && (
                <span className="fkd-agent-holding">
                  <strong>{agent.holding}</strong> in hand
                </span>
              )}
            </div>

            {agent.problem && <p className="fkd-agent-problem">{agent.problem}</p>}

            <Strip samples={samples} agent={agent} />

            <p className="fkd-agent-note">{agent.holdingNote}</p>
          </li>
        );
      })}
    </ul>
  );
}
