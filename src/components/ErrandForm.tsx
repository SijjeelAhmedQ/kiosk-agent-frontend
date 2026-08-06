import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Input, InputNumber, Select, Switch, Tooltip, Typography } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { Panel } from '@/components/Panel';
import { couponApi } from '@/services/couponApi';
import type { AgentMode, CouponOption, CouponStatus, StartAgentRunInput } from '@/types';
import { V } from '@/theme';

const { Text } = Typography;

/** Starting points, so nobody faces an empty box wondering what to type. */
const EXAMPLES = [
  'Order one Big Mac®',
  'Order two cheeseburgers',
];

/** What the cash box starts on when there is no coupon paying for the errand. */
const DEFAULT_CASH_LIMIT = 3000;

/** The two ways the agent can shop, as the operator picks between them. */
const MODES: { value: AgentMode; icon: string; name: string; desc: string }[] = [
  {
    value: 'api',
    icon: '⚡',
    name: 'Through the API',
    desc: 'Calls the restaurant’s API directly. Fast and deterministic.',
  },
  {
    value: 'browser',
    icon: '🖥️',
    name: 'Through the website',
    desc: 'Drives the real kiosk in Chromium — tapping, typing and paying like a customer.',
  },
];

interface Props {
  onRun: (input: StartAgentRunInput) => void;
  onCancel: () => void;
  busy: boolean;
  /**
   * Why the agent cannot be sent, in words — or null when it can.
   *
   * A reason rather than a boolean: a disabled button that does not say what is
   * wrong with it is a dead end, and the banner explaining it sits far enough up
   * the page that the two do not obviously connect.
   */
  blockedReason: string | null;
}

/**
 * Why a coupon cannot be spent, in the words the picker shows — or null when
 * there is nothing wrong with it.
 *
 * The list holds spent and dead coupons as well as live ones: greying one out
 * with the reason beside it answers "why won't this code work?", where leaving
 * it off the list only raises the question.
 */
function problemWith({ status }: CouponOption): string | null {
  switch (status) {
    case 'fully_redeemed':
      return 'already used';
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    default:
      return null;
  }
}

/** Spendable first, then the dead ones in the order they are worth reading. */
const ORDER: Record<CouponStatus, number> = {
  unused: 0,
  partially_redeemed: 1,
  fully_redeemed: 2,
  expired: 3,
  cancelled: 4,
};

/**
 * Where a coupon stands, in one word.
 *
 * Every row carries it, live ones included: a list where only the broken
 * coupons are labelled leaves the reader inferring what the unlabelled ones
 * are, and "unused" is the thing they came to find.
 */
const STATUS_LABEL: Record<CouponStatus, string> = {
  unused: 'unused',
  partially_redeemed: 'partly used',
  fully_redeemed: 'used',
  expired: 'expired',
  cancelled: 'cancelled',
};

/** Green for spendable, amber for what is left of one, red for spent. */
const STATUS_TONE: Record<CouponStatus, string> = {
  unused: 'fk-badge-leaf',
  partially_redeemed: '',
  fully_redeemed: 'fk-badge-flame',
  expired: 'fk-badge-flame',
  cancelled: 'fk-badge-flame',
};

/**
 * The three bands the picker groups by, best first.
 *
 * Sorting alone already put them in this order, but an unheaded list of a dozen
 * codes does not show that it is sorted — the headings say where the good ones
 * stop, so nobody scrolls past them looking for something better.
 */
const TIERS: { key: string; heading: string; statuses: CouponStatus[] }[] = [
  { key: 'unused', heading: 'Unused — full value', statuses: ['unused'] },
  { key: 'part', heading: 'Partly used — some value left', statuses: ['partially_redeemed'] },
  {
    key: 'spent',
    heading: 'Used, expired or cancelled — cannot be spent',
    statuses: ['fully_redeemed', 'expired', 'cancelled'],
  },
];

/** What a coupon is worth, in the words the picker shows. */
function worthOf(coupon: CouponOption): string {
  return coupon.couponType === 'value'
    ? `Rs ${(coupon.remainingBalance ?? coupon.originalAmount ?? 0).toLocaleString()}`
    : (coupon.productName ?? 'free item');
}

/** The line under the code: what it is worth, and where it stands. */
function noteOn(coupon: CouponOption): string {
  return `${worthOf(coupon)} · ${STATUS_LABEL[coupon.status]}`;
}

/** The searchable one-liner. Kept a plain string so filtering still works. */
function describe(coupon: CouponOption): string {
  return `${coupon.couponCode} — ${noteOn(coupon)}`;
}

export function ErrandForm({ onRun, onCancel, busy, blockedReason }: Props) {
  const [instruction, setInstruction] = useState(EXAMPLES[0]);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  /** Empty means "nothing beyond the coupon" — not the same as never set. */
  const [cashLimit, setCashLimit] = useState<number | null>(DEFAULT_CASH_LIMIT);
  const [mode, setMode] = useState<AgentMode>('api');
  const [headless, setHeadless] = useState(false);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);

  /** What the box held before a coupon emptied it, so clearing puts it back. */
  const lastCashLimit = useRef(DEFAULT_CASH_LIMIT);

  useEffect(() => {
    void couponApi.list().then(setCoupons);
  }, []);

  /**
   * Picking a coupon empties the cash limit.
   *
   * A coupon is the money for that errand, and a default sitting in the box
   * underneath it is cash nobody asked to spend — so the operator has to say,
   * deliberately, how much may go on top. Clearing the coupon puts back
   * whatever the box held before, since an errand with neither cannot run.
   */
  const pickCoupon = (code: string | null) => {
    setCouponCode(code);

    if (code) {
      if (cashLimit !== null) lastCashLimit.current = cashLimit;
      setCashLimit(null);
    } else if (cashLimit === null) {
      setCashLimit(lastCashLimit.current);
    }
  };

  // What is wrong with the code currently in the box, if the list knows it. A
  // dead one cannot be picked from the dropdown, but it can still be typed.
  const chosen = coupons.find((coupon) => coupon.couponCode === couponCode);
  const chosenProblem = chosen ? problemWith(chosen) : null;

  // Every reason the agent cannot go, in the order worth reporting: a dead
  // service first, then an errand that could never succeed. One string, so the
  // button and its tooltip can never disagree about why it is off.
  const reason: string | null =
    blockedReason ??
    (!instruction.trim()
      ? 'Say what the agent should order.'
      : chosenProblem
        ? `That coupon is ${chosenProblem} — pick another, or clear it and pay cash.`
        : !couponCode && (cashLimit ?? 0) <= 0
          ? 'Give it a coupon, a cash limit, or both — it cannot buy anything with neither.'
          : null);

  const canRun = reason === null;

  const submit = () => {
    if (!canRun) return;
    onRun({
      instruction: instruction.trim(),
      couponCode,
      // An empty box is a zero limit: spend the coupon and nothing else.
      cashLimit: cashLimit ?? 0,
      mode,
      headless,
      customerId: null,
    });
  };

  // Ctrl/⌘+Enter from the errand box sends it. Whoever runs a dozen of these in
  // a row should not have to reach for the mouse each time.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !busy) submit();
  };

  // Unused on top, part-used under them, spent ones last — still listed, but
  // not selectable. A band with nothing in it is dropped rather than shown
  // empty; a heading over no rows only makes the list longer to read.
  const options: DefaultOptionType[] = TIERS.map((tier) => {
    const inTier = coupons
      .filter((coupon) => tier.statuses.includes(coupon.status))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
    return {
      key: tier.key,
      label: `${tier.heading} · ${inTier.length}`,
      options: inTier.map((coupon) => ({
        value: coupon.couponCode,
        label: describe(coupon),
        disabled: problemWith(coupon) !== null,
        coupon,
      })),
    };
  }).filter((group) => group.options.length > 0);

  const countOf = (...statuses: CouponStatus[]) =>
    coupons.filter((coupon) => statuses.includes(coupon.status)).length;
  const unusedCount = countOf('unused');
  const partCount = countOf('partially_redeemed');
  const deadCount = countOf('fully_redeemed', 'expired', 'cancelled');

  return (
    <Panel
      icon="✍️"
      title="The errand"
      note="What to order, and what it may spend"
      live={busy}
    >
      <div className="fk-eyebrow">The order</div>

      <Input.TextArea
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        rows={3}
        maxLength={2000}
        placeholder="Order two cheeseburgers"
        style={{ resize: 'none' }}
      />

      {/* antd's own `showCount` is absolutely positioned and lands on top of the
          hint once the hint wraps to two lines. Counting here puts both on one
          row that cannot collide. */}
      <div className="fk-hint-row">
        <p className="fk-hint">Plain language. The agent looks the menu up itself.</p>
        <span className={`fk-count${instruction.length > 1800 ? ' fk-count-near' : ''}`}>
          {instruction.length} / 2000
        </span>
      </div>

      <div style={{ marginTop: 12 }} className="fk-chips">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="fk-chip"
            aria-pressed={instruction === example}
            disabled={busy}
            onClick={() => setInstruction(example)}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="fk-eyebrow">The money</div>

      <label className="fk-label" htmlFor="fk-coupon">
        Coupon
      </label>
      <Select
        id="fk-coupon"
        allowClear
        showSearch
        disabled={busy}
        value={couponCode}
        onChange={pickCoupon}
        placeholder="No coupon — pay cash only"
        optionFilterProp="label"
        style={{ width: '100%' }}
        options={options}
        // A code that is not in the list is still usable — the agent finds
        // out from the restaurant, not from this dropdown.
        onSearch={(value) => value.length > 3 && pickCoupon(value.toUpperCase())}
        optionRender={(option) => {
          const coupon = (option.data as { coupon?: CouponOption }).coupon;
          if (!coupon) return option.label;
          const problem = problemWith(coupon);
          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                // antd fades a disabled option, but not far enough to read as
                // "this one is out" at a glance next to the live ones.
                opacity: problem ? 0.55 : 1,
              }}
            >
              <span
                style={{ fontSize: 15, filter: problem ? 'grayscale(1)' : undefined }}
                aria-hidden
              >
                {coupon.couponType === 'value' ? '💰' : '🎁'}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontFamily: V.fontMono,
                    fontSize: 12,
                    fontWeight: 600,
                    textDecoration: problem ? 'line-through' : undefined,
                  }}
                >
                  {coupon.couponCode}
                </div>
                <div style={{ fontSize: 11.5, color: V.textFaint }}>{worthOf(coupon)}</div>
              </div>
              {/* On every row, not just the broken ones — the state of a coupon
                  is what the operator is scanning this list for. */}
              <span
                className={`fk-badge ${STATUS_TONE[coupon.status]}`}
                style={{ flexShrink: 0 }}
              >
                {STATUS_LABEL[coupon.status]}
              </span>
            </div>
          );
        }}
      />
      <p className="fk-hint">
        {coupons.length === 0
          ? 'No coupons found — you can still type a code.'
          : unusedCount + partCount === 0
            ? `All ${coupons.length} coupons are used, expired or cancelled — you can still type a code.`
            : `${unusedCount} unused, ${partCount} partly used, ${deadCount} spent or cancelled` +
              ' (greyed out). Pick one, or type a code.'}
      </p>

      <label className="fk-label" style={{ marginTop: 20 }} htmlFor="fk-cash">
        Cash limit
      </label>
      <InputNumber
        id="fk-cash"
        disabled={busy}
        value={cashLimit}
        onChange={setCashLimit}
        min={0}
        max={1000000}
        step={500}
        style={{ width: '100%' }}
        placeholder={couponCode ? 'Coupon only — no cash' : '0'}
        prefix={<span style={{ color: V.textFaint, fontWeight: 600 }}>Rs</span>}
        // Guarded: an empty box has no number to group, and `${undefined}`
        // would put the word "undefined" in the field.
        formatter={(value) =>
          value === undefined || value === null
            ? ''
            : `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        }
        parser={(value) => Number((value ?? '').replace(/,/g, '')) as 0}
      />
      <p className="fk-hint">
        {couponCode
          ? 'Left empty, the errand is the coupon and nothing more. Put a number here only if' +
            ' the agent may top it up with cash.'
          : 'What the agent may spend. It is refused at payment if the bill is higher.'}
      </p>

      <div className="fk-eyebrow">The method</div>

      <div className="fk-choices" role="radiogroup" aria-label="How should it order?">
        {MODES.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            className="fk-choice"
            aria-checked={mode === option.value}
            disabled={busy}
            onClick={() => setMode(option.value)}
          >
            {mode === option.value && (
              <span className="fk-choice-tick" aria-hidden>
                ✓
              </span>
            )}
            <span className="fk-choice-top">
              <span className="fk-choice-icon" aria-hidden>
                {option.icon}
              </span>
              <span className="fk-choice-name">{option.name}</span>
            </span>
            <span className="fk-choice-desc">{option.desc}</span>
          </button>
        ))}
      </div>

      {mode === 'browser' && (
        <div
          // The kiosk's Toggle row: a cream capsule, no border.
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 12,
            padding: '12px 16px',
            borderRadius: 16,
            background: V.surfaceSunken,
          }}
        >
          <Switch
            checked={!headless}
            disabled={busy}
            onChange={(on) => setHeadless(!on)}
            aria-label="Watch it happen"
          />
          <Text style={{ fontSize: 12.5, color: V.textFaint }}>
            {headless
              ? 'Running invisibly'
              : 'Chromium opens on this machine so you can watch'}
          </Text>
        </div>
      )}

      <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="fk-actions">
          {/* The Tooltip needs a wrapper: antd puts `pointer-events: none` on a
              disabled button, so hovering the button itself fires nothing. */}
          <Tooltip title={reason ?? ''}>
            <span style={{ display: 'block' }}>
              <Button
                type="primary"
                size="large"
                className="fk-cta"
                onClick={submit}
                disabled={!canRun}
                loading={busy}
                block
              >
                {busy ? 'On its way…' : 'Send the agent →'}
              </Button>
            </span>
          </Tooltip>

          {busy && (
            <Button size="large" danger onClick={onCancel}>
              Stop
            </Button>
          )}
        </div>

        {/* Spelled out under the button as well as in the tooltip — a reason you
            have to hover to discover is a reason most people never read. */}
        {reason && !busy ? (
          <Text style={{ fontSize: 12.5, color: V.flame }}>{reason}</Text>
        ) : (
          !busy && null
          // (
          //   <Text style={{ fontSize: 12, color: V.textFaint }}>
          //     Press <span className="fk-kbd">Ctrl</span> <span className="fk-kbd">↵</span> in
          //     the order box to send.
          //   </Text>
          // )
        )}
      </div>
    </Panel>
  );
}
