/**
 * The five numbers the floor is judged on, before any chart.
 *
 * A stat tile rather than a chart wherever the answer is one number — a
 * single-bar bar chart is a number wearing a costume. The lead tile is the one
 * hero figure on the page: what is live *right now*, set large, because that is
 * the number somebody glances at from across a desk and everything else here is
 * context for it.
 *
 * Every tile that can be unknown says so with an em dash rather than a zero.
 * "No delivery has finished yet" and "deliveries are taking no time at all" are
 * different facts and they must not share a rendering.
 */

import { Meter, Sparkline } from './Charts';
import { humanDuration } from '../derive';
import type { Kpis } from '../derive';
import type { Point } from '../types';

interface Props {
  kpis: Kpis;
  arrivals: Point[];
  /** What the range is called, so every tile can say what it counted. */
  rangeLabel: string;
}

export function KpiRow({ kpis, arrivals, rangeLabel }: Props) {
  const rate = kpis.successRate;

  return (
    <div className="fkd-kpis">
      <article className="fkd-kpi fkd-kpi-hero">
        <p className="fkd-kpi-label">Live right now</p>
        <p className="fkd-hero">{kpis.inFlight}</p>
        <p className="fkd-kpi-foot">
          {kpis.inFlight === 1 ? 'delivery on the floor' : 'deliveries on the floor'}
          {kpis.waiting > 0 && (
            <>
              {' · '}
              <span className="fkd-kpi-alert">⏸ {kpis.waiting} waiting on you</span>
            </>
          )}
        </p>
        <Sparkline points={arrivals} />
        <p className="fkd-kpi-hint">Arrivals across {rangeLabel.toLowerCase()}</p>
      </article>

      <article className="fkd-kpi">
        <p className="fkd-kpi-label">Requests taken in</p>
        <p className="fkd-kpi-value">{kpis.takenIn}</p>
        <p className="fkd-kpi-foot">handed over in {rangeLabel.toLowerCase()}</p>
      </article>

      <article className="fkd-kpi">
        <p className="fkd-kpi-label">Delivered</p>
        <p className="fkd-kpi-value">{kpis.delivered}</p>
        <Meter ratio={rate} tone="good" label="Share of settled jobs that were delivered" />
        <p className="fkd-kpi-foot">
          {rate === null
            ? 'nothing has settled yet'
            : `${Math.round(rate * 100)}% of ${kpis.settled} settled`}
        </p>
      </article>

      <article className="fkd-kpi">
        <p className="fkd-kpi-label">To the doorstep</p>
        <p className="fkd-kpi-value">
          {kpis.doorstep === null ? '—' : humanDuration(kpis.doorstep)}
        </p>
        <p className="fkd-kpi-foot">
          {kpis.doorstep === null
            ? 'no delivery has landed yet'
            : `median, request to customer${kpis.delivered > 1 ? `, of ${kpis.delivered}` : ''}`}
        </p>
      </article>

      <article className={`fkd-kpi${kpis.agentsUp < kpis.agentsTotal ? ' fkd-kpi-warn' : ''}`}>
        <p className="fkd-kpi-label">Agents answering</p>
        <p className="fkd-kpi-value">
          {kpis.agentsUp}
          <span className="fkd-kpi-of">/{kpis.agentsTotal}</span>
        </p>
        <p className="fkd-kpi-foot">
          {kpis.agentsUp === kpis.agentsTotal
            ? 'every service is up'
            : `${kpis.agentsTotal - kpis.agentsUp} not answering — see the roster`}
        </p>
      </article>
    </div>
  );
}
