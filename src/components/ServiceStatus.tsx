import { Alert, Space, Tag, Typography } from 'antd';
import type { AgentHealth } from '@/types';
import { AGENT_OFFLINE } from '@/services/agentApi';
import { C } from '@/theme';

const { Text } = Typography;

interface Props {
  health: AgentHealth | null;
  checking: boolean;
}

/**
 * What is and is not ready.
 *
 * Three separate things have to be up before an errand can run, and when one is
 * missing the operator needs to know *which* — "it didn't work" is what this
 * exists to prevent. Silent when everything is fine.
 */
export function ServiceStatus({ health, checking }: Props) {
  if (checking && !health) {
    return <Text type="secondary">Checking the agent service…</Text>;
  }

  if (!health) {
    return (
      <Alert
        type="error"
        showIcon
        message="The agent service is not running"
        description={<Text code style={{ fontSize: 12 }}>{AGENT_OFFLINE}</Text>}
      />
    );
  }

  const problems: string[] = [];
  if (!health.hasApiKey && health.credentialProblem) {
    problems.push(health.credentialProblem);
  }
  if (!health.restaurantApi) {
    problems.push(
      'Friends Kitchen is not answering. Start the backend on port 8000 before sending the agent.',
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Space size={8} wrap>
        <Tag color={C.leaf} style={{ color: C.paper, border: 'none' }}>
          Agent online
        </Tag>
        <Tag color={health.restaurantApi ? C.leaf : C.flame} style={{ color: C.paper, border: 'none' }}>
          {health.restaurantApi ? 'Restaurant open' : 'Restaurant down'}
        </Tag>
        <Tag color={health.hasApiKey ? C.leaf : C.flame} style={{ color: C.paper, border: 'none' }}>
          {health.hasApiKey ? 'Credentials ready' : 'No credentials'}
        </Tag>
        <Tag style={{ background: C.cream, border: 'none', color: C.ash }}>
          {health.provider} · {health.model}
        </Tag>
        {health.busy && (
          <Tag style={{ background: C.amberSoft, border: 'none', color: C.amberDark }}>
            An errand is already running
          </Tag>
        )}
      </Space>

      {problems.map((problem) => (
        <Alert key={problem} type="warning" showIcon message={problem} />
      ))}
    </Space>
  );
}
