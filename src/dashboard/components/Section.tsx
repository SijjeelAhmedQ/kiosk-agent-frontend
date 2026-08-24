/**
 * The surface every section of the dashboard sits on — antd's `Collapse`, worn
 * as a card.
 *
 * The three consoles keep `@/components/Panel`; this page does not, and the
 * reason is the fold. A dashboard is a document somebody arranges once and comes
 * back to, so every section here is collapsible, remembers how it was left, and
 * answers "collapse all" — and antd's Collapse already owns the disclosure
 * semantics, the height animation and the arrow. What it does not own is the
 * header this page needs (an icon tile, a subtitle, a live marker), so that is
 * built as the panel's `label` and the surface is dressed as a card in
 * `antd.css`. One component, rather than a card wrapped around a collapse
 * wrapped around a card.
 *
 * `PanelFoldContext` is shared with `Panel` on purpose: the page broadcasts one
 * fold signal and both kinds of surface answer it, so "expand all" cannot end up
 * meaning two different things on one screen.
 */

import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Collapse } from 'antd';
import { PanelFoldContext } from '@/components/Panel';

interface Props {
  icon: ReactNode;
  title: string;
  /** Colours the icon tile when the section's *state* has a colour. */
  tone?: 'amber' | 'leaf' | 'flame';
  /** A line under the title. Room for what the section is for, not decoration. */
  note?: ReactNode;
  /** Sits in the header, right of the title. Clicks there never fold the panel. */
  extra?: ReactNode;
  /** Draws the processing badge beside the title while something is running. */
  live?: boolean;
  /** Only read on first render; after that the section remembers its own state. */
  defaultOpen?: boolean;
  /** Remembers open/folded across reloads under this key. */
  persistKey?: string;
  className?: string;
  children: ReactNode;
}

const STORE_PREFIX = 'fk.panel.open.';

/** Storage is a nicety here, so every read and write is allowed to fail. */
function readStored(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback;
  }
}

export function Section({
  icon,
  title,
  tone,
  note,
  extra,
  live,
  defaultOpen = true,
  persistKey,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(() => readStored(persistKey, defaultOpen));

  // Remember the arrangement, for the sections that asked to be remembered.
  useEffect(() => {
    if (!persistKey) return;
    try {
      window.localStorage.setItem(STORE_PREFIX + persistKey, open ? '1' : '0');
    } catch {
      /* private mode, quota, a browser with storage switched off — all fine */
    }
  }, [persistKey, open]);

  // "Collapse all" / "Expand all". A broadcast rather than a lock: the section
  // applies a value it has not seen before and then owns its own state again.
  const fold = useContext(PanelFoldContext);
  const seen = useRef(fold?.nonce ?? 0);
  useEffect(() => {
    if (!fold || fold.nonce === seen.current) return;
    seen.current = fold.nonce;
    setOpen(fold.open);
  }, [fold]);

  const label = (
    <div className="fkd-sec-head">
      <span className={`fk-panel-icon${tone ? ` fk-panel-icon-${tone}` : ''}`} aria-hidden>
        {icon}
      </span>
      <div className="fkd-sec-headtext">
        <h2 className="fk-panel-heading">
          {title}
          {live && (
            <Badge status="processing" text="live" className="fkd-sec-live" />
          )}
        </h2>
        {note && <div className="fk-panel-note">{note}</div>}
      </div>
    </div>
  );

  return (
    <Collapse
      className={`fkd-sec${live ? ' fkd-sec-live-on' : ''}${className ? ` ${className}` : ''}`}
      bordered={false}
      expandIconPosition="end"
      activeKey={open ? ['body'] : []}
      onChange={(keys) => setOpen((Array.isArray(keys) ? keys : [keys]).length > 0)}
      items={[
        {
          key: 'body',
          label,
          children,
          // Anything the header carries is a control of its own, so a click on
          // it must not also fold the section it sits in.
          extra: extra ? (
            <span
              className="fkd-sec-extra"
              onClick={(event) => event.stopPropagation()}
              role="presentation"
            >
              {extra}
            </span>
          ) : undefined,
        },
      ]}
    />
  );
}
