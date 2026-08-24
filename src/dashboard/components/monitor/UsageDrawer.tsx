/**
 * API usage and billing — everything about what the models cost, in a drawer.
 *
 * This is a drawer rather than a panel on the board, and that is the point of
 * the whole component. The dashboard answers four questions about *work* — who
 * is on the floor, what is arriving, who is holding it, how it ended — and cost
 * is not one of them. It is the question you go and ask, once a day or when
 * something looks wrong, and a page that puts it in six large tiles at the top
 * has quietly decided that money is what an operations screen is for.
 *
 * So the board keeps one small chip that says what it has spent, and everything
 * underneath it lives here: the meters, the three figures, the per-agent
 * breakdown, the live call list, and — last, and not optional — how every one of
 * those numbers was arrived at.
 *
 * That last section is load-bearing. No service on this floor reports token
 * usage (see `usage.ts` for the whole story), so every figure in here is an
 * estimate read off the text this page has watched go past. The word
 * "estimated" is on the hero tile, on the bill, in the chip that opens the
 * drawer, and spelled out in full at the bottom. A cost readout that hides its
 * own derivation is worse than no cost readout: somebody will forward it to a
 * finance team.
 *
 * Like the task drawer beside it, this thing reads and never writes. The one
 * control in here that changes anything changes a number in this browser — the
 * budget — and it says so.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Figure, NoData } from '../Charts';
import { ActivityColumns, BudgetBar, CostTrend, SplitBar, TokenColumns } from './UsageCharts';
import { ACTORS, ago, stamp } from '../../monitor';
import {
  CHARS_PER_TOKEN,
  isoDay,
  money,
  percent,
  tokenCount,
  WINDOWS,
  type ActorUsage,
  type Brain,
  type Family,
  type Turn,
} from '../../usage';
import type { Usage } from '../../useUsage';

interface Props {
  usage: Usage;
  open: boolean;
  now: number;
  onClose: () => void;
  /** The task drawer's door — a call row belongs to a run, and that run is readable. */
  onOpenTask: (correlationId: string) => void;
}

/** How many calls the live list shows before it says how many more there are. */
const LIVE_ROWS = 40;

// --------------------------------------------------------------------------- //
// Small parts
// --------------------------------------------------------------------------- //

/**
 * A folding section with its headline figure in the header.
 *
 * The figure stays visible when the section is folded away, so collapsing the
 * agent breakdown does not also hide the fact that one agent is most of the
 * bill. A fold that costs you the summary is a fold nobody uses twice.
 */
function Section({
  title,
  note,
  figure,
  defaultOpen = true,
  children,
}: {
  title: string;
  note: string;
  figure?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`fku-section${open ? ' fku-section-open' : ''}`}>
      <button
        type="button"
        className="fku-section-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="fku-section-caret" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
        <span className="fku-section-text">
          <span className="fku-section-title">{title}</span>
          <span className="fku-section-note">{note}</span>
        </span>
        {figure && <span className="fku-section-figure">{figure}</span>}
      </button>
      {open && <div className="fku-section-body">{children}</div>}
    </section>
  );
}

/** One labelled fact. `tone` is only ever used for something that needs a look. */
function Fact({
  label,
  value,
  foot,
  tone,
  mono,
}: {
  label: string;
  value: string;
  foot?: string;
  tone?: 'good' | 'warn' | 'bad';
  mono?: boolean;
}) {
  return (
    <div className={`fku-fact${tone ? ` fku-fact-${tone}` : ''}`}>
      <dt>{label}</dt>
      <dd className={mono ? 'fku-fact-mono' : undefined}>{value}</dd>
      {foot && <p className="fku-fact-foot">{foot}</p>}
    </div>
  );
}

/** The verdict on one turn, in a word and a glyph — never in a colour alone. */
function Verdict({ ok }: { ok: boolean | null }) {
  const look =
    ok === false
      ? { className: 'fku-verdict-bad', glyph: '✕', label: 'Failed' }
      : ok === true
        ? { className: 'fku-verdict-good', glyph: '✓', label: 'Success' }
        : { className: 'fku-verdict-open', glyph: '◷', label: 'No result' };
  return (
    <span className={`fku-verdict ${look.className}`}>
      <span aria-hidden>{look.glyph}</span>
      {look.label}
    </span>
  );
}

// --------------------------------------------------------------------------- //
// The per-agent breakdown
// --------------------------------------------------------------------------- //

/**
 * One agent inside a family, opened onto its own numbers and its last few calls.
 *
 * The row is a button because the only useful thing to do with "the dispatcher
 * is 60% of the bill" is to ask what it was doing — and the answer is the turns
 * themselves, which is what opens underneath.
 */
function AgentRow({
  entry,
  share,
  now,
  onOpenTask,
}: {
  entry: ActorUsage;
  /** This agent's spend as a fraction of the whole window's, for the bar. */
  share: number | null;
  now: number;
  onOpenTask: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = ACTORS[entry.actor];

  return (
    <li className={`fku-agent${open ? ' fku-agent-open' : ''}`}>
      <button
        type="button"
        className="fku-agent-hit"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="fku-agent-who">
          <span className="fku-agent-glyph" aria-hidden>
            {meta.glyph}
          </span>
          {/* The short name, not the full one: this row sits under a heading
              that has already named the service, and "Ordering agent" inside
              "Ordering agent" reads as a rendering bug rather than as a
              hierarchy. */}
          <span className="fku-agent-name">
            {meta.short}
            <span className="fku-agent-brain">
              {entry.provider && entry.model ? `${entry.provider} · ${entry.model}` : 'model unknown'}
            </span>
          </span>
        </span>

        <span className="fku-agent-cell">
          <span className="fku-agent-cell-value">{entry.requests}</span>
          <span className="fku-agent-cell-label">requests</span>
        </span>
        <span className="fku-agent-cell">
          <span className="fku-agent-cell-value">{tokenCount(entry.tokens)}</span>
          <span className="fku-agent-cell-label">tokens</span>
        </span>
        <span className="fku-agent-cell fku-agent-cell-lead">
          <span className="fku-agent-cell-value">{money(entry.costUsd)}</span>
          <span className="fku-agent-cell-label">
            {entry.costUsd === null ? 'not priced' : 'estimated'}
          </span>
        </span>

        <span className="fku-agent-caret" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {/* The share bar sits under the row rather than in a column of its own:
          it is a comparison between rows, and a comparison reads better on the
          full width than inside a 60px cell. */}
      <div
        className="fku-agent-share"
        role="img"
        aria-label={
          share === null
            ? `${meta.name}: share of spend unknown`
            : `${meta.name}: ${percent(share)} of the estimated spend`
        }
      >
        <span className="fku-agent-share-fill" style={{ width: `${(share ?? 0) * 100}%` }} />
      </div>

      {open && (
        <div className="fku-agent-body">
          <dl className="fku-facts fku-facts-tight">
            <Fact label="Input tokens" value={tokenCount(entry.input)} />
            <Fact label="Output tokens" value={tokenCount(entry.output)} />
            <Fact
              label="Average per request"
              value={money(entry.averageCostUsd)}
              foot={entry.unpriced > 0 ? `${entry.unpriced} unpriced` : undefined}
            />
            <Fact
              label="Failed"
              value={`${entry.failed}`}
              tone={entry.failed > 0 ? 'bad' : undefined}
              foot={entry.failed === 0 ? 'nothing to look at' : 'calls that came back bad'}
            />
            <Fact
              label="Last call"
              value={entry.lastAt === null ? '—' : stamp(entry.lastAt)}
              foot={entry.lastAt === null ? undefined : ago(entry.lastAt, now)}
            />
            <Fact label="Share of spend" value={percent(share)} />
          </dl>

          <p className="fku-agent-role">{meta.role}</p>

          <ul className="fku-agent-turns">
            {entry.turns.slice(0, 6).map((turn) => (
              <li key={turn.id} className="fku-agent-turn">
                <span className="fku-agent-turn-time">{stamp(turn.at)}</span>
                <span className="fku-agent-turn-text">{turn.title}</span>
                <span className="fku-agent-turn-tokens">{tokenCount(turn.tokens)}</span>
                <button
                  type="button"
                  className="fku-agent-turn-ref"
                  onClick={() => onOpenTask(turn.correlationId)}
                  title="Open the task this call belongs to"
                >
                  {turn.ref}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

function FamilyBlock({
  family,
  windowCost,
  now,
  onOpenTask,
}: {
  family: Family;
  windowCost: number | null;
  now: number;
  onOpenTask: (id: string) => void;
}) {
  return (
    <section className="fku-family">
      <header className="fku-family-head">
        <span className="fku-family-glyph" aria-hidden>
          {family.glyph}
        </span>
        <span className="fku-family-text">
          <span className="fku-family-name">{family.label}</span>
          <span className="fku-family-role">{family.role}</span>
        </span>
        <span className="fku-family-figures">
          <span>{family.totals.requests} req</span>
          <span aria-hidden>·</span>
          <span>{tokenCount(family.totals.tokens)}</span>
          <span aria-hidden>·</span>
          <span className="fku-family-cost">{money(family.totals.costUsd)}</span>
        </span>
      </header>

      <ul className="fku-agents">
        {family.members.map((entry) => (
          <AgentRow
            key={entry.actor}
            entry={entry}
            share={
              windowCost === null || windowCost === 0 || entry.costUsd === null
                ? null
                : entry.costUsd / windowCost
            }
            now={now}
            onOpenTask={onOpenTask}
          />
        ))}
      </ul>
    </section>
  );
}

// --------------------------------------------------------------------------- //
// The live list
// --------------------------------------------------------------------------- //

/** One call, the way the brief reads it: who, on what, how big, what it cost. */
function ActivityRow({
  turn,
  now,
  onOpenTask,
}: {
  turn: Turn;
  now: number;
  onOpenTask: (id: string) => void;
}) {
  const meta = ACTORS[turn.actor];
  return (
    <li className={`fku-live-row${turn.ok === false ? ' fku-live-row-bad' : ''}`}>
      <span className="fku-live-time" title={new Date(turn.at).toLocaleString()}>
        {ago(turn.at, now)}
      </span>
      <span className="fku-live-actor">
        <span aria-hidden>{meta.glyph}</span>
        {meta.short}
      </span>
      <span className="fku-live-arrow" aria-hidden>
        →
      </span>
      <span className="fku-live-model">{turn.model}</span>
      <span className="fku-live-arrow" aria-hidden>
        →
      </span>
      <span className="fku-live-tokens">
        {tokenCount(turn.tokens)}
        <span className="fku-live-unit">tokens</span>
      </span>
      <span className="fku-live-cost">{money(turn.costUsd)}</span>
      <Verdict ok={turn.ok} />
      <button
        type="button"
        className="fku-live-ref"
        onClick={() => onOpenTask(turn.correlationId)}
        title="Open the task this call belongs to"
      >
        {turn.ref}
      </button>
      <span className="fku-live-what">{turn.tool ? `${turn.tool}()` : turn.title}</span>
    </li>
  );
}

// --------------------------------------------------------------------------- //
// The drawer
// --------------------------------------------------------------------------- //

export function UsageDrawer({ usage, open, now, onClose, onOpenTask }: Props) {
  // Escape closes it, same as the task drawer. Bound only while the drawer is
  // open so this page does not keep a key listener alive for a shut panel.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const { totals, periodTotals, range, series, budget, credentials, providers } = usage;
  const brains = Object.values(usage.brains).filter((brain): brain is Brain => Boolean(brain));
  const models = [...new Set(brains.map((brain) => brain.model))];
  const unpricedModels = brains.filter((brain) => brain.rate === null);

  const spent = periodTotals.costUsd ?? 0;
  const remaining = budget - spent;
  const usageRatio = budget > 0 ? spent / budget : null;
  const day = new Date(now).getDate();
  const daysInMonth = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 0).getDate();

  return (
    <div
      className="fko-drawer-layer fku-layer"
      role="dialog"
      aria-modal="true"
      aria-label="API usage and billing"
    >
      <button
        type="button"
        className="fko-scrim"
        onClick={onClose}
        aria-label="Close API usage and billing"
      />

      <aside className="fko-drawer fku-drawer">
        <header className="fko-drawer-head fku-head">
          <div className="fko-drawer-id">
            <p className="fko-drawer-eyebrow">API usage &amp; billing</p>
            <h3 className="fko-drawer-ref">{money(totals.costUsd)}</h3>
            <p className="fku-head-sub">
              {tokenCount(totals.tokens)} tokens across {range.label}
            </p>
          </div>

          {/* The one badge on this screen that is not about status. It is here
              because every number below it is an estimate, and the top of the
              panel is where somebody decides how much to trust the panel. */}
          <span className="fku-badge" title="No service on this floor reports token usage">
            <span aria-hidden>≈</span> Estimated
          </span>

          <button type="button" className="fko-drawer-close" onClick={onClose} aria-label="Close">
            ⤫
          </button>
        </header>

        <div className="fku-filters" role="group" aria-label="Usage range">
          <div className="fkd-seg" role="group" aria-label="Range">
            {WINDOWS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`fkd-seg-btn${usage.window === option.id ? ' fkd-seg-on' : ''}`}
                aria-pressed={usage.window === option.id}
                onClick={() => usage.setWindow(option.id)}
                title={option.note}
              >
                {option.label}
              </button>
            ))}
          </div>

          {usage.window === 'custom' && (
            <div className="fku-dates">
              <label className="fku-date">
                <span>From</span>
                <input
                  type="date"
                  value={usage.custom.from}
                  max={usage.custom.to || isoDay(now)}
                  onChange={(event) =>
                    usage.setCustom({ ...usage.custom, from: event.target.value })
                  }
                />
              </label>
              <label className="fku-date">
                <span>To</span>
                <input
                  type="date"
                  value={usage.custom.to}
                  min={usage.custom.from}
                  max={isoDay(now)}
                  onChange={(event) => usage.setCustom({ ...usage.custom, to: event.target.value })}
                />
              </label>
            </div>
          )}

          <p className="fku-filters-note">
            Counted from the shared log, which keeps the last few hundred events — a range longer
            than that shows everything it still has, not everything that happened.
          </p>
        </div>

        <div className="fko-drawer-body fku-body">
          {/* ── The headline ─────────────────────────────────────────────── */}
          <div className="fku-heroes">
            <article className="fku-hero">
              <p className="fku-hero-label">Total tokens used</p>
              <p className="fku-hero-value">{tokenCount(totals.tokens)}</p>
              <p className="fku-hero-foot">
                {tokenCount(totals.input)} in · {tokenCount(totals.output)} out
              </p>
            </article>

            <article className="fku-hero fku-hero-money">
              <p className="fku-hero-label">Estimated bill</p>
              <p className="fku-hero-value">{money(totals.costUsd)}</p>
              <p className="fku-hero-foot">
                {totals.requests} {totals.requests === 1 ? 'request' : 'requests'} across{' '}
                {range.label}
                {totals.unpriced > 0 && (
                  <span className="fku-hero-warn"> · {totals.unpriced} unpriced</span>
                )}
              </p>
            </article>
          </div>

          <dl className="fku-facts">
            <Fact label="Input tokens" value={tokenCount(totals.input)} foot="what the models read" />
            <Fact
              label="Output tokens"
              value={tokenCount(totals.output)}
              foot="what they wrote — the expensive half"
            />
            <Fact
              label="Total API requests"
              value={`${totals.requests}`}
              foot={totals.failed === 0 ? 'none failed' : `${totals.failed} failed`}
              tone={totals.failed > 0 ? 'bad' : undefined}
            />
            <Fact label="Estimated bill" value={money(totals.costUsd)} foot={range.label} />
            <Fact
              label="Remaining budget"
              value={money(remaining)}
              foot={`of ${money(budget)} this month`}
              tone={remaining < 0 ? 'bad' : remaining < budget * 0.2 ? 'warn' : 'good'}
            />
            <Fact
              label="Average cost per request"
              value={money(totals.averageCostUsd)}
              foot={totals.requests === 0 ? 'nothing measured yet' : 'across priced requests'}
            />
            <Fact
              label="Current usage"
              value={percent(usageRatio)}
              foot="of the month’s budget"
              tone={usageRatio !== null && usageRatio >= 1 ? 'bad' : undefined}
            />
            <Fact
              label="API provider"
              value={providers.length === 0 ? '—' : providers.length === 1 ? providers[0] : 'Mixed'}
              foot={providers.length > 1 ? providers.join(' · ') : 'across every agent'}
              mono
            />
            <Fact
              label="Current model"
              value={models.length === 0 ? '—' : models.length === 1 ? models[0] : `${models.length} models`}
              foot={models.length > 1 ? models.join(' · ') : undefined}
              mono
            />
            <Fact
              label="API key status"
              value={
                credentials.total === 0
                  ? 'Unknown'
                  : credentials.ready === credentials.total
                    ? 'Active'
                    : `${credentials.ready} of ${credentials.total} ready`
              }
              foot={
                credentials.total === 0
                  ? 'no service is answering'
                  : credentials.problems.length === 0
                    ? 'every model-backed agent can run'
                    : credentials.problems
                        .map(({ actor, problem }) => `${ACTORS[actor].short}: ${problem}`)
                        .join(' · ')
              }
              tone={
                credentials.total === 0
                  ? undefined
                  : credentials.ready === credentials.total
                    ? 'good'
                    : 'bad'
              }
            />
            <Fact
              label="Billing period"
              value={usage.period.label}
              foot={`day ${day} of ${daysInMonth}`}
            />
            <Fact
              label="Last API request"
              value={totals.lastAt === null ? '—' : stamp(totals.lastAt)}
              foot={totals.lastAt === null ? 'nothing in this range' : ago(totals.lastAt, now)}
            />
          </dl>

          {/* ── The two bars ─────────────────────────────────────────────── */}
          <div className="fku-meters">
            <section className="fku-meter">
              <h4 className="fku-meter-head">
                Token usage
                <span className="fku-meter-note">
                  how {tokenCount(totals.tokens)} tokens divide across {range.label}
                </span>
              </h4>
              <SplitBar
                label="Token usage, input against output"
                segments={[
                  {
                    key: 'input',
                    label: 'Input',
                    value: totals.input,
                    fill: 'var(--fku-input)',
                    read: tokenCount(totals.input),
                  },
                  {
                    key: 'output',
                    label: 'Output',
                    value: totals.output,
                    fill: 'var(--fku-output)',
                    read: tokenCount(totals.output),
                  },
                ]}
              />
            </section>

            <section className="fku-meter">
              <h4 className="fku-meter-head">
                Budget usage
                <span className="fku-meter-note">
                  {usage.period.label} to date — a figure kept in this browser, not a limit anything
                  enforces
                </span>
              </h4>
              <BudgetBar spent={spent} budget={budget} label="Spend against the monthly budget" />
              <label className="fku-budget-edit">
                <span>Monthly budget (USD)</span>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={budget}
                  onChange={(event) => {
                    const next = Number.parseFloat(event.target.value);
                    usage.setBudget(Number.isFinite(next) && next >= 0 ? next : 0);
                  }}
                />
              </label>
            </section>
          </div>

          {/* ── The figures ──────────────────────────────────────────────── */}
          <Section
            title="Usage over time"
            note="Three views of the same window — what was used, what it cost, and how it went"
            figure={`${totals.requests} ${totals.requests === 1 ? 'call' : 'calls'}`}
          >
            <div className="fku-figs">
              <Figure
                title="Tokens used"
                note="Input and output stacked per bucket. Output is the smaller half and the dearer one — most providers charge about five times more for it."
                table={{
                  head: ['Bucket', 'Input', 'Output', 'Total'],
                  rows: series.tokens.map((bucket) => [
                    new Date(bucket.t).toLocaleString([], {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    Math.round(bucket.input),
                    Math.round(bucket.output),
                    Math.round(bucket.input + bucket.output),
                  ]),
                }}
              >
                {totals.tokens === 0 ? (
                  <NoData note="No model turns in this range." />
                ) : (
                  <>
                    <ul className="fku-legend">
                      <li>
                        <span className="fku-swatch" style={{ background: 'var(--fku-input)' }} aria-hidden />
                        Input
                      </li>
                      <li>
                        <span className="fku-swatch" style={{ background: 'var(--fku-output)' }} aria-hidden />
                        Output
                      </li>
                    </ul>
                    <TokenColumns buckets={series.tokens} bucketMs={series.bucketMs} />
                  </>
                )}
              </Figure>

              <Figure
                title="Cost trend"
                note="Estimated spend across the range, running total. It only climbs — a flat stretch is a quiet floor, not a refund."
                table={{
                  head: ['Time', 'Spent by then'],
                  rows: series.cost.map((point) => [
                    new Date(point.t).toLocaleString([], {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    money(point.value),
                  ]),
                }}
              >
                {series.costUnknown ? (
                  <NoData
                    note={
                      totals.requests === 0
                        ? 'No model turns in this range.'
                        : 'Nothing in this range runs on a model with a known price.'
                    }
                  />
                ) : (
                  <CostTrend points={series.cost} />
                )}
              </Figure>

              <Figure
                title="API request activity"
                note="One column per bucket, split by how each call ended. Failures sit on top, against the air rather than buried in the stack."
                table={{
                  head: ['Bucket', 'Succeeded', 'No result', 'Failed'],
                  rows: series.activity.map((bucket) => [
                    new Date(bucket.t).toLocaleString([], {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    bucket.ok,
                    bucket.open,
                    bucket.failed,
                  ]),
                }}
              >
                {totals.requests === 0 ? (
                  <NoData note="No calls in this range." />
                ) : (
                  <>
                    <ul className="fku-legend">
                      <li>
                        <span className="fku-swatch" style={{ background: 'var(--viz-good)' }} aria-hidden />
                        ✓ Succeeded
                      </li>
                      <li>
                        <span className="fku-swatch" style={{ background: 'var(--viz-idle)' }} aria-hidden />
                        ◷ No result yet
                      </li>
                      <li>
                        <span className="fku-swatch" style={{ background: 'var(--viz-bad)' }} aria-hidden />
                        ✕ Failed
                      </li>
                    </ul>
                    <ActivityColumns buckets={series.activity} bucketMs={series.bucketMs} />
                  </>
                )}
              </Figure>
            </div>
          </Section>

          {/* ── Who spent it ─────────────────────────────────────────────── */}
          <Section
            title="Agent usage breakdown"
            note="Every model-backed agent on the floor, grouped by the service that runs it"
            figure={
              usage.groups.length === 0
                ? 'nothing yet'
                : `${usage.agents.length} ${usage.agents.length === 1 ? 'agent' : 'agents'}`
            }
          >
            {usage.groups.length === 0 ? (
              <p className="fku-empty-line">
                No agent has spoken in this range, so there is nothing to attribute.
              </p>
            ) : (
              <div className="fku-families">
                {usage.groups.map((family) => (
                  <FamilyBlock
                    key={family.id}
                    family={family}
                    windowCost={totals.costUsd}
                    now={now}
                    onOpenTask={onOpenTask}
                  />
                ))}
                <p className="fku-note">
                  The in-house courier is not here and never will be: it runs no model — it is a
                  state machine on a clock — so it cannot cost anything to think.
                </p>
              </div>
            )}
          </Section>

          {/* ── The call list ────────────────────────────────────────────── */}
          <Section
            title="Live API activity"
            note="Every model turn in this range, newest first, as it happened"
            figure={`${usage.scoped.length} ${usage.scoped.length === 1 ? 'turn' : 'turns'}`}
          >
            {usage.scoped.length === 0 ? (
              <p className="fku-empty-line">
                Nothing yet. This list fills the moment an agent says or does something — open the
                ordering console or the A2A desk in another tab and send an errand.
              </p>
            ) : (
              <>
                <ul className="fku-live">
                  {usage.scoped.slice(0, LIVE_ROWS).map((turn) => (
                    <ActivityRow
                      key={turn.id}
                      turn={turn}
                      now={now}
                      onOpenTask={onOpenTask}
                    />
                  ))}
                </ul>
                {usage.scoped.length > LIVE_ROWS && (
                  <p className="fku-note">
                    Showing the newest {LIVE_ROWS} of {usage.scoped.length}. The rest are counted in
                    every figure above.
                  </p>
                )}
              </>
            )}
          </Section>

          {/* ── The method ───────────────────────────────────────────────── */}
          <Section
            title="How these numbers are worked out"
            note="Read this before quoting any of them"
            defaultOpen={false}
          >
            <dl className="fkd-provenance">
              <dt>There is no usage feed</dt>
              <dd>
                None of the four services reports token usage — not in a health payload, not on a
                stream, not anywhere an observer can reach. So every figure on this screen is an{' '}
                <strong>estimate</strong> built from the text this page has watched go past, and the
                page says so on every surface that shows one.
              </dd>

              <dt>What counts as a request</dt>
              <dd>
                One model turn: an agent with a model behind it saying or doing something — a
                message, a tool call, an artifact, an order, a final answer. Its{' '}
                <em>output</em> is the text of that event; its <em>input</em> is everything
                addressed to that agent since its previous turn — the errand a person typed, another
                agent's message, a tool result coming back.
              </dd>

              <dt>How tokens are counted</dt>
              <dd>
                At {CHARS_PER_TOKEN} characters per token, over the title, the body and the JSON
                payload of each event. This is the usual rough ratio and it is not a tokeniser.
              </dd>

              <dt>Why it is a floor, not a bill</dt>
              <dd>
                System prompts, tool schemas and the conversation history a model is re-sent on
                every turn are all billed in reality and none of them reaches this page. The real
                invoice will be <strong>larger</strong> than this, usually by a wide margin on a
                long run. Use these numbers to compare agents and to spot a runaway, never to
                reconcile an invoice.
              </dd>

              <dt>Where the prices come from</dt>
              <dd>
                A table of published list prices per million tokens, in{' '}
                <span className="fk-pill-mono">src/dashboard/usage.ts</span>, keyed by model id.
                {unpricedModels.length > 0 ? (
                  <>
                    {' '}
                    A model that is not in it is not guessed at:{' '}
                    {unpricedModels.map((brain) => brain.model).join(', ')}{' '}
                    {unpricedModels.length === 1 ? 'is' : 'are'} counted in tokens and left out of
                    every money figure.
                  </>
                ) : (
                  ' A model that is not in it is counted in tokens and left out of every money figure.'
                )}{' '}
                A local provider costs $0.00, which is a fact rather than a missing rate.
              </dd>

              <dt>The budget</dt>
              <dd>
                Yours, kept in this browser. It is not read from a service, it is not sent to one,
                and nothing on this floor stops working when it is exceeded.
              </dd>

              <dt>What the range can see</dt>
              <dd>
                The same shared log the control centre reads, which keeps the last few hundred
                events across tabs (
                <span className="fk-pill-mono">src/shared/agentBus.ts</span>). Picking 30 days does
                not recover a fortnight the log never held, and clearing the log clears this screen
                with it.
              </dd>
            </dl>
          </Section>
        </div>
      </aside>
    </div>
  );
}
