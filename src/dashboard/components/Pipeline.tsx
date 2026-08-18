/**
 * The floor, drawn — where a request comes in, who works it, how it ends.
 *
 * The one picture on this page that is about the *mechanism* rather than about
 * the numbers. Five agents across four services is a shape nobody holds in their
 * head from a list of health checks, and the shape is what makes the counts mean
 * something: 6 sitting at the handover and 0 with the dispatcher is a completely
 * different afternoon from 0 and 6, and no stat tile can tell the two apart.
 *
 * Drawn in a fixed coordinate space and scrolled sideways on a narrow screen
 * rather than scaled down. A diagram whose labels shrink until they are grey
 * fuzz has stopped being a diagram; a diagram you push with your thumb is still
 * one.
 *
 * Every node states its condition three ways — a coloured tint, a filled or
 * hollow dot, and the word itself in the second line. On the light scheme amber
 * and red are a ΔE of 1.4 apart under deuteranopia, which is to say
 * indistinguishable, so the tint is the *last* of the three channels rather than
 * the only one.
 */

import type { AgentView, Job } from '../types';
import { owner } from '../derive';

interface Props {
  agents: AgentView[];
  jobs: Job[];
}

/** A box on the diagram. `count` null draws the state word in its place. */
interface Node {
  key: string;
  x: number;
  y: number;
  w: number;
  glyph: string;
  name: string;
  sub: string;
  count: number | null;
  /** Drawn where the count would be, for the agents that cannot report one. */
  state?: string;
  tone: 'work' | 'good' | 'bad' | 'idle' | 'off';
  /** An amber line under the box's own text — work that will not move on its own. */
  gate?: string;
  href?: string;
}

const H = 66;

/**
 * The padding every box's text starts at.
 *
 * The right-hand 52px of each box is the count's, and no name or subtitle is
 * allowed into it — the widths above are all set so the longest line each box
 * can carry stops short of it. A number and a label sharing one line collide the
 * moment either grows (a two-digit count, a longer model name), and a diagram
 * that is only correct for small numbers is worse than no diagram.
 */
const PAD = 16;

/** The tint a node wears, as a pair of variables the stylesheet resolves. */
const FILL: Record<Node['tone'], string> = {
  work: 'var(--fk-amber-surface)',
  good: 'var(--fk-leaf-surface)',
  bad: 'var(--fk-flame-surface)',
  idle: 'var(--fk-surface-sunken)',
  off: 'var(--fk-surface-sunken)',
};
const EDGE: Record<Node['tone'], string> = {
  work: 'var(--fk-amber-edge)',
  good: 'var(--viz-good)',
  bad: 'var(--viz-bad)',
  idle: 'var(--fk-border)',
  off: 'var(--fk-border)',
};

/** An agent's state as the diagram wears it. */
function toneOf(agent: AgentView | undefined): Node['tone'] {
  if (!agent || agent.state === 'offline') return 'off';
  if (agent.state === 'blocked') return 'bad';
  return agent.state === 'working' ? 'work' : 'idle';
}

const WORD: Record<AgentView['state'], string> = {
  working: 'working',
  idle: 'idle',
  blocked: 'not ready',
  offline: 'offline',
};

/** A smooth elbow from one box's right edge to the next box's left edge. */
function link(x1: number, y1: number, x2: number, y2: number): string {
  const pull = Math.max(28, Math.min(90, (x2 - x1) * 0.45));
  return `M${x1} ${y1} C${x1 + pull} ${y1}, ${x2 - pull} ${y2}, ${x2} ${y2}`;
}

export function Pipeline({ agents, jobs }: Props) {
  const by = (id: AgentView['id']) => agents.find((agent) => agent.id === id);
  const ordering = by('ordering');
  const buyer = by('buyer');
  const merchant = by('merchant');
  const dispatcher = by('dispatcher');

  const live = jobs.filter((job) => !job.done);
  const atHandover = live.filter((job) => job.status === 'requested').length;
  const atDesk = live.filter((job) => owner(job) === 'dispatcher').length;
  const onRoad = live.filter((job) => owner(job) === 'rider').length;
  const waitingRider = live.filter((job) => job.awaiting === 'rider').length;
  const waitingOut = live.filter((job) => job.awaiting === 'delivery').length;
  const delivered = jobs.filter((job) => job.delivered).length;
  const lost = jobs.filter(
    (job) => job.done && !job.delivered,
  ).length;

  // The A2A pair is one box: they are two agents in one process that only ever
  // talk to each other, and two boxes with an arrow between them would take a
  // third of the diagram to say something no operator acts on.
  const a2aTone = toneOf(buyer && merchant && buyer.state === 'working' ? buyer : (merchant ?? buyer));

  const nodes: Node[] = [
    {
      key: 'ordering',
      x: 12,
      y: 34,
      w: 196,
      glyph: '🤖',
      name: 'Ordering agent',
      sub: '8100 · errand runner',
      count: null,
      state: ordering ? WORD[ordering.state] : 'offline',
      tone: toneOf(ordering),
      href: '/',
    },
    {
      key: 'a2a',
      x: 12,
      y: 132,
      w: 196,
      glyph: '🤝',
      name: 'A2A desk',
      sub: '8101 · buyer + merchant',
      count: null,
      state: merchant ? WORD[merchant.state] : 'offline',
      tone: a2aTone,
      href: '/a2a.html',
    },
    {
      key: 'handover',
      x: 250,
      y: 83,
      w: 150,
      glyph: '📨',
      name: 'Handover',
      sub: 'not yet judged',
      count: atHandover,
      tone: atHandover > 0 ? 'work' : 'idle',
    },
    {
      key: 'dispatcher',
      x: 442,
      y: 83,
      w: 178,
      glyph: '🛵',
      name: 'Dispatcher',
      sub: `8103 · ${dispatcher ? WORD[dispatcher.state] : 'offline'}`,
      count: atDesk,
      tone: toneOf(dispatcher),
      gate: waitingRider > 0 ? `${waitingRider} waiting on you` : undefined,
      href: '/foodpanda.html',
    },
    {
      key: 'rider',
      x: 662,
      y: 34,
      w: 160,
      glyph: '🏍️',
      name: 'On the road',
      sub: 'collected / riding',
      count: onRoad,
      tone: onRoad > 0 ? 'work' : 'idle',
      gate: waitingOut > 0 ? `${waitingOut} waiting on you` : undefined,
    },
    {
      key: 'doorstep',
      x: 856,
      y: 34,
      w: 160,
      glyph: '🏠',
      name: 'Delivered',
      sub: 'with the customer',
      count: delivered,
      tone: delivered > 0 ? 'good' : 'idle',
    },
    {
      key: 'lost',
      x: 856,
      y: 132,
      w: 160,
      glyph: '⊘',
      name: 'Not delivered',
      sub: 'refused or failed',
      count: lost,
      tone: lost > 0 ? 'bad' : 'idle',
    },
  ];

  /** An edge is "flowing" when there is work on the far side of it to move. */
  const edges: { d: string; flowing: boolean }[] = [
    { d: link(208, 67, 246, 100), flowing: ordering?.state === 'working' },
    { d: link(208, 165, 246, 132), flowing: merchant?.state === 'working' },
    { d: link(400, 116, 438, 116), flowing: atHandover > 0 },
    { d: link(620, 104, 658, 67), flowing: onRoad > 0 },
    { d: link(822, 67, 852, 67), flowing: onRoad > 0 },
    { d: link(620, 128, 852, 165), flowing: false },
  ];

  return (
    <div className="fkd-flow">
      <div className="fkd-flow-scroll">
        <svg viewBox="0 0 1028 210" className="fkd-flow-svg" role="img"
          aria-label="How a request moves: the ordering agent and the A2A desk hand a paid order over, the dispatcher decides, a rider carries it, and it is either delivered or not.">
          <defs>
            <marker id="fkd-arrow" viewBox="0 0 8 8" refX="6.5" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0.5 L7 4 L0 7.5 z" fill="var(--fk-text-faint)" />
            </marker>
          </defs>

          {/* The three questions this page answers, written on the diagram
              itself rather than left for the reader to infer from the layout. */}
          <text x={12} y={16} className="fkd-flow-lane">Requests arrive</text>
          <text x={250} y={16} className="fkd-flow-lane">Worked</text>
          <text x={856} y={16} className="fkd-flow-lane">Results</text>

          {edges.map((edge, index) => (
            <g key={index}>
              <path d={edge.d} className="fkd-flow-edge" markerEnd="url(#fkd-arrow)" />
              {/* The moving dash is the only animation on this page, and it runs
                  only where work is actually crossing. An always-on shimmer is
                  decoration; one that starts and stops is a status light. */}
              {edge.flowing && <path d={edge.d} className="fkd-flow-edge-live" />}
            </g>
          ))}

          {nodes.map((node) => {
            const box = (
              <g>
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.w}
                  height={H}
                  rx={18}
                  fill={FILL[node.tone]}
                  stroke={EDGE[node.tone]}
                  strokeWidth={1}
                />

                {/* Channel two: a filled dot for live, a hollow ring for not —
                    a difference that survives being printed in grey. */}
                <circle
                  cx={node.x + PAD}
                  cy={node.y + 20}
                  r={4}
                  fill={node.tone === 'idle' || node.tone === 'off' ? 'none' : EDGE[node.tone]}
                  stroke={EDGE[node.tone] === 'var(--fk-border)' ? 'var(--fk-text-faint)' : EDGE[node.tone]}
                  strokeWidth={1.5}
                />

                <text x={node.x + PAD + 12} y={node.y + 25} className="fkd-flow-glyph">
                  {node.glyph}
                </text>
                <text x={node.x + PAD + 32} y={node.y + 25} className="fkd-flow-name">
                  {node.name}
                </text>
                <text x={node.x + PAD} y={node.y + 43} className="fkd-flow-sub">
                  {node.sub}
                </text>

                {/* Below the reserved column rather than beside it: the gate is
                    the longest line a box ever carries and it is allowed the
                    full width, because the count above it has already ended. */}
                {node.gate && (
                  <text x={node.x + PAD} y={node.y + 58} className="fkd-flow-gate">
                    ⏸ {node.gate}
                  </text>
                )}

                {node.count !== null ? (
                  <text
                    x={node.x + node.w - 14}
                    y={node.y + 46}
                    className="fkd-flow-count"
                    textAnchor="end"
                  >
                    {node.count}
                  </text>
                ) : (
                  <text
                    x={node.x + node.w - 14}
                    y={node.y + 44}
                    className="fkd-flow-state"
                    textAnchor="end"
                  >
                    {node.state}
                  </text>
                )}
              </g>
            );

            // The agents are links to the console that drives them; the stages
            // are not, because there is nothing on the other side of a stage.
            return node.href ? (
              <a key={node.key} href={node.href} className="fkd-flow-link">
                <title>{`Open the ${node.name} console`}</title>
                {box}
              </a>
            ) : (
              <g key={node.key}>{box}</g>
            );
          })}
        </svg>
      </div>

      {/* Channel three, and the one that needs no colour vision at all. */}
      <ul className="fkd-key">
        <li><span className="fkd-key-swatch fkd-key-work" aria-hidden />Working — something is moving</li>
        <li><span className="fkd-key-swatch fkd-key-idle" aria-hidden />Idle — up, nothing to do</li>
        <li><span className="fkd-key-swatch fkd-key-bad" aria-hidden />Not ready or offline</li>
        <li><span className="fkd-key-swatch fkd-key-good" aria-hidden />Delivered</li>
        <li className="fkd-key-note">⏸ marks work that stops until somebody asks for the next step.</li>
      </ul>
    </div>
  );
}
