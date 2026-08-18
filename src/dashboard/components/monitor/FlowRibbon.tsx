/**
 * The path one request actually took, drawn as the chain of parties it reached.
 *
 * Distinct from "How a request moves" further down the page, and the difference
 * is the whole reason both exist. That diagram is the *map*: every agent on the
 * floor, always in the same place, whether or not anything is happening. This is
 * the *route*: the parties this particular errand touched, in the order it
 * touched them, with the hop that is live right now lit up.
 *
 * A map tells you where things are. A route tells you where this one went — and
 * on a floor where an order can go through the A2A desk or the ordering agent,
 * reach the restaurant's API or a browser, and end with a courier or with
 * nobody, the route is the thing that differs run to run.
 *
 * Built from first appearance rather than from a hardcoded order. Two
 * consequences worth having: a run that never reached the courier simply has no
 * courier station, and an agent added to this floor next year shows up in the
 * chain without this file changing.
 */

import { ACTORS, ago, type Actor, type Conversation, type MonitorEvent } from '../../monitor';

interface Props {
  run: Conversation | null;
  now: number;
}

/** One party on the route, and how it is doing. */
interface Station {
  actor: Actor;
  /** Events this party sent or received in this run. */
  touches: number;
  lastAt: number;
  errors: number;
}

/** The stretch between two neighbouring stations. */
interface Hop {
  /** Events that crossed between this pair, either way. */
  count: number;
  lastAt: number;
  hot: boolean;
  failed: boolean;
}

/** How recently a hop must have carried something to be drawn as live, in ms. */
const HOT_MS = 12_000;

function route(events: MonitorEvent[], now: number): { stations: Station[]; hops: Hop[] } {
  const order: Actor[] = [];
  const seen = new Map<Actor, Station>();

  const touch = (actor: Actor, at: number, bad: boolean) => {
    let station = seen.get(actor);
    if (!station) {
      station = { actor, touches: 0, lastAt: at, errors: 0 };
      seen.set(actor, station);
      order.push(actor);
    }
    station.touches += 1;
    station.lastAt = Math.max(station.lastAt, at);
    if (bad) station.errors += 1;
  };

  for (const event of events) {
    const bad = event.kind === 'error' || event.ok === false;
    touch(event.from, event.at, bad);
    if (event.to) touch(event.to, event.at, bad);
  }

  const stations = order.map((actor) => seen.get(actor)!);

  // A hop belongs to the pair of stations it sits between, in either direction:
  // the merchant answering the buyer travels the same wire as the buyer asking,
  // and drawing two segments for one conversation would double the chain.
  const hops: Hop[] = [];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const a = stations[index].actor;
    const b = stations[index + 1].actor;
    const between = events.filter(
      (event) =>
        (event.from === a && event.to === b) || (event.from === b && event.to === a),
    );
    const lastAt = between.reduce((latest, event) => Math.max(latest, event.at), 0);
    hops.push({
      count: between.length,
      lastAt,
      hot: lastAt > 0 && now - lastAt < HOT_MS,
      failed: between.some((event) => event.kind === 'error' || event.ok === false),
    });
  }

  return { stations, hops };
}

export function FlowRibbon({ run, now }: Props) {
  if (!run) {
    return (
      <div className="fkm-ribbon fkm-ribbon-empty">
        <p className="fkm-empty-line">
          No route to draw yet — this fills in the moment an agent talks to another one.
        </p>
      </div>
    );
  }

  const { stations, hops } = route(run.events, now);

  return (
    <div className="fkm-ribbon">
      <div className="fkm-ribbon-head">
        <span className={`fkm-run-dot${run.live ? ' fkm-run-dot-live' : ''}`} aria-hidden />
        <span className="fkm-ribbon-ref">{run.ref}</span>
        <span className="fkm-ribbon-sep" aria-hidden>
          ·
        </span>
        <span className="fkm-ribbon-sub">
          {stations.length} {stations.length === 1 ? 'party' : 'parties'} · {run.events.length}{' '}
          events · last {ago(run.lastAt, now)}
        </span>
      </div>

      {/* Scrolled sideways rather than wrapped: a route is a sequence, and a
          chain that wraps onto a second line stops reading as one. */}
      <div className="fkm-ribbon-scroll">
        <ol className="fkm-chain" aria-label={`Route taken by ${run.ref}`}>
          {stations.map((station, index) => {
            const meta = ACTORS[station.actor];
            const live = now - station.lastAt < HOT_MS && run.live;
            const hop = hops[index - 1];

            return (
              <li key={station.actor} className="fkm-chain-item">
                {index > 0 && hop && (
                  <span
                    className={[
                      'fkm-hop',
                      hop.hot ? 'fkm-hop-hot' : '',
                      hop.failed ? 'fkm-hop-bad' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden
                  >
                    <span className="fkm-hop-line">
                      <span className="fkm-hop-pulse" />
                    </span>
                    <span className="fkm-hop-count">{hop.count}</span>
                    <span className="fkm-hop-arrow">›</span>
                  </span>
                )}

                <span
                  className={[
                    'fkm-station',
                    `fkm-station-${meta.sort}`,
                    live ? 'fkm-station-live' : '',
                    station.errors > 0 ? 'fkm-station-bad' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={`${meta.name} — ${meta.role}`}
                >
                  <span className="fkm-station-glyph" aria-hidden>
                    {meta.glyph}
                  </span>
                  <span className="fkm-station-text">
                    <span className="fkm-station-name">{meta.short}</span>
                    <span className="fkm-station-note">
                      {station.errors > 0
                        ? `${station.errors} failed`
                        : `${station.touches} events`}
                    </span>
                  </span>
                  {live && <span className="fkm-station-ring" aria-hidden />}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
