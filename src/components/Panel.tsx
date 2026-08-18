import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  /**
   * Colours the icon tile when the panel's *state* has a colour.
   *
   * Only for panels whose headline changes with a run — the delivery panel goes
   * amber while an order is riding and green when it lands. A panel that always
   * looks the same has no tone, because a tile that never changes is decoration
   * and teaches the eye to stop reading it.
   */
  tone?: 'amber' | 'leaf' | 'flame';
  /** A line under the title. Room for what the panel is for, not decoration. */
  note?: ReactNode;
  extra?: ReactNode;
  /** Draws the indeterminate bar along the top edge while a run is live. */
  live?: boolean;
  /** Turns the title into a disclosure control that folds the body away. */
  collapsible?: boolean;
  /** Only read on first render; after that the panel remembers its own state. */
  defaultOpen?: boolean;
  /**
   * Remembers open/folded across reloads under this key.
   *
   * Opt-in rather than automatic: a console panel that folds itself back the
   * way you left it last week is a panel whose state you have to re-read every
   * time you open the page. A dashboard is the opposite — it is a document you
   * arrange once and come back to — so only that page passes a key.
   */
  persistKey?: string;
  /**
   * Makes the panel fill the height of the flex column it sits in, so the page
   * never grows past the viewport. Two shapes, because the body is not always
   * the right thing to scroll:
   *
   *   'scroll' — the body is the scroll box
   *   'flex'   — the body is a flex column and a child owns the scroll
   */
  fill?: 'scroll' | 'flex';
  /** Takes only the height it needs, giving the rest to a filling sibling. */
  shrink?: boolean;
  /** Pinned below the body, outside its scroll — where the panel's actions go. */
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * A fold/unfold broadcast for every collapsible panel underneath it.
 *
 * `nonce` is what makes it a *signal* rather than a state: a panel applies a
 * value it has not seen before and then goes back to owning its own, so
 * "collapse all" does not become a lock that stops one section being reopened
 * on its own afterwards. Panels rendered outside a provider never see it, which
 * is why the three consoles are untouched by this.
 */
export interface PanelFold {
  open: boolean;
  nonce: number;
}
export const PanelFoldContext = createContext<PanelFold | null>(null);

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

/**
 * The disclosure chevron. Drawn rather than typed: the glyphs that look like a
 * chevron (⌄ ▾ ˅) sit off the baseline, differ per font and don't take a
 * stroke weight, so none of them line up with the panel's other icons.
 */
function Chevron() {
  return (
    <svg className="fk-caret-glyph" viewBox="0 0 24 24" width="17" height="17" aria-hidden>
      <path
        d="m5.5 9 6.5 6.5L18.5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The surface every section of the page sits on.
 *
 * antd's Card would do most of this, but the header here carries an icon tile,
 * a subtitle and a live bar — enough custom structure that overriding Card
 * costs more than owning the markup.
 */
export function Panel({
  icon,
  title,
  tone,
  note,
  extra,
  live,
  collapsible,
  defaultOpen = true,
  persistKey,
  fill,
  shrink,
  footer,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(() => readStored(persistKey, defaultOpen));
  const bodyId = useId();

  // Remember the arrangement, for the panels that asked to be remembered.
  useEffect(() => {
    if (!collapsible || !persistKey) return;
    try {
      window.localStorage.setItem(STORE_PREFIX + persistKey, open ? '1' : '0');
    } catch {
      /* private mode, quota, a browser with storage switched off — all fine */
    }
  }, [collapsible, persistKey, open]);

  // "Collapse all" / "Expand all", when a page provides one.
  const fold = useContext(PanelFoldContext);
  const seen = useRef(fold?.nonce ?? 0);
  useEffect(() => {
    if (!collapsible || !fold || fold.nonce === seen.current) return;
    seen.current = fold.nonce;
    setOpen(fold.open);
  }, [collapsible, fold]);

  const folded = collapsible === true && !open;
  const toggle = () => setOpen((v) => !v);

  const classes = [
    'fk-panel',
    collapsible ? 'fk-panel-collapsible' : '',
    folded ? 'fk-panel-folded' : '',
    fill ? (shrink ? 'fk-panel-shrink' : 'fk-panel-fill') : '',
    fill === 'scroll' ? 'fk-panel-scrolls' : '',
    fill === 'flex' ? 'fk-panel-flex' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const heading = (
    <>
      <span
        className={`fk-panel-icon${tone ? ` fk-panel-icon-${tone}` : ''}`}
        aria-hidden
      >
        {icon}
      </span>
      <div style={{ minWidth: 0 }}>
        <h2 className="fk-panel-heading">{title}</h2>
        {note && <div className="fk-panel-note">{note}</div>}
      </div>
    </>
  );

  const body = (
    <div id={bodyId} className="fk-panel-body">
      {children}
    </div>
  );

  return (
    <section className={classes}>
      {live && <div className="fk-panel-live" aria-hidden />}

      <header className="fk-panel-head">
        {collapsible ? (
          // The title carries the control rather than the whole header row:
          // `extra` can hold buttons of its own, and those cannot be nested
          // inside this one.
          <button
            type="button"
            className="fk-panel-title fk-panel-disclosure"
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={toggle}
          >
            {heading}
          </button>
        ) : (
          <div className="fk-panel-title">{heading}</div>
        )}

        {extra}

        {collapsible && (
          // The chevron people actually aim for. It repeats the title button, so
          // it stays out of the tab order and out of the accessibility tree
          // rather than announcing the same state twice.
          <button
            type="button"
            className="fk-panel-caret"
            onClick={toggle}
            tabIndex={-1}
            aria-hidden
          >
            <Chevron />
          </button>
        )}
      </header>

      {collapsible ? (
        // Height animates through grid rows, 1fr → 0fr, because `auto` is not
        // an animatable length. `inert` is what keeps a folded panel's contents
        // off the tab order — the row is 0px high but the markup is still there.
        <div className="fk-panel-fold" inert={folded || undefined}>
          {body}
        </div>
      ) : (
        body
      )}

      {/* Outside the fold as well as outside the body: a footer holds the
          panel's actions, and those should not fold away with its contents. */}
      {footer && <div className="fk-panel-foot">{footer}</div>}
    </section>
  );
}
