/**
 * The whole of API usage on the board: one chip, two numbers, and a door.
 *
 * Everything this feature knows lives in a drawer, and this is deliberately the
 * only trace of it out here. The rule it follows is the one the dashboard
 * already follows everywhere else: the board answers what is happening on the
 * floor, and anything that is not that has to earn its pixels by being *asked
 * for*. Six cost tiles across the top would push the live count and the
 * assignment table below the fold to tell an operator something they need to
 * know once a shift.
 *
 * So the chip carries exactly what a glance is worth — tokens and money for the
 * range the drawer is set to — with the tilde that says every figure behind it
 * is an estimate. Somebody who wants more presses it.
 */

import { money, tokenCount, type Totals } from '../../usage';

export function UsageChip({
  totals,
  rangeLabel,
  open,
  onOpen,
}: {
  totals: Totals;
  /** What the drawer is currently scoped to, so the chip cannot mean something else. */
  rangeLabel: string;
  open: boolean;
  onOpen: () => void;
}) {
  const quiet = totals.requests === 0;

  return (
    <button
      type="button"
      className={`fku-chip${open ? ' fku-chip-on' : ''}`}
      onClick={onOpen}
      aria-expanded={open}
      aria-haspopup="dialog"
      title={
        quiet
          ? 'API usage & billing — nothing recorded in this range yet'
          : `API usage & billing — estimated across ${rangeLabel}`
      }
    >
      <span className="fku-chip-glyph" aria-hidden>
        📊
      </span>
      <span className="fku-chip-text">
        <span className="fku-chip-label">API usage</span>
        <span className="fku-chip-figures">
          {quiet ? (
            <span className="fku-chip-quiet">nothing yet</span>
          ) : (
            <>
              <span className="fku-chip-tokens">{tokenCount(totals.tokens)} tokens</span>
              <span className="fku-chip-dot" aria-hidden>
                ·
              </span>
              <span className="fku-chip-cost">≈{money(totals.costUsd)}</span>
            </>
          )}
        </span>
      </span>
      <span className="fku-chip-arrow" aria-hidden>
        →
      </span>
    </button>
  );
}
