import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Input, InputNumber, Select, Tooltip, Typography } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { Panel } from '@/components/Panel';
import { couponApi } from '@/services/couponApi';
import type { CouponOption, CouponStatus, StartAgentRunInput } from '@/types';
import { V } from '@/theme';

const { Text } = Typography;

/**
 * Starting points, so nobody faces an empty box wondering what to type.
 *
 * The chip shows the item and the box gets the whole sentence: five chips each
 * beginning "Order one" wrapped to three rows and said the same thing three
 * times over, and the rows were height the panel could not spare.
 */
const EXAMPLES = [
  { label: 'Big Mac®', order: 'Order one Big Mac®' },
  { label: 'Strawberry Shake', order: 'Order one Strawberry Shake' },
  { label: 'Ranch Snack Wrap®', order: 'Order one Ranch Snack Wrap®' },
  { label: 'Creamy Ranch Sauce', order: 'Order one Creamy Ranch Sauce' },
  { label: 'Coca-Cola®', order: 'Order one Coca-Cola®' },
];

/** What the cash box starts on when there is no coupon paying for the errand. */
const DEFAULT_CASH_LIMIT = 3000;

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
  /**
   * Bumped to re-read the coupon list.
   *
   * The picker is otherwise loaded once, and an errand that spends a coupon
   * leaves it showing a balance the restaurant no longer agrees with — so
   * whoever starts the next errand says here that the list is stale.
   */
  couponsRefreshKey: number;
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

export function ErrandForm({
  onRun,
  onCancel,
  busy,
  blockedReason,
  couponsRefreshKey,
}: Props) {
  const [instruction, setInstruction] = useState(EXAMPLES[0].order);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  /** Empty means "nothing beyond the coupon" — not the same as never set. */
  const [cashLimit, setCashLimit] = useState<number | null>(DEFAULT_CASH_LIMIT);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);

  /** What the box held before a coupon emptied it, so clearing puts it back. */
  const lastCashLimit = useRef(DEFAULT_CASH_LIMIT);

  useEffect(() => {
    void couponApi.list().then(setCoupons);
  }, [couponsRefreshKey]);

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
      // The agent always shops through the restaurant's API — there is nothing
      // to choose, so the form does not ask.
      mode: 'api',
      headless: true,
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

  // The two lines of help, one per money field, each written to fit on one row.
  // The pair used to run to five wrapped lines between them, which was most of
  // the height the card was scrolling to recover.
  const couponSummary =
    coupons.length === 0
      ? 'None found — you can still type a code.'
      : unusedCount + partCount === 0
        ? `All ${coupons.length} are spent — you can still type a code.`
        : `${unusedCount} unused · ${partCount} part-used · ${deadCount} spent · or type a code`;

  const cashHint = couponCode
    ? 'Empty spends the coupon and nothing else.'
    : 'Refused at payment if the bill is higher.';

  return (
    <Panel
      icon="✍️"
      title="The errand"
      note="What to order, and what it may spend"
      live={busy}
      className="fk-panel-errand"
      // Nothing here scrolls. The form is short enough to be read in one look —
      // two money fields on one row, one line of help under each — and the order
      // box takes whatever height is left over, so a taller screen buys a bigger
      // box to type in rather than a stretch of empty paper.
      fill="flex"
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
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
                  disabled={!canRun || busy}
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
          {reason && !busy && (
            <Text style={{ fontSize: 12.5, color: V.flame }}>{reason}</Text>
          )}
        </div>
      }
    >
      <div className="fk-eyebrow">The order</div>

      {/* The one element that grows: it takes the panel's spare height, between
          two rows' worth and a sensible cap, so the card is filled by the field
          people type in rather than by a gap above the button. */}
      <Input.TextArea
        className="fk-order-box"
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
        rows={2}
        maxLength={2000}
        placeholder="Order two cheeseburgers"
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

      <div className="fk-chips">
        {EXAMPLES.map((example) => (
          <button
            key={example.order}
            type="button"
            className="fk-chip fk-chip-sm"
            aria-pressed={instruction === example.order}
            aria-label={example.order}
            disabled={busy}
            onClick={() => setInstruction(example.order)}
          >
            {example.label}
          </button>
        ))}
      </div>

      {/* Settled against the button rather than following the chips: the two
          halves of the form then sit at the two ends of the card on a tall
          screen, and close up as one block when the height is tight. */}
      <div className="fk-money">
        <div className="fk-eyebrow">The money</div>

        <div className="fk-fields">
          <div className="fk-field">
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
              placeholder="None — pay cash"
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
                      // antd fades a disabled option, but not far enough to read
                      // as "this one is out" beside the live ones.
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
                    {/* On every row, not just the broken ones — the state of a
                        coupon is what the operator is scanning this list for. */}
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
            {/* One line, and the whole sentence on hover: the picker itself
                labels every row, so this is a tally, not the explanation. */}
            <p className="fk-hint fk-hint-1" title={couponSummary}>
              {couponSummary}
            </p>
          </div>

          <div className="fk-field fk-field-cash">
            <label className="fk-label" htmlFor="fk-cash">
              Cash Limit
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
              placeholder={couponCode ? 'Coupon only' : '0'}
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
            <p className="fk-hint fk-hint-1" title={cashHint}>
              {cashHint}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
