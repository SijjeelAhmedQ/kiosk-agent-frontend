/**
 * The three figures inside the usage drawer, and the two bars above them.
 *
 * Drawn with the primitives in `../Charts` rather than beside them, because
 * these are the same marks under a different measure: the same rounded cap, the
 * same tick ladder, the same hover readout, the same hairline grid. What is new
 * here is the one thing the rest of this page never needed — a **second series
 * in the same column**. Input tokens and output tokens are two halves of one
 * quantity, they are priced differently, and the whole reason to look at a token
 * chart is to see which half is growing.
 *
 * That makes this the one place on the dashboard using colour for *identity*
 * rather than for status, so it follows the categorical rules instead:
 *
 *   · two hues, fixed — input is always indigo, output is always amber, and
 *     neither ever moves because a filter changed what is on screen;
 *   · a legend is always present, and each series is also direct-labelled in
 *     the readout, so nothing here is distinguished by hue alone;
 *   · a 2px gap of the surface colour between the two stacked segments, which
 *     is what keeps the boundary legible when the two tones are close in print
 *     or under a colour filter;
 *   · both steps validated against both schemes' surfaces — the indigo is a
 *     different step in the dark, chosen rather than lightened automatically.
 *
 * The activity chart goes the other way and stays on the page's status palette,
 * because "succeeded" and "failed" are states, not categories — and it carries
 * the glyph-and-word legend every status on this floor carries.
 */

import { useState } from 'react';
import {
  Tip,
  capPath,
  compact,
  niceTicks,
  useWidth,
  type TipState,
} from '../Charts';
import { money, tokenCount, type ActivityBucket, type TokenBucket } from '../../usage';
import type { Point } from '../../types';

/** The two hues, once. Defined in `usage.css` so both schemes are one place. */
const INK_IN = 'var(--fku-input)';
const INK_OUT = 'var(--fku-output)';

/** How wide the readout is allowed to think it is, for the flip near the edge. */
const PAD = { left: 40, right: 8, top: 14, axis: 20 };

function bucketSpan(t: number, bucketMs: number): string {
  const at = (value: number) =>
    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = (value: number) =>
    new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short' });

  // A daily bucket is a date, not a pair of midnights.
  if (bucketMs >= 86_400_000) return day(t);
  const from = at(t);
  const to = at(t + bucketMs);
  return from === to ? from : `${from} – ${to}`;
}

/** The axis's two ends, which is every label a dense time axis can carry. */
function Ends({
  points,
  bucketMs,
  width,
  height,
}: {
  points: { t: number }[];
  bucketMs: number;
  width: number;
  height: number;
}) {
  return (
    <>
      <text x={PAD.left} y={height - 5} className="fkd-tick">
        {bucketSpan(points[0]?.t ?? Date.now(), bucketMs).split(' – ')[0]}
      </text>
      <text x={width - PAD.right} y={height - 5} className="fkd-tick" textAnchor="end">
        now
      </text>
    </>
  );
}

// --------------------------------------------------------------------------- //
// Tokens over time
// --------------------------------------------------------------------------- //

/**
 * Input and output per bucket, stacked.
 *
 * Stacked rather than side by side: the question the column answers first is
 * "how much did this five minutes cost me", which is the total — and the split
 * inside it is the follow-up. Two thin bars per bucket would answer the
 * follow-up first and make the total something the eye has to add up.
 */
export function TokenColumns({
  buckets,
  bucketMs,
  height = 148,
}: {
  buckets: TokenBucket[];
  bucketMs: number;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.axis;

  const max = Math.max(1, ...buckets.map((bucket) => bucket.input + bucket.output));
  const ticks = niceTicks(max);
  const top = Math.max(max, ticks[ticks.length - 1]);
  const slot = buckets.length > 0 ? plotW / buckets.length : 0;
  const barW = Math.max(2, Math.min(20, slot - 2));

  return (
    <div className="fkd-plot" ref={ref} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Tokens used over time">
          {ticks.map((tick) => {
            const y = PAD.top + plotH - (tick / top) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y}
                  y2={y}
                  className={tick === 0 ? 'fkd-axis' : 'fkd-grid'}
                />
                <text x={PAD.left - 8} y={y + 3.5} className="fkd-tick" textAnchor="end">
                  {compact(tick)}
                </text>
              </g>
            );
          })}

          {buckets.map((bucket, index) => {
            const total = bucket.input + bucket.output;
            const x = PAD.left + index * slot + (slot - barW) / 2;

            // The 2px surface gap lives inside the upper segment's foot rather
            // than between the two paths, so the stack's total height stays
            // exactly proportional to the total it represents.
            const hIn = (bucket.input / top) * plotH;
            const hOut = (bucket.output / top) * plotH;
            const yIn = PAD.top + plotH - hIn;
            const yOut = yIn - hOut;

            const show = () =>
              setTip({
                x: x + barW / 2,
                y: Math.max(0, yOut - 12),
                title: bucketSpan(bucket.t, bucketMs),
                value: `${tokenCount(total)} tokens`,
                note: `${tokenCount(bucket.input)} in · ${tokenCount(bucket.output)} out`,
                tone: INK_OUT,
              });

            return (
              <g
                key={bucket.t}
                tabIndex={0}
                role="img"
                aria-label={`${bucketSpan(bucket.t, bucketMs)}: ${Math.round(
                  bucket.input,
                )} input tokens, ${Math.round(bucket.output)} output tokens`}
                className="fkd-hit"
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
              >
                <rect
                  x={PAD.left + index * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                />
                {bucket.input > 0 && (
                  <path
                    d={
                      bucket.output > 0
                        ? `M${x} ${yIn}h${barW}v${hIn}h${-barW}z`
                        : capPath(x, yIn, barW, hIn, 'up')
                    }
                    fill={INK_IN}
                  />
                )}
                {bucket.output > 0 && (
                  <path
                    d={capPath(x, yOut, barW, Math.max(0, hOut - 2), 'up')}
                    fill={INK_OUT}
                  />
                )}
              </g>
            );
          })}

          <Ends points={buckets} bucketMs={bucketMs} width={width} height={height} />
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// The cost trend
// --------------------------------------------------------------------------- //

/**
 * Spend across the window, cumulative.
 *
 * A running total rather than spend-per-bucket, because the thing being watched
 * is a budget and a budget is a line something climbs towards. It is also the
 * form that survives a quiet floor: per-bucket spend on four calls an hour is
 * four spikes and a lot of empty axis, while the cumulative line is still a
 * shape.
 *
 * One measure, one axis. The budget is not drawn on here — it is a monthly
 * figure and this window is not the month, so a line across it would be two
 * scales pretending to be one.
 */
export function CostTrend({ points, height = 148 }: { points: Point[]; height?: number }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);

  // Wider gutter than the token charts: a tick here reads `$0.0042` rather than
  // `4.2K`, and money at four decimal places is the widest label this drawer
  // draws. Sized to the label rather than shared with the charts above, because
  // a gutter that fits every possible label everywhere is a gutter of air on
  // the two charts that do not need it.
  const padLeft = 56;
  const plotW = Math.max(0, width - padLeft - PAD.right);
  const plotH = height - PAD.top - PAD.axis;

  const first = points[0]?.t ?? 0;
  const last = points[points.length - 1]?.t ?? first + 1;
  const spanMs = Math.max(1, last - first);
  const max = Math.max(...points.map((point) => point.value), 0);
  const ticks = niceTicks(max || 0.0001);
  const top = Math.max(max, ticks[ticks.length - 1]) || 1;

  const x = (t: number) => padLeft + ((t - first) / spanMs) * plotW;
  const y = (value: number) => PAD.top + plotH - (value / top) * plotH;

  // A step line, not a smoothed one: spend does not drift upwards between calls,
  // it jumps when one is made and sits still in between. Curving through those
  // points would draw money being spent at moments nothing happened.
  let line = '';
  points.forEach((point, index) => {
    const px = x(point.t);
    const py = y(point.value);
    if (index === 0) line += `M${px} ${py}`;
    else line += `H${px}V${py}`;
  });
  const area = points.length > 0 ? `${line}V${y(0)}H${x(first)}z` : '';

  return (
    <div className="fkd-plot" ref={ref} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Estimated spend over time">
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={width - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
                className={tick === 0 ? 'fkd-axis' : 'fkd-grid'}
              />
              <text x={padLeft - 8} y={y(tick) + 3.5} className="fkd-tick" textAnchor="end">
                {money(tick)}
              </text>
            </g>
          ))}

          <path d={area} fill="var(--fku-cost-wash)" />
          <path d={line} fill="none" stroke="var(--fku-cost)" strokeWidth={2} />

          {/* The end of the line, labelled. It is the only point on this chart
              anybody reads off directly — "what has it come to" — and hunting
              for it against a gridline is work the chart can do instead. */}
          {points.length > 1 && max > 0 && (
            <>
              <circle
                cx={x(last)}
                cy={y(max)}
                r={4}
                fill="var(--fku-cost)"
                stroke="var(--fk-surface)"
                strokeWidth={2}
              />
              <text
                x={Math.min(width - PAD.right, x(last))}
                y={Math.max(11, y(max) - 9)}
                className="fkd-callout"
                textAnchor="end"
              >
                {money(max)}
              </text>
            </>
          )}

          {/* One hit band per point, so the readout works on a step line the
              same way it works on a column. */}
          {points.map((point, index) => {
            const bandLeft = index === 0 ? padLeft : (x(points[index - 1].t) + x(point.t)) / 2;
            const bandRight =
              index === points.length - 1
                ? width - PAD.right
                : (x(point.t) + x(points[index + 1].t)) / 2;
            const show = () =>
              setTip({
                x: x(point.t),
                y: Math.max(0, y(point.value) - 12),
                title: new Date(point.t).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                value: money(point.value),
                note: 'spent by this point',
                tone: 'var(--fku-cost)',
              });
            return (
              <rect
                key={`${point.t}-${index}`}
                x={bandLeft}
                y={PAD.top}
                width={Math.max(0, bandRight - bandLeft)}
                height={plotH}
                fill="transparent"
                className="fkd-hit"
                tabIndex={0}
                role="img"
                aria-label={`${new Date(point.t).toLocaleTimeString()}: ${money(point.value)} spent so far`}
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
              />
            );
          })}

          <text x={padLeft} y={height - 5} className="fkd-tick">
            {new Date(first).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </text>
          <text x={width - PAD.right} y={height - 5} className="fkd-tick" textAnchor="end">
            now
          </text>
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Requests, by how they ended
// --------------------------------------------------------------------------- //

/** Calls per bucket, on the page's own status palette. */
export function ActivityColumns({
  buckets,
  bucketMs,
  height = 132,
}: {
  buckets: ActivityBucket[];
  bucketMs: number;
  height?: number;
}) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);

  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.axis;

  const max = Math.max(1, ...buckets.map((bucket) => bucket.ok + bucket.failed + bucket.open));
  const ticks = niceTicks(max, { integer: true });
  const top = Math.max(max, ticks[ticks.length - 1]);
  const slot = buckets.length > 0 ? plotW / buckets.length : 0;
  const barW = Math.max(2, Math.min(20, slot - 2));

  return (
    <div className="fkd-plot" ref={ref} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="API requests over time">
          {ticks.map((tick) => {
            const y = PAD.top + plotH - (tick / top) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y}
                  y2={y}
                  className={tick === 0 ? 'fkd-axis' : 'fkd-grid'}
                />
                <text x={PAD.left - 8} y={y + 3.5} className="fkd-tick" textAnchor="end">
                  {compact(tick)}
                </text>
              </g>
            );
          })}

          {buckets.map((bucket, index) => {
            const total = bucket.ok + bucket.failed + bucket.open;
            const x = PAD.left + index * slot + (slot - barW) / 2;
            const unit = plotH / top;

            // Bottom to top: what worked, what is still out, what failed — the
            // failures on top, where they are against the air rather than
            // buried in the middle of a stack.
            const parts: { key: string; value: number; fill: string }[] = [
              { key: 'ok', value: bucket.ok, fill: 'var(--viz-good)' },
              { key: 'open', value: bucket.open, fill: 'var(--viz-idle)' },
              { key: 'failed', value: bucket.failed, fill: 'var(--viz-bad)' },
            ].filter((part) => part.value > 0);

            let cursor = PAD.top + plotH;
            const shapes = parts.map((part, order) => {
              const h = part.value * unit;
              cursor -= h;
              const isTop = order === parts.length - 1;
              return (
                <path
                  key={part.key}
                  d={
                    isTop
                      ? capPath(x, cursor, barW, Math.max(0, h - (order > 0 ? 2 : 0)), 'up')
                      : `M${x} ${cursor}h${barW}v${Math.max(0, h - (order > 0 ? 2 : 0))}h${-barW}z`
                  }
                  fill={part.fill}
                />
              );
            });

            const show = () =>
              setTip({
                x: x + barW / 2,
                y: Math.max(0, cursor - 12),
                title: bucketSpan(bucket.t, bucketMs),
                value: `${total} ${total === 1 ? 'call' : 'calls'}`,
                note:
                  bucket.failed > 0
                    ? `${bucket.failed} failed`
                    : bucket.open > 0
                      ? `${bucket.open} with no result yet`
                      : 'all clean',
                tone: bucket.failed > 0 ? 'var(--viz-bad)' : 'var(--viz-good)',
              });

            return (
              <g
                key={bucket.t}
                tabIndex={0}
                role="img"
                aria-label={`${bucketSpan(bucket.t, bucketMs)}: ${total} calls, ${bucket.failed} failed`}
                className="fkd-hit"
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
              >
                <rect
                  x={PAD.left + index * slot}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                />
                {shapes}
              </g>
            );
          })}

          <Ends points={buckets} bucketMs={bucketMs} width={width} height={height} />
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// The two bars
// --------------------------------------------------------------------------- //

export interface Segment {
  key: string;
  label: string;
  value: number;
  /** A CSS colour, so both palettes reach this from one place. */
  fill: string;
  /** What the segment reads as in words — never the colour alone. */
  read: string;
}

/**
 * One quantity, split into the parts it is made of.
 *
 * Not a progress bar and deliberately not shaped like one: nothing here is
 * filling towards a limit, it is a whole divided in two. Each segment carries
 * its own label and figure underneath, so the bar is a picture of a ratio that
 * is already written out beside it.
 */
export function SplitBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div className="fku-split">
      <div
        className="fku-split-track"
        role="img"
        aria-label={
          total === 0
            ? `${label}: nothing yet`
            : `${label}: ${segments
                .map((segment) => `${segment.label} ${Math.round((segment.value / total) * 100)}%`)
                .join(', ')}`
        }
      >
        {total === 0 ? (
          <span className="fku-split-empty" />
        ) : (
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <span
                key={segment.key}
                className="fku-split-part"
                style={{ width: `${(segment.value / total) * 100}%`, background: segment.fill }}
              />
            ))
        )}
      </div>

      <ul className="fku-split-keys">
        {segments.map((segment) => (
          <li key={segment.key} className="fku-split-key">
            <span className="fku-swatch" style={{ background: segment.fill }} aria-hidden />
            <span className="fku-split-key-label">{segment.label}</span>
            <span className="fku-split-key-value">{segment.read}</span>
            <span className="fku-split-key-share">
              {total === 0 ? '—' : `${Math.round((segment.value / total) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Spend against the budget — the one bar on this screen that *is* a progress bar.
 *
 * It changes tone as it fills, and it says which state it is in in words beside
 * the tint, because "you are at 96% of your budget" is exactly the kind of thing
 * a colour-only signal fails to communicate to the person it matters most to.
 */
export function BudgetBar({
  spent,
  budget,
  label,
}: {
  spent: number;
  budget: number;
  label: string;
}) {
  const ratio = budget > 0 ? spent / budget : null;
  const tone =
    ratio === null ? 'idle' : ratio >= 1 ? 'bad' : ratio >= 0.8 ? 'work' : 'good';
  const verdict =
    ratio === null
      ? 'No budget set'
      : ratio >= 1
        ? 'Over budget'
        : ratio >= 0.8
          ? 'Close to the budget'
          : 'Within budget';

  return (
    <div className={`fku-budget fku-budget-${tone}`}>
      <div
        className="fku-budget-track"
        role="meter"
        aria-valuenow={ratio === null ? undefined : Math.round(Math.min(1, ratio) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="fku-budget-fill"
          style={{ width: `${Math.max(0, Math.min(1, ratio ?? 0)) * 100}%` }}
        />
      </div>
      <p className="fku-budget-read">
        <span className="fku-budget-verdict">
          <span aria-hidden>{tone === 'bad' ? '✕' : tone === 'work' ? '◐' : '✓'}</span>
          {verdict}
        </span>
        <span className="fku-budget-figures">
          {money(spent)} of {money(budget)}
        </span>
      </p>
    </div>
  );
}
