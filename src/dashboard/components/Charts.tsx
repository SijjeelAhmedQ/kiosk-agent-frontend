/**
 * The chart primitives this page draws with — three forms and two figures.
 *
 * Hand-drawn SVG rather than a charting library, and that is a deliberate
 * choice rather than a shortcut. This app's whole dependency list is React and
 * antd; adding twelve thousand lines of chart engine so that four small charts
 * can exist would be the largest thing in the bundle by an order of magnitude,
 * and none of these forms is hard. What is hard — and what a library would give
 * away for free — is *restraint*, so the specs are written down here instead:
 *
 *   · Marks are thin. A bar is capped at 22px however much room the band has;
 *     the leftover is air, not ink.
 *   · A bar is rounded at the data end and square at the baseline, so the eye
 *     reads length from a straight edge rather than from a lozenge.
 *   · Gridlines are hairlines, solid, one step off the surface. Never dashed —
 *     a dashed rule reads as a threshold, and none of these are.
 *   · Text never wears the data colour. The mark beside a label carries the
 *     identity; a yellow number on cream carries nothing.
 *   · Every chart has a table twin. The hover readout is an enhancement and is
 *     never the only way to get a value.
 *
 * On colour: this page uses a **status** palette, not a categorical one. Amber
 * means work in progress, green means it arrived, red means it did not, grey
 * means nothing is happening — the same four meanings the delivery board's pills
 * already carry. Run the categorical checks against those four and they fail, as
 * they should: amber and red collapse to a ΔE of 1.4 under deuteranopia on the
 * light scheme, and green and red to 4.3 on the dark one. That is exactly why
 * every status mark on this page ships with a glyph and a word beside it, and
 * why nothing here is distinguished by hue alone.
 */

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Point, Row } from '../types';

// --------------------------------------------------------------------------- //
// Measuring
// --------------------------------------------------------------------------- //

/**
 * The width the chart actually got, in real pixels.
 *
 * A viewBox would be less code, but it scales the type with the plot — 11px
 * axis labels come out at 9 on a narrow column and 13 on a wide one, and the
 * strokes go with them. Measuring and drawing at true size keeps one text size
 * and one hairline weight across every breakpoint.
 */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(node);
    setWidth(Math.floor(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

// --------------------------------------------------------------------------- //
// Marks
// --------------------------------------------------------------------------- //

/** A bar rounded at the data end and square at the baseline. */
function capPath(x: number, y: number, w: number, h: number, grow: 'up' | 'right'): string {
  if (w <= 0 || h <= 0) return '';
  const r = Math.min(4, grow === 'up' ? w / 2 : h / 2, grow === 'up' ? h : w);
  if (r <= 0.5) return `M${x} ${y}h${w}v${h}h${-w}z`;

  return grow === 'up'
    ? // from the baseline up: square feet, rounded cap
      `M${x} ${y + h}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h}z`
    : // from the axis right: square heel, rounded tip
      `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}H${x}z`;
}

/**
 * Axis ticks people read: 0, 5, 10 — never 0, 3.33, 6.67.
 *
 * `integer` is not a nicety. Every count on this page is a whole number of
 * requests, and a scale that offers "0, 0.5, 1" is offering half a request —
 * which is not a rounding artefact so much as a claim about the data that is
 * simply false.
 */
function niceTicks(max: number, { count = 3, integer = false } = {}): number[] {
  if (max <= 0) return [0];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  let step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? magnitude * 10;
  if (integer) step = Math.max(1, Math.round(step));

  const ticks: number[] = [];
  for (let value = 0; value <= max + step / 2; value += step) ticks.push(value);
  return ticks;
}

const compact = (value: number): string =>
  value >= 10_000 ? `${Math.round(value / 1000)}K` : value.toLocaleString();

// --------------------------------------------------------------------------- //
// The hover readout
// --------------------------------------------------------------------------- //

interface TipState {
  x: number;
  y: number;
  title: string;
  value: string;
  note?: string;
  tone: string;
}

/**
 * The readout, positioned over the plot.
 *
 * Values lead and labels follow, which is the legend's hierarchy inverted on
 * purpose: by the time somebody is hovering they know which bar they are on and
 * want the number. It flips to the left of the pointer near the right edge so it
 * is never the thing that makes the card scroll sideways.
 */
function Tip({ tip, width }: { tip: TipState | null; width: number }) {
  if (!tip) return null;
  const flip = tip.x > width - 130;
  return (
    // `aria-hidden`, deliberately. Every value this readout can show is already
    // on the mark's own `aria-label`, which a screen reader announces on focus —
    // so a live region here would say the same number a second time, and say it
    // again on every pointer move. The tooltip enhances; it never gates.
    <div
      className={`fkd-tip${flip ? ' fkd-tip-flip' : ''}`}
      style={{ left: tip.x, top: tip.y }}
      aria-hidden
    >
      <span className="fkd-tip-key" style={{ background: tip.tone }} aria-hidden />
      <div>
        <div className="fkd-tip-value">{tip.value}</div>
        <div className="fkd-tip-title">{tip.title}</div>
        {tip.note && <div className="fkd-tip-note">{tip.note}</div>}
      </div>
    </div>
  );
}

const TONE: Record<string, string> = {
  work: 'var(--viz-work)',
  good: 'var(--viz-good)',
  bad: 'var(--viz-bad)',
  idle: 'var(--viz-idle)',
};

// --------------------------------------------------------------------------- //
// The frame
// --------------------------------------------------------------------------- //

interface FigureProps {
  title: string;
  note: string;
  /** The same numbers as a table — the twin every chart here has. */
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
}

/**
 * Title, note, chart, and the switch to the table.
 *
 * The table is not a fallback for a broken chart; it is the accessible twin of a
 * working one. A colour-coded bar and a hover tooltip are both channels a reader
 * may not have, and this is where the numbers live for anyone who has neither.
 */
export function Figure({ title, note, table, children }: FigureProps) {
  const [asTable, setAsTable] = useState(false);
  const bodyId = useId();

  return (
    <figure className="fkd-fig">
      <figcaption className="fkd-fig-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="fkd-fig-title">{title}</h3>
          <p className="fkd-fig-note">{note}</p>
        </div>
        <button
          type="button"
          className="fkd-fig-switch"
          aria-pressed={asTable}
          aria-controls={bodyId}
          onClick={() => setAsTable((value) => !value)}
        >
          {asTable ? 'Chart' : 'Table'}
        </button>
      </figcaption>

      <div id={bodyId} className="fkd-fig-body">
        {asTable ? (
          <div className="fkd-table-wrap">
            <table className="fkd-table">
              <thead>
                <tr>
                  {table.head.map((cell) => (
                    <th key={cell} scope="col">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, column) => (
                      <td key={column}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </figure>
  );
}

// --------------------------------------------------------------------------- //
// Columns — a count against time
// --------------------------------------------------------------------------- //

interface ColumnsProps {
  points: Point[];
  /** How wide one bucket is, so the readout can say what a column covers. */
  bucketMs: number;
  height?: number;
}

/**
 * Arrivals over the range on screen.
 *
 * No label on any column — thirty of them would be noise, and the axis, the
 * readout and the table already carry every value. What *is* labelled is the
 * busiest one, because "the peak was four" is the sentence somebody wants from
 * this chart and reading it off a gridline is work.
 */
export function Columns({ points, bucketMs, height = 132 }: ColumnsProps) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);

  const padLeft = 34;
  const padRight = 6;
  const padTop = 14;
  const axisBand = 20;
  const plotW = Math.max(0, width - padLeft - padRight);
  const plotH = height - padTop - axisBand;

  const max = Math.max(1, ...points.map((point) => point.value));
  const ticks = niceTicks(max, { integer: true });
  const top = Math.max(max, ticks[ticks.length - 1]);
  const slot = points.length > 0 ? plotW / points.length : 0;
  const barW = Math.max(2, Math.min(22, slot - 2)); // the 2px surface gap

  // The busiest bucket, labelled — but only when there *is* a busiest one. On a
  // flat chart every column is the peak, and a number floating over an arbitrary
  // one of them is noise pretending to be a finding.
  const sorted = [...points].map((point) => point.value).sort((a, b) => b - a);
  const peak =
    sorted[0] > (sorted[1] ?? 0)
      ? points.reduce((best, point) => (point.value > best.value ? point : best), points[0])
      : null;

  const span = (t: number) => {
    const from = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const to = new Date(t + bucketMs).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
    return from === to ? from : `${from} – ${to}`;
  };

  return (
    <div className="fkd-plot" ref={ref} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Requests taken in over time">
          {ticks.map((tick) => {
            const y = padTop + plotH - (tick / top) * plotH;
            return (
              <g key={tick}>
                <line
                  x1={padLeft}
                  x2={width - padRight}
                  y1={y}
                  y2={y}
                  className={tick === 0 ? 'fkd-axis' : 'fkd-grid'}
                />
                <text x={padLeft - 8} y={y + 3.5} className="fkd-tick" textAnchor="end">
                  {compact(tick)}
                </text>
              </g>
            );
          })}

          {points.map((point, index) => {
            const h = (point.value / top) * plotH;
            const x = padLeft + index * slot + (slot - barW) / 2;
            const y = padTop + plotH - h;
            // Anchored to the column rather than to the pointer: the readout
            // then sits still while the finger or mouse wanders inside the slot,
            // which is what stops it juddering on a dense axis.
            const show = () =>
              setTip({
                x: x + barW / 2,
                y: Math.max(0, y - 12),
                title: span(point.t),
                value: `${point.value} ${point.value === 1 ? 'request' : 'requests'}`,
                tone: TONE.work,
              });

            return (
              <g
                key={point.t}
                tabIndex={0}
                role="img"
                aria-label={`${span(point.t)}: ${point.value} requests`}
                className="fkd-hit"
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
              >
                {/* The hit area is the whole slot, floor to ceiling. A 3px column
                    is a pinpoint, and a reader aiming at a time of day should not
                    have to aim at the ink. */}
                <rect x={padLeft + index * slot} y={padTop} width={slot} height={plotH} fill="transparent" />
                {point.value > 0 && <path d={capPath(x, y, barW, h, 'up')} fill="var(--viz-work)" />}
              </g>
            );
          })}

          {peak !== null && peak.value > 0 && (
            <text
              x={padLeft + points.indexOf(peak) * slot + slot / 2}
              y={padTop + plotH - (peak.value / top) * plotH - 6}
              className="fkd-callout"
              textAnchor="middle"
            >
              {peak.value}
            </text>
          )}

          <text x={padLeft} y={height - 5} className="fkd-tick">
            {span(points[0]?.t ?? Date.now()).split(' – ')[0]}
          </text>
          <text x={width - padRight} y={height - 5} className="fkd-tick" textAnchor="end">
            now
          </text>
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Bars — a count or a duration against a name
// --------------------------------------------------------------------------- //

interface BarsProps {
  rows: Row[];
  /** How to word a value in the label and the readout. */
  format: (value: number) => string;
  /** Rows carry a status meaning, so each gets a glyph beside its name. */
  glyphs?: Record<string, string>;
  /** Bars share one scale rather than each filling its own row. */
  max?: number;
}

/**
 * Horizontal bars, one per row, on one shared scale.
 *
 * Horizontal rather than vertical because these rows have real names — "Rider
 * assigned", "Refused by the dispatcher" — and a vertical version spends its
 * whole axis band rotating them. The value rides the tip of each bar, which is
 * the one place a direct label is always legible: outside the fill, on the
 * surface, never clipped by a bar too short to hold it.
 */
export function Bars({ rows, format, glyphs, max }: BarsProps) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState<TipState | null>(null);

  // A third of the card, capped. Wide enough for the longest stage name these
  // charts carry ("Rider assigned", with a glyph in front of it) and no wider —
  // past that the bars start losing the room that makes them comparable.
  const labelW = Math.min(168, Math.max(96, Math.round(width * 0.34)));
  const valueW = 62;
  const rowH = 30;
  const barH = 14;
  const plotW = Math.max(1, width - labelW - valueW - 12);
  const top = Math.max(1, max ?? Math.max(...rows.map((row) => row.value), 1));
  const height = rows.length * rowH + 4;

  return (
    <div className="fkd-plot" ref={ref} onPointerLeave={() => setTip(null)}>
      {width > 0 && (
        <svg width={width} height={height}>
          {rows.map((row, index) => {
            const y = index * rowH + 4;
            const w = (row.value / top) * plotW;
            const tone = TONE[row.tone ?? 'work'];
            const show = () =>
              setTip({
                x: labelW + Math.min(w, plotW) + 10,
                y: y - 4,
                title: row.label,
                value: format(row.value),
                note: row.note,
                tone,
              });

            return (
              <g
                key={row.key}
                tabIndex={0}
                role="img"
                className="fkd-hit"
                aria-label={`${row.label}: ${format(row.value)}${row.note ? `, ${row.note}` : ''}`}
                onPointerEnter={show}
                onFocus={show}
                onBlur={() => setTip(null)}
              >
                <rect x={0} y={y - 4} width={width} height={rowH} fill="transparent" />

                {/* The name, with its own glyph — the status channel that does
                    not depend on telling amber from red. */}
                <text x={0} y={y + barH - 2} className="fkd-row-label">
                  {glyphs?.[row.key] ? `${glyphs[row.key]}  ` : ''}
                  {row.label}
                </text>

                {/* The empty part of the scale, so a short bar still shows how
                    short it is rather than floating in space. */}
                <rect
                  x={labelW}
                  y={y}
                  width={plotW}
                  height={barH}
                  rx={4}
                  fill="var(--viz-track)"
                />
                {row.value > 0 && (
                  <path d={capPath(labelW, y, Math.max(3, w), barH, 'right')} fill={tone} />
                )}

                <text x={width} y={y + barH - 2} className="fkd-row-value" textAnchor="end">
                  {format(row.value)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <Tip tip={tip} width={width} />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Figures — when the form is a number
// --------------------------------------------------------------------------- //

/**
 * Twelve points of context under a stat tile.
 *
 * No axis, no labels, no readout: a sparkline is a shape, and the moment it
 * grows chrome it is a chart in the wrong place. The current bucket is drawn in
 * the work colour and the rest in the de-emphasis grey, so the eye lands on the
 * end without the line having to shout.
 */
export function Sparkline({ points, height = 26 }: { points: Point[]; height?: number }) {
  const [ref, width] = useWidth();
  const bars = points.slice(-24);
  const top = Math.max(1, ...bars.map((point) => point.value));
  const slot = bars.length > 0 && width > 0 ? width / bars.length : 0;
  const barW = Math.max(1.5, slot - 2);

  return (
    <div className="fkd-spark" ref={ref} aria-hidden>
      {width > 0 && (
        <svg width={width} height={height}>
          {bars.map((point, index) => {
            const h = Math.max(point.value > 0 ? 2 : 0, (point.value / top) * height);
            return (
              <path
                key={point.t}
                d={capPath(index * slot, height - h, barW, h, 'up')}
                fill={index === bars.length - 1 ? 'var(--viz-work)' : 'var(--viz-idle-wash)'}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}

/**
 * A ratio against its own scale.
 *
 * The track is a wash of the fill's own colour rather than a neutral grey, so
 * the whole bar reads as one measurement at a glance instead of as a coloured
 * thing sitting on an unrelated grey thing.
 */
export function Meter({
  ratio,
  tone = 'good',
  label,
}: {
  ratio: number | null;
  tone?: 'work' | 'good' | 'bad';
  label: string;
}) {
  const pct = ratio === null ? 0 : Math.max(0, Math.min(1, ratio));
  return (
    <div
      className="fkd-meter"
      role="meter"
      aria-valuenow={ratio === null ? undefined : Math.round(pct * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="fkd-meter-track" style={{ background: `var(--viz-${tone}-wash)` }}>
        <div
          className="fkd-meter-fill"
          style={{ width: `${pct * 100}%`, background: `var(--viz-${tone})` }}
        />
      </div>
    </div>
  );
}

/**
 * Nothing to draw yet, said in the space the chart will occupy.
 *
 * Its own component so an empty chart keeps the card's height. A panel that
 * collapses to one line of grey text and then jumps back to 160px when the first
 * job lands makes the whole page shuffle at the worst possible moment.
 */
export function NoData({ note, height = 132 }: { note: string; height?: number }) {
  return (
    <div className="fkd-nodata" style={{ minHeight: height }}>
      {note}
    </div>
  );
}
