import type { Amount, ArtifactData } from '../types';

/**
 * A quote or a receipt, drawn as a till slip.
 *
 * These are the only rows in the transcript that carry money, and that is the
 * point of drawing them differently from the sentences around them: the two
 * agents talk about the price in prose, but what they are actually agreeing on
 * is this. If the words and the slip ever disagree, the slip is what happened.
 *
 * Every figure is rendered from the service's own `text` — never formatted
 * here. The wire carries `{amount, text}` for exactly this reason, and a second
 * formatter in the browser is a second chance to write `$10.93`.
 */

interface Props {
  name: 'quote' | 'receipt';
  data: ArtifactData;
}

/** The heading, which has to distinguish three things that look alike. */
function label(name: 'quote' | 'receipt', data: ArtifactData): [string, string] {
  if (name === 'receipt') return ['Receipt', 'paid'];
  if (data.couponCode) return ['Revised quote', 'coupon applied'];
  if (data.kind === 'firm') return ['Firm quote', `order ${data.orderNumber ?? ''}`.trim()];
  return ['Estimate', 'not yet committed'];
}

function Row({
  label: text,
  value,
  strong,
  good,
}: {
  label: string;
  value?: Amount;
  strong?: boolean;
  good?: boolean;
}) {
  if (!value) return null;
  const classes = ['a2a-slip-row', strong ? 'a2a-slip-row-strong' : '', good ? 'a2a-slip-row-good' : '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes}>
      <span>{text}</span>
      <span className="a2a-amount">{value.text}</span>
    </div>
  );
}

export function QuoteCard({ name, data }: Props) {
  const [title, tag] = label(name, data);
  const receipt = name === 'receipt';

  return (
    <article className={`a2a-slip ${receipt ? 'a2a-slip-paid' : ''}`}>
      <header className="a2a-slip-head">
        <span className="a2a-slip-title">{title}</span>
        {tag && <span className="a2a-slip-tag">{tag}</span>}
      </header>

      {data.lines && data.lines.length > 0 && (
        <ul className="a2a-slip-lines">
          {data.lines.map((line, index) => (
            <li key={line.lineId ?? `${line.name}-${index}`}>
              <span className="a2a-slip-item">
                {line.name}
                {line.quantity > 1 && <em> × {line.quantity}</em>}
                {line.isMeal && <span className="fk-chip fk-chip-sm">meal</span>}
              </span>
              <span className="a2a-amount">{line.lineTotal.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="a2a-slip-sums">
        <Row label="Subtotal" value={data.subtotal} />
        <Row label={data.estimatedTax ? 'Tax (estimated)' : 'Tax'} value={data.tax ?? data.estimatedTax} />
        <Row label="Coupon" value={data.couponDiscount} good />
        <Row
          label={receipt ? 'Charged' : data.kind === 'estimate' ? 'Estimated total' : 'To pay'}
          value={receipt ? data.charged : (data.amountDue ?? data.estimatedTotal ?? data.total)}
          strong
        />
      </div>

      {data.remainingCouponBalance && data.remainingCouponBalance.amount > 0 && (
        <p className="a2a-slip-note">
          Coupon has {data.remainingCouponBalance.text} left for next time.
        </p>
      )}
      {data.transactionRef && (
        <p className="a2a-slip-ref">{data.transactionRef}</p>
      )}
      {!receipt && data.note && <p className="a2a-slip-note">{data.note}</p>}
    </article>
  );
}
