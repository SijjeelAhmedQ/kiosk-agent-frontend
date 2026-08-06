import { Card, Empty, Spin, Tag, Timeline, Typography } from 'antd';
import type { AgentToolCall } from '@/types';
import { toolLabel } from '@/toolLabels';
import { C } from '@/theme';

const { Text } = Typography;

interface Props {
  toolCalls: AgentToolCall[];
  busy: boolean;
  browserOpen: boolean;
}

/** A coloured dot per step: running, succeeded, or refused. */
function dot(call: AgentToolCall) {
  if (call.ok === null) return <Spin size="small" />;
  const colour = call.ok ? C.leaf : C.flame;
  return (
    <span
      style={{
        display: 'inline-flex',
        height: 18,
        width: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        background: colour,
        color: C.paper,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {call.ok ? '✓' : '!'}
    </span>
  );
}

/**
 * What the agent did, step by step.
 *
 * A refused step is not a crash — the wallet turning down an over-budget
 * payment shows up here in red and the agent is expected to carry on. So
 * failures are rendered as part of the story rather than as an error state.
 */
export function RunTrace({ toolCalls, busy, browserOpen }: Props) {
  return (
    <Card
      title="What the agent did"
      variant="outlined"
      extra={
        browserOpen ? (
          <Tag style={{ background: C.amberSoft, border: 'none', color: C.amberDark }}>
            Browser open
          </Tag>
        ) : null
      }
    >
      {toolCalls.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            busy ? 'Thinking about where to start…' : 'Nothing yet — send it on an errand.'
          }
        />
      ) : (
        <Timeline
          items={toolCalls.map((call) => {
            const meta = toolLabel(call.name);
            return {
              dot: dot(call),
              children: (
                <div>
                  <Text strong>
                    {meta.icon} {meta.label}
                  </Text>
                  {meta.spends && (
                    <Tag
                      style={{
                        marginLeft: 8,
                        background: C.amberSoft,
                        border: 'none',
                        color: C.amberDark,
                      }}
                    >
                      spends money
                    </Tag>
                  )}
                  <div>
                    <Text type="secondary" style={{ fontSize: 12.5 }}>
                      {call.summary ?? 'working…'}
                    </Text>
                  </div>
                </div>
              ),
            };
          })}
        />
      )}
    </Card>
  );
}
