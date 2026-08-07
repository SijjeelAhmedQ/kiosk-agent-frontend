import { useId, useState, type ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
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
  note,
  extra,
  live,
  collapsible,
  defaultOpen = true,
  fill,
  shrink,
  footer,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
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
      <span className="fk-panel-icon" aria-hidden>
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
