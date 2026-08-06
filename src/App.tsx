import { useCallback, useEffect, useState } from 'react';
import { Button, Col, Layout, Row, Space, Typography } from 'antd';
import { ErrandForm } from '@/components/ErrandForm';
import { RunReport } from '@/components/RunReport';
import { RunTrace } from '@/components/RunTrace';
import { ServiceStatus } from '@/components/ServiceStatus';
import { useAgentRun } from '@/hooks/useAgentRun';
import { agentApi } from '@/services/agentApi';
import type { AgentHealth, StartAgentRunInput } from '@/types';
import { C } from '@/theme';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function App() {
  const run = useAgentRun();
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [checking, setChecking] = useState(true);

  const refreshHealth = useCallback(async () => {
    setHealth(await agentApi.health());
    setChecking(false);
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  // Re-check when a run settles: that is exactly when "is it busy" changes, and
  // when a service that died mid-run should stop being reported as healthy.
  useEffect(() => {
    if (!run.busy) void refreshHealth();
  }, [run.busy, refreshHealth]);

  const start = (input: StartAgentRunInput) => void run.start(input);

  // What is stopping a run, said plainly. The form puts this under the button,
  // so a disabled control always carries its own explanation.
  const blockedReason: string | null = !health
    ? 'The agent service is not running on port 8100.'
    : !health.hasApiKey
      ? // The server knows which provider is configured and what it is missing,
        // so it words this — the UI shouldn't assume Anthropic.
        (health.credentialProblem ?? 'The agent has no usable model credentials.')
      : !health.restaurantApi
        ? 'Friends Kitchen is not answering on port 8000 — start the kiosk backend.'
        : null;

  return (
    <Layout style={{ minHeight: '100vh', background: C.cream }}>
      <Header
        style={{
          background: C.ink,
          height: 'auto',
          padding: '18px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <Space size={14}>
          <span
            aria-hidden
            style={{
              display: 'inline-flex',
              height: 44,
              width: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 14,
              background: C.amber,
              fontSize: 22,
            }}
          >
            🤖
          </span>
          <div>
            <Title level={4} style={{ color: C.paper, margin: 0, lineHeight: 1.2 }}>
              Ordering agent
            </Title>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13 }}>
              Send it to Friends Kitchen with a coupon and a limit
            </Text>
          </div>
        </Space>

        {run.status !== 'idle' && !run.busy && (
          <Button onClick={run.reset} style={{ background: 'rgba(255,255,255,0.12)', color: C.paper, border: 'none' }}>
            New errand
          </Button>
        )}
      </Header>

      <Content style={{ padding: 32, maxWidth: 1400, width: '100%', margin: '0 auto' }}>
        <div style={{ marginBottom: 20 }}>
          <ServiceStatus health={health} checking={checking} />
        </div>

        <Row gutter={[20, 20]} align="top">
          <Col xs={24} lg={10}>
            <ErrandForm
              onRun={start}
              onCancel={() => void run.cancel()}
              busy={run.busy}
              blockedReason={blockedReason}
            />
          </Col>

          <Col xs={24} lg={14}>
            <Space direction="vertical" size={20} style={{ width: '100%' }}>
              <RunTrace
                toolCalls={run.toolCalls}
                busy={run.busy}
                browserOpen={run.browserOpen}
              />
              <RunReport
                status={run.status}
                narration={run.narration}
                finalText={run.finalText}
                wallet={run.wallet}
                error={run.error}
              />
            </Space>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
