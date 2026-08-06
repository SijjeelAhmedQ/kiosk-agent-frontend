import { Alert, Card, Col, Progress, Row, Statistic, Typography } from 'antd';
import type { AgentRunStatus, AgentWalletSummary } from '@/types';
import { C } from '@/theme';

const { Paragraph, Text } = Typography;

interface Props {
  status: AgentRunStatus | 'idle';
  narration: string;
  finalText: string;
  wallet: AgentWalletSummary | null;
  error: string | null;
}

const money = (value: number) => `Rs ${value.toLocaleString()}`;

/**
 * The agent's own words, and what the errand cost.
 *
 * While it is running this shows the narration as it streams; once it is done
 * the final report replaces it. Two reasons that matters: a long run is
 * otherwise a blank panel, and the report is the thing worth reading twice.
 */
export function RunReport({ status, narration, finalText, wallet, error }: Props) {
  const text = finalText || narration;
  const settled = status === 'done' || status === 'failed' || status === 'cancelled';

  if (status === 'idle' && !text) return null;

  const title =
    status === 'done'
      ? 'How it went'
      : status === 'failed'
        ? 'What went wrong'
        : status === 'cancelled'
          ? 'Stopped'
          : 'What the agent is saying';

  return (
    <Card title={title} variant="outlined">
      {error && (
        <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />
      )}

      {status === 'cancelled' && (
        <Alert
          type="warning"
          showIcon
          message="Stopped part-way"
          description="Anything already paid for still stands — check the kiosk's order list before re-running."
          style={{ marginBottom: 16 }}
        />
      )}

      {text ? (
        <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: wallet ? 20 : 0 }}>
          {text}
          {!settled && <Text type="secondary"> ▍</Text>}
        </Paragraph>
      ) : (
        // Only while it is actually running — a failed run that never spoke
        // would otherwise sit under its own error saying "Working…".
        !settled && <Text type="secondary">Working…</Text>
      )}

      {wallet && (
        <>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Coupon covered"
                value={wallet.couponRedeemed}
                formatter={(value) => money(Number(value))}
                valueStyle={{ color: C.leaf, fontSize: 20 }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Cash spent"
                value={wallet.cashSpent}
                formatter={(value) => money(Number(value))}
                valueStyle={{ fontSize: 20 }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Left in the wallet"
                value={wallet.cashRemaining}
                formatter={(value) => money(Number(value))}
                valueStyle={{ color: C.ash, fontSize: 20 }}
              />
            </Col>
          </Row>

          {wallet.cashLimit > 0 && (
            <Progress
              percent={Math.round((wallet.cashSpent / wallet.cashLimit) * 100)}
              strokeColor={C.amber}
              trailColor={C.mist}
              format={(percent) => `${percent}% of the limit`}
              style={{ marginTop: 12 }}
            />
          )}
        </>
      )}
    </Card>
  );
}
