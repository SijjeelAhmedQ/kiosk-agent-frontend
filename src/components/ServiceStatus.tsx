import type { ReactNode } from 'react';
import { Alert, Typography } from 'antd';
import type { AgentHealth } from '@/types';
import { AGENT_OFFLINE } from '@/services/agentApi';

const { Text } = Typography;

interface Props {
  health: AgentHealth | null;
  checking: boolean;
}

/** One service, one pill: what it is and whether it is up. */
function Pill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span className="fk-pill">
      <span className={`fk-dot ${ok ? 'fk-dot-ok' : 'fk-dot-bad'}`} aria-hidden />
      {children}
    </span>
  );
}

/**
 * What is and is not ready.
 *
 * Three separate things have to be up before an errand can run, and when one is
 * missing the operator needs to know *which* — "it didn't work" is what this
 * exists to prevent. Quiet when everything is fine: the pills stay, the
 * explanations only appear when there is something to explain.
 */
export function ServiceStatus({ health, checking }: Props) {
  if (checking && !health) {
    return (
      <div className="fk-status">
        <span className="fk-pill">
          <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
          Checking the agent service…
        </span>
      </div>
    );
  }

  if (!health) {
    return (
      <Alert
        type="error"
        showIcon
        message="The agent service is not running"
        description={
          <Text code style={{ fontSize: 11.5 }}>
            {AGENT_OFFLINE}
          </Text>
        }
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
  // A warning, not a blocker: an unreachable courier stops deliveries and
  // leaves counter orders working exactly as they do now, so it must not read
  // like the agent cannot run.
  if (health.delivery && !health.delivery.configured && health.delivery.problem) {
    problems.push(`Delivery is unavailable — ${health.delivery.problem}`);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="fk-status">
        <Pill ok>Agent online</Pill>
        <Pill ok={health.restaurantApi}>
          {health.restaurantApi ? 'Restaurant open' : 'Restaurant down'}
        </Pill>
        <Pill ok={health.hasApiKey}>
          {health.hasApiKey ? 'Credentials ready' : 'No credentials'}
        </Pill>

        {/* Only when the server reports on delivery at all: an older agent
            service has no such field, and an absent pill is a truer answer
            than one guessing. */}
        {health.delivery && (
          <Pill ok={health.delivery.configured}>
            {health.delivery.configured
              ? `${health.delivery.displayName} ready`
              : `${health.delivery.displayName} unavailable`}
          </Pill>
        )}

        <span className="fk-pill fk-pill-mono">
          {health.provider} · {health.model}
        </span>

        {health.busy && (
          <span className="fk-pill">
            <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />
            An errand is already running
          </span>
        )}
      </div>

      {problems.map((problem) => (
        <Alert key={problem} type="warning" showIcon message={problem} />
      ))}
    </div>
  );
}
