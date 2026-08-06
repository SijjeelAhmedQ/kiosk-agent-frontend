import { Alert, App as AntApp, Button, Tooltip } from 'antd';
import { Panel } from '@/components/Panel';
import type { AgentRunStatus, AgentWalletSummary } from '@/types';

interface Props {
  status: AgentRunStatus | 'idle';
  narration: string;
  finalText: string;
  wallet: AgentWalletSummary | null;
  error: string | null;
}

const money = (value: number) => `Rs ${value.toLocaleString()}`;

/** One figure from the wallet, with a spine saying what kind of money it is. */
function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'leaf' | 'amber';
}) {
  return (
    <div className={`fk-tile${tone ? ` fk-tile-${tone}` : ''}`}>
      <div className="fk-tile-label">{label}</div>
      <div className={`fk-tile-value${tone === 'leaf' ? ' fk-tile-value-leaf' : ''}`}>
        {money(value)}
      </div>
    </div>
  );
}

/**
 * The agent's own words, and what the errand cost.
 *
 * While it is running this shows the narration as it streams; once it is done
 * the final report replaces it. Two reasons that matters: a long run is
 * otherwise a blank panel, and the report is the thing worth reading twice.
 */
export function RunReport({ status, narration, finalText, wallet, error }: Props) {
  const { message } = AntApp.useApp();

  const text = finalText || narration;
  const settled = status === 'done' || status === 'failed' || status === 'cancelled';

  if (status === 'idle' && !text) return null;

  const [icon, title, verdict, verdictClass] =
    status === 'done'
      ? ['🎉', 'How it went', 'Done', 'fk-verdict-done']
      : status === 'failed'
        ? ['🚨', 'What went wrong', 'Failed', 'fk-verdict-failed']
        : status === 'cancelled'
          ? ['🛑', 'Stopped', 'Stopped', 'fk-verdict-failed']
          : ['💬', 'What the agent is saying', 'Live', 'fk-verdict-live'];

  const copy = () => {
    void navigator.clipboard.writeText(text).then(
      () => message.success('Report copied'),
      () => message.error('Could not copy the report'),
    );
  };

  // Over the limit is possible in principle — the bar should say so rather than
  // quietly clamping at a tidy 100%.
  const spentPct = wallet && wallet.cashLimit > 0
    ? Math.round((wallet.cashSpent / wallet.cashLimit) * 100)
    : 0;

  return (
    <Panel
      icon={icon}
      title={title}
      live={!settled}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`fk-verdict ${verdictClass}`}>
            {!settled && <span className="fk-dot fk-dot-busy fk-dot-live" aria-hidden />}
            {verdict}
          </span>
          {settled && text && (
            <Tooltip title="Copy the report">
              <Button size="small" onClick={copy}>
                Copy
              </Button>
            </Tooltip>
          )}
        </div>
      }
    >
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 14 }} />}

      {status === 'cancelled' && (
        <Alert
          type="warning"
          showIcon
          message="Stopped part-way"
          description="Anything already paid for still stands — check the kiosk's order list before re-running."
          style={{ marginBottom: 14 }}
        />
      )}

      {text ? (
        <p className="fk-prose" style={{ marginBottom: wallet ? 20 : 0 }}>
          {text}
          {!settled && <span className="fk-caret" aria-hidden />}
        </p>
      ) : (
        // Only while it is actually running — a failed run that never spoke
        // would otherwise sit under its own error saying "Working…".
        !settled && (
          <p className="fk-prose">
            Working
            <span className="fk-caret" aria-hidden />
          </p>
        )
      )}

      {wallet && (
        <>
          <div className="fk-tiles">
            <Tile label="Coupon covered" value={wallet.couponRedeemed} tone="leaf" />
            <Tile label="Cash spent" value={wallet.cashSpent} tone="amber" />
            <Tile label="Left in the wallet" value={wallet.cashRemaining} />
          </div>

          {wallet.cashLimit > 0 && (
            <div className="fk-meter">
              <div className="fk-meter-head">
                <span>{spentPct}% of the cash limit</span>
                <span>
                  {money(wallet.cashSpent)} of {money(wallet.cashLimit)}
                </span>
              </div>
              <div
                className="fk-meter-track"
                role="progressbar"
                aria-valuenow={spentPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`fk-meter-fill${spentPct > 100 ? ' fk-meter-fill-over' : ''}`}
                  style={{ width: `${Math.min(spentPct, 100)}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
