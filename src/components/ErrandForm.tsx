import { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Segmented,
  Select,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { couponApi } from '@/services/couponApi';
import type { AgentMode, CouponOption, StartAgentRunInput } from '@/types';
import { C } from '@/theme';

const { Text, Paragraph } = Typography;

/** Starting points, so nobody faces an empty box wondering what to type. */
const EXAMPLES = [
  'Order two cheeseburgers',
  'Get me a Big Mac meal and a coffee',
  'Order the cheapest burger on the menu',
  'Order fries and a drink for someone who is very hungry',
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

/** How a coupon reads in the picker: what it is worth and what it is for. */
function describe(coupon: CouponOption): string {
  const worth =
    coupon.couponType === 'value'
      ? `Rs ${(coupon.remainingBalance ?? coupon.originalAmount ?? 0).toLocaleString()}`
      : (coupon.productName ?? 'free item');
  const partial = coupon.status === 'partially_redeemed' ? ' · part-used' : '';
  return `${coupon.couponCode} — ${worth}${partial}`;
}

export function ErrandForm({ onRun, onCancel, busy, blockedReason }: Props) {
  const [instruction, setInstruction] = useState(EXAMPLES[0]);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [cashLimit, setCashLimit] = useState<number>(3000);
  const [mode, setMode] = useState<AgentMode>('api');
  const [headless, setHeadless] = useState(false);
  const [coupons, setCoupons] = useState<CouponOption[]>([]);

  useEffect(() => {
    void couponApi.spendable().then(setCoupons);
  }, []);

  // Every reason the agent cannot go, in the order worth reporting: a dead
  // service first, then an errand that could never succeed. One string, so the
  // button and its tooltip can never disagree about why it is off.
  const reason: string | null =
    blockedReason ??
    (!instruction.trim()
      ? 'Say what the agent should order.'
      : !couponCode && cashLimit <= 0
        ? 'Give it a coupon, a cash limit, or both — it cannot buy anything with neither.'
        : null);

  const canRun = reason === null;

  const submit = () => {
    if (!canRun) return;
    onRun({
      instruction: instruction.trim(),
      couponCode,
      cashLimit,
      mode,
      headless,
      customerId: null,
    });
  };

  return (
    <Card title="The errand" variant="outlined">
      <Form layout="vertical" disabled={busy}>
        <Form.Item
          label="What should the agent order?"
          extra="Plain language. The agent looks the menu up itself."
        >
          <Input.TextArea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            maxLength={2000}
            showCount
            placeholder="Order two cheeseburgers"
          />
        </Form.Item>

        <Form.Item label={<Text type="secondary">Try one</Text>} style={{ marginTop: -8 }}>
          <Space size={[6, 6]} wrap>
            {EXAMPLES.map((example) => (
              <Tag.CheckableTag
                key={example}
                checked={instruction === example}
                onChange={() => !busy && setInstruction(example)}
                style={{ borderRadius: 999, padding: '3px 12px', border: `1px solid ${C.mist}` }}
              >
                {example}
              </Tag.CheckableTag>
            ))}
          </Space>
        </Form.Item>

        <Form.Item
          label="Coupon"
          extra={
            coupons.length
              ? 'The token the agent carries. Pick one, or type a code.'
              : 'No spendable coupons found — you can still type a code.'
          }
        >
          <Select
            allowClear
            showSearch
            value={couponCode}
            onChange={setCouponCode}
            placeholder="No coupon — pay cash only"
            optionFilterProp="label"
            options={coupons.map((coupon) => ({
              value: coupon.couponCode,
              label: describe(coupon),
            }))}
            // A code that is not in the list is still usable — the agent finds
            // out from the restaurant, not from this dropdown.
            onSearch={(value) => value.length > 3 && setCouponCode(value.toUpperCase())}
          />
        </Form.Item>

        <Form.Item
          label="Cash limit"
          extra="What the agent may spend beyond the coupon. It is refused at payment if the bill is higher."
        >
          <InputNumber
            value={cashLimit}
            onChange={(value) => setCashLimit(value ?? 0)}
            min={0}
            max={1000000}
            step={500}
            style={{ width: '100%' }}
            prefix="Rs"
            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(value) => Number((value ?? '').replace(/,/g, '')) as 0}
          />
        </Form.Item>

        <Form.Item label="How should it order?">
          <Segmented
            block
            value={mode}
            onChange={(value) => setMode(value as AgentMode)}
            options={[
              { label: 'Through the API', value: 'api' },
              { label: 'Through the website', value: 'browser' },
            ]}
          />
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 13 }}>
            {mode === 'api'
              ? 'Calls the restaurant’s API directly. Fast and deterministic.'
              : 'Drives the real kiosk website in Chromium — tapping, typing and paying like a customer.'}
          </Paragraph>
        </Form.Item>

        {mode === 'browser' && (
          <Form.Item label="Watch it happen">
            <Space size={12}>
              <Switch checked={!headless} onChange={(on) => setHeadless(!on)} />
              <Text type="secondary">
                {headless
                  ? 'Running invisibly'
                  : 'Chromium opens on this machine so you can watch'}
              </Text>
            </Space>
          </Form.Item>
        )}

      </Form>

      {/* Outside the Form on purpose: `disabled={busy}` cascades to every
          control inside it, which would grey out Stop exactly when it is
          needed. */}
      <Space direction="vertical" size={8} style={{ marginTop: 8, width: '100%' }}>
        <Space size={12}>
          {/* The Tooltip needs a wrapper: antd puts `pointer-events: none` on a
              disabled button, so hovering the button itself fires nothing. */}
          <Tooltip title={reason ?? ''}>
            <span style={{ display: 'inline-block' }}>
              <Button
                type="primary"
                size="large"
                onClick={submit}
                disabled={!canRun}
                loading={busy}
              >
                {busy ? 'On its way…' : 'Send the agent'}
              </Button>
            </span>
          </Tooltip>
          {busy && (
            <Button size="large" danger onClick={onCancel}>
              Stop
            </Button>
          )}
        </Space>

        {/* Spelled out under the button as well as in the tooltip — a reason you
            have to hover to discover is a reason most people never read. */}
        {reason && !busy && (
          <Text type="secondary" style={{ fontSize: 13 }}>
            {reason}
          </Text>
        )}
      </Space>
    </Card>
  );
}
