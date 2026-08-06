import type { ReactNode } from 'react';

interface Props {
  icon: ReactNode;
  title: string;
  /** A line under the title. Room for what the panel is for, not decoration. */
  note?: ReactNode;
  extra?: ReactNode;
  /** Draws the indeterminate bar along the top edge while a run is live. */
  live?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The surface every section of the page sits on.
 *
 * antd's Card would do most of this, but the header here carries an icon tile,
 * a subtitle and a live bar — enough custom structure that overriding Card
 * costs more than owning the markup.
 */
export function Panel({ icon, title, note, extra, live, className, children }: Props) {
  return (
    <section className={`fk-panel${className ? ` ${className}` : ''}`}>
      {live && <div className="fk-panel-live" aria-hidden />}

      <header className="fk-panel-head">
        <div className="fk-panel-title">
          <span className="fk-panel-icon" aria-hidden>
            {icon}
          </span>
          <div style={{ minWidth: 0 }}>
            <h2 className="fk-panel-heading">{title}</h2>
            {note && <div className="fk-panel-note">{note}</div>}
          </div>
        </div>
        {extra}
      </header>

      <div className="fk-panel-body">{children}</div>
    </section>
  );
}
