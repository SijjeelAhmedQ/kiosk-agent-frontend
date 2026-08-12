import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Input, InputNumber, Select } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { a2aApi } from '../api';
import type { StartA2ARunInput } from '../types';
import type { CouponOption, CouponStatus } from '@/types';

/**
 * What the buyer is sent out with: an errand, a coupon, a ceiling.
 *
 * Deliberately the same three fields as the errand console's own form, minus
 * the mode switch. The operator is doing the same thing either way — writing an
 * order and deciding how much it may cost — and two forms that disagree about
 * what an errand is would be two mental models for one idea.
 */

interface Props {
  onRun: (input: StartA2ARunInput) => void;
  onCancel: () => void;
  busy: boolean;
  blockedReason: string | null;
  /** Bumped when a run settles, to re-read what is still spendable. */
  couponsKey: number;
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

export function ErrandForm({ onRun, onCancel, busy, blockedReason, couponsKey }: Props) {
  const [instruction, setInstruction] = useState('');
  const [cashLimit, setCashLimit] = useState<number | null>(2500);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);

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

  const cash = cashLimit ?? 0;
  // The service refuses this combination too; saying so here means the operator
  // finds out while looking at the field rather than after pressing the button.
  const pointless = !couponCode && cash <= 0;
  const stopped = blockedReason ?? (pointless ? 'Give the buyer a coupon, a cash limit, or both.' : null);

  const submit = () => {
    if (!instruction.trim() || stopped) return;
    onRun({ instruction: instruction.trim(), cashLimit: cash, couponCode });
  };

  // `a2a-form`, not the shared `fk-fields`: that class is the errand console's
  // two-up money row — coupon beside cash — and this is a plain stack of three.
  return (
    <div className="a2a-form">
      <div className="fk-field">
        <label className="fk-label" htmlFor="a2a-errand">
          The errand
        </label>
        <Input.TextArea
          id="a2a-errand"
          rows={3}
          maxLength={2000}
          showCount
          placeholder="Two Big Macs and a large Coke, dine in."
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          disabled={busy}
        />
        <p className="fk-hint">
          Written for the buying agent, which cannot see the menu. It asks the
          restaurant’s agent for everything.
        </p>
      </div>

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
          onChange={setCouponCode}
          options={options}
          disabled={busy}
          optionFilterProp="label"
          style={{ width: '100%' }}
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
        <p className="fk-hint">
          The buyer is never told the code. It offers the coupon as data, so it
          cannot mistype one.
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
          prefix="Rs"
        />
        <p className="fk-hint">
          A hard ceiling, enforced in code. Zero means the coupon must cover the
          whole order.
        </p>
      </div>

      {/* `title`, not `message` — antd 6 deprecated the latter. The errand
          console still uses the old prop; this page is not going to inherit a
          console warning it does not have to. */}
      {stopped && !busy && <Alert type="warning" showIcon title={stopped} />}

      <div className="fk-actions">
        {busy ? (
          <Button danger size="large" onClick={onCancel} block>
            Stop
          </Button>
        ) : (
          <Button
            type="primary"
            size="large"
            className="fk-cta"
            onClick={submit}
            disabled={!instruction.trim() || Boolean(stopped)}
            block
          >
            Send the buyer out
          </Button>
        )}
      </div>
    </div>
  );
}
