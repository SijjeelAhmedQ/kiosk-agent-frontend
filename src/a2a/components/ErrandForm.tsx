import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, Input, InputNumber, Select, Tooltip } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { Panel } from '@/components/Panel';
import { useUserLocation } from '@/hooks/useUserLocation';
import { a2aApi } from '../api';
import { DeliveryField } from './DeliveryField';
import type { DeliveryHealth, StartA2ARunInput, UserLocation } from '../types';
import type { CouponOption, CouponStatus } from '@/types';

/**
 * What the buyer is sent out with: an errand, a drop, a coupon, a ceiling.
 *
 * Deliberately the same three fields as the errand console's own form, minus
 * the mode switch. The operator is doing the same thing either way — writing an
 * order and deciding how much it may cost — and two forms that disagree about
 * what an errand is would be two mental models for one idea.
 *
 * And, like that form, this one does not scroll. It is read top to bottom and
 * filled in once; a field that has to be scrolled into view is a field that
 * gets missed, and the coupon picker was living under that fold. The height
 * comes back from the layout rather than from a taller card: the two money
 * fields share a row, every hint is held to one line, and the order box absorbs
 * whatever the screen has spare — so a tall screen buys a bigger box to type in
 * instead of a stretch of empty paper above the button.
 */

/**
 * Starting points, so nobody faces an empty box wondering what to type.
 *
 * The same five the errand console offers, worded the same way: the operator is
 * writing one kind of thing on both screens, and examples that disagreed about
 * how an errand is phrased would suggest the two agents want different English.
 * The chip carries the item alone and the box gets the whole sentence — five
 * chips each beginning "Order one" wrapped to three rows and said the same
 * thing three times over.
 */
const EXAMPLES = [
  { label: 'Big Mac®', errand: 'Order one Big Mac®' },
  { label: 'Strawberry Shake', errand: 'Order one Strawberry Shake' },
  { label: 'Ranch Snack Wrap®', errand: 'Order one Ranch Snack Wrap®' },
  { label: 'Creamy Ranch Sauce', errand: 'Order one Creamy Ranch Sauce' },
  { label: 'Coca-Cola®', errand: 'Order one Coca-Cola®' },
];

/** What the cash box starts on when there is no coupon paying for the errand. */
const DEFAULT_CASH_LIMIT = 2500;

/** The send shortcut, named the way the keyboard in front of the operator is. */
const SEND_KEYS =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? '⌘ + Enter'
    : 'Ctrl + Enter';

interface Props {
  onRun: (input: StartA2ARunInput) => void;
  onCancel: () => void;
  busy: boolean;
  blockedReason: string | null;
  /** Bumped when a run settles, to re-read what is still spendable. */
  couponsKey: number;
  /**
   * The courier a paid take-away order would go to, and whether it could — so
   * the operator finds out here, where the delivery is arranged, rather than at
   * the handover after the money has moved.
   */
  delivery: DeliveryHealth | null;
  /** The address the service delivers to when no drop is named. Null if none. */
  savedAddress: UserLocation | null;
}

/* The coupon picker, drawn the way the errand console draws its own.
 *
 * The operator picks a coupon on both screens and should not have to learn the
 * list twice, so the tiers, the row and the badges are the same as
 * `src/components/ErrandForm.tsx`. Copied rather than shared: the two consoles
 * are separate entries on purpose, and a change to one must not be able to
 * reach the other. What decides which rows can be picked is unchanged — the
 * same two statuses are spendable here as before. */

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

/** Where a coupon stands, in one word. Every row carries it, live ones too. */
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

/** The three bands the picker groups by, best first. */
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
    ? `Rs ${(coupon.remainingBalance ?? coupon.originalAmount ?? 0).toLocaleString('en-PK')}`
    : (coupon.productName ?? 'free item');
}

/** The searchable one-liner. Kept a plain string so filtering still works. */
function couponLabel(coupon: CouponOption): string {
  return `${coupon.couponCode} — ${worthOf(coupon)} · ${STATUS_LABEL[coupon.status]}`;
}

export function ErrandForm({
  onRun,
  onCancel,
  busy,
  blockedReason,
  couponsKey,
  delivery,
  savedAddress,
}: Props) {
  const [instruction, setInstruction] = useState('Order one Big Mac®');
  /** Empty means "nothing beyond the coupon" — not the same as never set. */
  const [cashLimit, setCashLimit] = useState<number | null>(DEFAULT_CASH_LIMIT);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);

  /** What the box held before a coupon emptied it, so clearing puts it back. */
  const lastCashLimit = useRef(DEFAULT_CASH_LIMIT);

  // Where it goes. Held here rather than inside `DeliveryField` because the send
  // button needs it: a delivery that was asked for and never given a drop must
  // stop the errand rather than quietly become the default one. The fix itself
  // lives in the hook, which owns the browser's three answers.
  const [deliverTo, setDeliverTo] = useState(false);
  const where = useUserLocation();

  useEffect(() => {
    let live = true;
    void a2aApi.coupons().then((list) => {
      if (live) setCoupons(list);
    });
    return () => {
      live = false;
    };
  }, [couponsKey]);

  // Unused on top, part-used under them, spent ones last — still listed, but
  // not selectable. A band with nothing in it is dropped rather than shown
  // empty; a heading over no rows only makes the list longer to read.
  const options = useMemo<DefaultOptionType[]>(
    () =>
      TIERS.map((tier) => {
        const inTier = coupons
          .filter((coupon) => tier.statuses.includes(coupon.status))
          .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
        return {
          key: tier.key,
          label: `${tier.heading} · ${inTier.length}`,
          options: inTier.map((coupon) => ({
            value: coupon.couponCode,
            label: couponLabel(coupon),
            disabled: problemWith(coupon) !== null,
            coupon,
          })),
        };
      }).filter((group) => group.options.length > 0),
    [coupons],
  );

  /**
   * Picking a coupon empties the cash limit — as it does on the errand console,
   * and for the same reason.
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

  // An empty box is a zero limit: spend the coupon and nothing else.
  const cash = cashLimit ?? 0;
  const chosen = coupons.find((coupon) => coupon.couponCode === couponCode) ?? null;

  // Every reason the buyer cannot go, in the order worth reporting: a dead
  // service first, then an errand nobody could carry out. One string, so the
  // button, its tooltip and the line under it can never disagree about why it
  // is off — and the empty-box case says so now instead of leaving a dead
  // button with nothing to explain it.
  const reason: string | null =
    blockedReason ??
    (!instruction.trim()
      ? 'Say what the buyer should order.'
      : !couponCode && cash <= 0
        ? 'Give the buyer a coupon, a cash limit, or both.'
        : deliverTo && !where.location
          ? 'Say where the delivery goes, or switch it off to use the saved address.'
          : null);

  const canRun = reason === null;

  const submit = () => {
    if (!canRun || busy) return;
    onRun({
      instruction: instruction.trim(),
      cashLimit: cash,
      couponCode,
      // Null is not "no delivery" on this service — a paid take-away order goes
      // to the customer's saved address either way. It is "nobody named another
      // drop", and the switch being off is exactly that.
      userLocation: deliverTo ? where.location : null,
    });
  };

  // Ctrl/⌘+Enter from the errand box sends it. Whoever runs a dozen of these in
  // a row should not have to reach for the mouse each time.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
  };

  // The two lines of help, one per money field, each written to fit on one row —
  // with the whole sentence on hover. The picker labels every row itself, so the
  // coupon's line is a tally, or what the chosen one is worth: not a repeat of
  // what the dropdown already says.
  const spendable = coupons.filter((coupon) => problemWith(coupon) === null).length;
  const couponHint = chosen
    ? `${worthOf(chosen)} · ${STATUS_LABEL[chosen.status]}`
    : coupons.length === 0
      ? 'None found — the buyer pays cash.'
      : `${spendable} spendable of ${coupons.length}`;

  // The box is emptied the moment a coupon is picked, so the line under it says
  // what an empty box now means rather than describing a number that is gone.
  const cashHint = couponCode
    ? 'Empty spends the coupon and nothing else.'
    : 'A hard ceiling, in code.';
  const cashTitle = couponCode
    ? 'What may be spent on top of the coupon. Empty means the coupon must cover the whole order.'
    : 'A hard ceiling, enforced in code — the buyer is refused at payment above it.';

  // The panel is drawn here rather than by the page, as it is on the errand
  // console, so the send control can sit in the footer: `Panel` pins that below
  // the body and outside its scroll, which is what keeps the button on the
  // bottom edge of the card however long the form above it runs.
  return (
    <Panel
      icon={<span aria-hidden>🧾</span>}
      title="The errand"
      note="What the buying agent is sent out to do"
      // Full height, like the conversation beside it — three cards of three
      // different heights read as three unrelated things. `flex`, not `scroll`:
      // the body lays the form out and the order box takes the slack, so the
      // card is filled without anything in it ever needing to be scrolled to.
      fill="flex"
      className="a2a-panel-errand"
      footer={
        <div className="a2a-send">
          <div className="fk-actions">
            {/* The Tooltip needs a wrapper: antd puts `pointer-events: none` on
                a disabled button, so hovering the button itself fires nothing. */}
            <Tooltip title={busy ? '' : (reason ?? `${SEND_KEYS} sends it`)}>
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
                  {busy
                    ? 'Negotiating…'
                    : deliverTo
                      ? 'Send it out for delivery →'
                      : 'Send the buyer out →'}
                </Button>
              </span>
            </Tooltip>

            {busy && (
              <Button danger size="large" onClick={onCancel}>
                Stop
              </Button>
            )}
          </div>

          {/* Spelled out under the button as well as in the tooltip — a reason
              you have to hover to discover is one most people never read. */}
          {reason && !busy && <p className="a2a-why">{reason}</p>}
        </div>
      }
    >
      {/* Each section is headed, and the heading carries the aside that used to
          be a wrapped paragraph in the body: it reads as a caption to the
          section, and costs a line that was already there. */}
      <div className="a2a-section">
        <div className="fk-eyebrow">The errand</div>
        <span className="a2a-section-note">Plain language</span>
      </div>

      {/* The one element that grows: it takes the panel's spare height, between
          two rows' worth and a sensible cap, so the card is filled by the field
          people type in rather than by a gap above the button. */}
      <Input.TextArea
        id="a2a-errand"
        className="a2a-errand-box"
        // The eyebrow above it is a heading, not a `<label>` — the box says what
        // it is for in its own words instead of borrowing one.
        aria-label="The errand"
        rows={2}
        maxLength={2000}
        placeholder="Two Big Macs and a large Coke, dine in."
        value={instruction}
        onChange={(event) => setInstruction(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={busy}
      />

      {/* antd's own `showCount` is absolutely positioned and lands on top of the
          hint the moment the hint wraps. Counting here puts both on one row that
          cannot collide. */}
      <div className="fk-hint-row">
        <p className="fk-hint">Written for the buyer, which cannot see the menu.</p>
        <span className={`fk-count${instruction.length > 1800 ? ' fk-count-near' : ''}`}>
          {instruction.length} / 2000
        </span>
      </div>

      {/* One press writes the whole errand into the box above, where it can
          still be edited — an example is a starting point, not a preset. */}
      <div className="fk-chips a2a-chips">
        {EXAMPLES.map((example) => (
          <button
            key={example.errand}
            type="button"
            className="fk-chip fk-chip-sm"
            aria-pressed={instruction === example.errand}
            aria-label={example.errand}
            disabled={busy}
            onClick={() => setInstruction(example.errand)}
          >
            {example.label}
          </button>
        ))}
      </div>

      {/* Between the errand and the money, which is the order the three
          questions are actually asked in: what to buy, where it goes, what it
          may spend. Same place it sits on the errand console's form. */}
      <DeliveryField
        wanted={deliverTo}
        onWanted={setDeliverTo}
        location={where.location}
        status={where.status}
        problem={where.problem}
        courier={delivery}
        saved={savedAddress}
        busy={busy}
        onDetect={where.detect}
        onManual={where.setManual}
        onLabel={where.setLabel}
        onClear={where.clear}
      />

      {/* Settled against the footer rather than following the chips: the two
          halves of the form then sit at the two ends of the card on a tall
          screen, and close up as one block when the height is tight. */}
      <div className="a2a-money">
        <div className="a2a-section">
          <div className="fk-eyebrow">The money</div>
          <span className="a2a-section-note" title="The buyer offers the coupon as data, so it cannot mistype one.">
            The buyer never sees the code
          </span>
        </div>

        <div className="a2a-fields">
          <div className="fk-field">
            <label className="fk-label" htmlFor="a2a-coupon">
              Coupon
            </label>
            <Select
              id="a2a-coupon"
              allowClear
              showSearch
              placeholder="None — pay cash"
              value={couponCode}
              onChange={pickCoupon}
              options={options}
              disabled={busy}
              optionFilterProp="label"
              style={{ width: '100%' }}
              // Picked, the field shows the code alone. The searchable label
              // carries the worth and the status as well, which is right in a
              // dropdown the width of the panel and three ellipses wide in a
              // box sharing its row with the cash limit — so what is worth
              // knowing about the chosen one moves to the line underneath.
              labelRender={({ value }) => <span className="a2a-coupon-picked">{value}</span>}
              optionRender={(option) => {
                const coupon = (option.data as { coupon?: CouponOption }).coupon;
                if (!coupon) return option.label;
                // antd fades a disabled option, but not far enough to read as
                // "this one is out" beside the live ones — hence `a2a-coupon-out`.
                const out = problemWith(coupon) !== null;
                return (
                  <div className={`a2a-coupon${out ? ' a2a-coupon-out' : ''}`}>
                    <span className="a2a-coupon-glyph" aria-hidden>
                      {coupon.couponType === 'value' ? '💰' : '🎁'}
                    </span>
                    <div className="a2a-coupon-main">
                      <div className="a2a-coupon-code">{coupon.couponCode}</div>
                      <div className="a2a-coupon-worth">{worthOf(coupon)}</div>
                    </div>
                    {/* On every row, not just the broken ones — the state of a
                        coupon is what the operator is scanning this list for. */}
                    <span className={`fk-badge ${STATUS_TONE[coupon.status]}`}>
                      {STATUS_LABEL[coupon.status]}
                    </span>
                  </div>
                );
              }}
            />
            <p className="fk-hint fk-hint-1" title={couponHint}>
              {couponHint}
            </p>
          </div>

          <div className="fk-field">
            <label className="fk-label" htmlFor="a2a-cash">
              Cash limit
            </label>
            <InputNumber
              id="a2a-cash"
              min={0}
              max={1000000}
              step={100}
              value={cashLimit}
              onChange={setCashLimit}
              disabled={busy}
              style={{ width: '100%' }}
              placeholder={couponCode ? 'Coupon only' : '0'}
              prefix={<span className="a2a-cash-prefix">Rs</span>}
              // Guarded: an empty box has no number to group, and `${undefined}`
              // would put the word "undefined" in the field.
              formatter={(value) =>
                value === undefined || value === null
                  ? ''
                  : `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
              }
              parser={(value) => Number((value ?? '').replace(/,/g, '')) as 0}
            />
            <p className="fk-hint fk-hint-1" title={cashTitle}>
              {cashHint}
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
