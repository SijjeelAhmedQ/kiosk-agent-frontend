/**
 * The left rail: who is on the floor, and what each of them is doing right now.
 *
 * Two facts per card, from two different places, and keeping them apart is the
 * point of the component:
 *
 *   · **Reachable** comes from the health poll — is the process answering, does
 *     it have credentials. That is the roster's question and it is answered on
 *     a 2.5-second interval whether or not anything is happening.
 *   · **Doing** comes from the event bus — the last thing this party actually
 *     said, and who it said it to. No poll can answer that, and a health check
 *     that says `idle` about an agent which has been mid-sentence for four
 *     minutes is worse than no answer at all.
 *
 * A card shows both because an operator's next move depends on which one is
 * wrong. Up and silent is a different morning from down.
 *
 * The last two cards are not agents. Friends Kitchen's API gets called and never
 * calls; the operator is a person. They are in the rail because a control centre
 * that hides the two ends of every conversation is hiding half of it — but they
 * are drawn as a separate group, with no health pill, because inventing a
 * "status" for the person reading the screen would be silly.
 */

import { ACTORS, ago, type Actor, type ActorActivity } from '../../monitor';
import type { AgentView } from '../../types';

interface Props {
  agents: AgentView[];
  activity: Record<Actor, ActorActivity>;
  now: number;
  /** Highlighting the card whose conversation is on screen to the right. */
  focus: Actor | null;
  onFocus: (actor: Actor) => void;
}

/** The health pill, in the same three channels the roster uses: dot, word, tint. */
const HEALTH: Record<AgentView['state'], { label: string; glyph: string; className: string }> = {
  working: { label: 'Working', glyph: '●', className: 'fkm-health-work' },
  idle: { label: 'Up', glyph: '○', className: 'fkm-health-idle' },
  blocked: { label: 'Not ready', glyph: '▲', className: 'fkm-health-bad' },
  offline: { label: 'Offline', glyph: '✕', className: 'fkm-health-off' },
};

/**
 * The activity light — what the bus says, not what the health poll says.
 *
 * Five states because the brief asks for five, and each one is a different
 * answer to "should I be waiting". Colour is never the only channel: every one
 * of these carries its own word beside it in the markup below.
 */
const PULSE: Record<string, { label: string; className: string }> = {
  active: { label: 'Talking', className: 'fkm-pulse-active' },
  processing: { label: 'Processing', className: 'fkm-pulse-processing' },
  waiting: { label: 'Waiting', className: 'fkm-pulse-waiting' },
  done: { label: 'Completed', className: 'fkm-pulse-done' },
  error: { label: 'Failed', className: 'fkm-pulse-error' },
};

/** The share of one card's bar each direction takes. Purely a shape, no scale. */
function share(sent: number, received: number): { out: number; back: number } {
  const total = sent + received;
  if (total === 0) return { out: 0, back: 0 };
  return { out: (sent / total) * 100, back: (received / total) * 100 };
}

function Card({
  actor,
  health,
  act,
  now,
  focused,
  onFocus,
}: {
  actor: Actor;
  health: AgentView | undefined;
  act: ActorActivity;
  now: number;
  focused: boolean;
  onFocus: (actor: Actor) => void;
}) {
  const meta = ACTORS[actor];
  const pill = health ? HEALTH[health.state] : null;
  const light = act.status ? PULSE[act.status] : null;
  const bar = share(act.sent, act.received);
  const silent = act.at === null;

  return (
    <li
      className={[
        'fkm-card',
        `fkm-card-${meta.sort}`,
        act.hot ? 'fkm-card-hot' : '',
        act.errors > 0 ? 'fkm-card-bad' : '',
        focused ? 'fkm-card-focus' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* The whole card is the control. A card that is only clickable on its
          title is a card people click three times before finding the target. */}
      <button
        type="button"
        className="fkm-card-hit"
        onClick={() => onFocus(actor)}
        aria-pressed={focused}
        aria-label={`Show ${meta.name}'s activity`}
      />

      <div className="fkm-card-top">
        <span className="fkm-card-glyph" aria-hidden>
          {meta.glyph}
          {act.hot && <span className="fkm-card-halo" />}
        </span>

        <div className="fkm-card-id">
          <p className="fkm-card-name">{meta.name}</p>
          <p className="fkm-card-role">{meta.role}</p>
        </div>

        {pill && (
          <span className={`fkm-health ${pill.className}`}>
            <span aria-hidden>{pill.glyph}</span>
            {pill.label}
          </span>
        )}
      </div>

      {/* What it is doing — the line this whole panel exists for. */}
      <div className="fkm-card-doing">
        {silent ? (
          <p className="fkm-card-quiet">Nothing heard from this one yet.</p>
        ) : (
          <>
            <p className="fkm-card-task" title={act.task ?? undefined}>
              {light && (
                <span className={`fkm-pulse ${light.className}`}>
                  <span className="fkm-pulse-dot" aria-hidden />
                  {light.label}
                </span>
              )}
              <span className="fkm-card-task-text">{act.task}</span>
            </p>
            <p className="fkm-card-facing">
              {act.facing ? (
                <>
                  <span className="fkm-card-facing-label">to</span>
                  <span className="fkm-card-facing-who">
                    <span aria-hidden>{ACTORS[act.facing].glyph}</span>
                    {ACTORS[act.facing].short}
                  </span>
                </>
              ) : (
                <span className="fkm-card-facing-label">working alone</span>
              )}
              {act.ref && <span className="fkm-card-ref">{act.ref}</span>}
              <span className="fkm-card-when">{ago(act.at!, now)}</span>
            </p>
          </>
        )}
      </div>

      {/* Sent against received, as one bar rather than two numbers. An agent
          that only ever receives is a bottleneck, and that reads off a shape
          faster than off a pair of counts. */}
      <div className="fkm-card-traffic">
        <div className="fkm-traffic-bar" aria-hidden>
          <span className="fkm-traffic-out" style={{ width: `${bar.out}%` }} />
          <span className="fkm-traffic-back" style={{ width: `${bar.back}%` }} />
        </div>
        <p className="fkm-traffic-key">
          <span className="fkm-traffic-legend fkm-traffic-legend-out">{act.sent} sent</span>
          <span className="fkm-traffic-legend fkm-traffic-legend-back">
            {act.received} received
          </span>
          {act.errors > 0 && <span className="fkm-traffic-bad">{act.errors} failed</span>}
        </p>
      </div>

      {health?.problem && <p className="fkm-card-problem">{health.problem}</p>}
    </li>
  );
}

export function AgentRail({ agents, activity, now, focus, onFocus }: Props) {
  const byId = new Map(agents.map((agent) => [agent.id as Actor, agent]));

  const workers: Actor[] = ['ordering', 'buyer', 'merchant', 'dispatcher', 'courier'];
  const ends: Actor[] = ['kitchen', 'operator'];

  return (
    <div className="fkm-rail">
      <ul className="fkm-cards">
        {workers.map((actor) => (
          <Card
            key={actor}
            actor={actor}
            health={byId.get(actor)}
            act={activity[actor]}
            now={now}
            focused={focus === actor}
            onFocus={onFocus}
          />
        ))}
      </ul>

      <p className="fkm-rail-divider">
        <span>Both ends of the wire</span>
      </p>

      <ul className="fkm-cards fkm-cards-quiet">
        {ends.map((actor) => (
          <Card
            key={actor}
            actor={actor}
            health={undefined}
            act={activity[actor]}
            now={now}
            focused={focus === actor}
            onFocus={onFocus}
          />
        ))}
      </ul>
    </div>
  );
}
