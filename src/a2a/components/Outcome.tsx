import { Alert } from 'antd';
import type { WalletSummary } from '../types';

/**
 * What the errand came to: the wallet, and the buyer's own account of it.
 *
 * The wallet is drawn from the service's raw numbers rather than from the
 * report, on purpose. The report is written by a language model and is the
 * thing most likely to be wrong about a figure; these four came out of the
 * ledger. When they disagree, the tiles are right.
 */

interface Props {
  wallet: WalletSummary | null;
  finalText: string;
  finalAfterError: boolean;
  paid: boolean;
  orderNumber: string | null;
  error: string | null;
  status: string;
}

const rupees = (amount: number) =>
  `Rs ${amount.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;

export function Outcome({
  wallet,
  finalText,
  finalAfterError,
  paid,
  orderNumber,
  error,
  status,
}: Props) {
  if (status === 'idle') {
    return (
      <p className="fk-empty-note">
        Nothing yet. The wallet and the buyer’s report land here when the
        negotiation ends.
      </p>
    );
  }

  // Wrapped rather than a fragment: the panel body puts no space between its
  // children, and these five sit flush against each other without it.
  return (
    <div className="a2a-outcome">
      {/* Divs, not spans: the tile's own rules space the label, the figure and
          the footnote with margins, and a margin on an inline box does nothing
          — stacked full width, the three would run together on one line. */}
      {wallet && (
        <div className="fk-tiles">
          <div className={`fk-tile ${wallet.couponRedeemed > 0 ? 'fk-tile-leaf' : ''}`}>
            <div className="fk-tile-label">Coupon covered</div>
            <div className="fk-tile-value">{rupees(wallet.couponRedeemed)}</div>
          </div>
          <div className="fk-tile fk-tile-amber">
            <div className="fk-tile-label">Cash spent</div>
            <div className="fk-tile-value">{rupees(wallet.cashSpent)}</div>
          </div>
          <div className="fk-tile">
            <div className="fk-tile-label">Cash left</div>
            <div className="fk-tile-value">{rupees(wallet.cashRemaining)}</div>
            <div className="fk-tile-foot">of {rupees(wallet.cashLimit)}</div>
          </div>
        </div>
      )}

      {/* Money moved and then the run fell over. Both halves are news, and the
          error alone would read as "nothing happened". */}
      {finalAfterError && (
        <Alert
          type="warning"
          showIcon
          title="The run ended badly, but not before this"
          description="What follows was assembled from the record, not written by the agent."
        />
      )}

      {orderNumber && (
        <div className={`a2a-verdict ${paid ? 'a2a-verdict-paid' : 'a2a-verdict-owing'}`}>
          <span>Order {orderNumber}</span>
          <strong>{paid ? 'paid' : 'NOT PAID'}</strong>
        </div>
      )}

      {finalText && <p className="fk-prose">{finalText}</p>}

      {error && <Alert type="error" showIcon title={error} />}
    </div>
  );
}
