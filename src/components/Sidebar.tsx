import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Tooltip } from 'antd';
import {
  AGENT_ITEMS,
  NAV_SECTIONS,
  type NavItem,
  type NavKey,
  type SidebarAction,
} from '@/nav';

/**
 * The left rail — one component, shared by all four consoles.
 *
 * It replaces the row of anchors each header used to carry, and it is the same
 * kind of thing they were: plain `<a>` elements to the four Vite entries, so
 * middle-click, "open in new tab", the back button and deep links all keep
 * working exactly as before. There is no router here and this file does not add
 * one; `src/nav.ts` holds the destinations and nothing else does.
 *
 * Three states, in one component:
 *
 *   expanded   the desktop default — icon, label, and the agents disclosure
 *   collapsed  a 76px rail of icons with tooltips, remembered across pages
 *   drawer     under 1024px it slides in over the content from a header button
 *
 * The collapsed and expanded states are remembered in localStorage rather than
 * in React, because these are four separate pages: without that, every
 * navigation would throw the rail back open.
 */

const COLLAPSE_KEY = 'fk-sidebar-collapsed';
const AGENTS_KEY = 'fk-sidebar-agents';

function read(key: string, fallback: boolean): boolean {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === '1';
  } catch {
    // Private mode, no storage. The default is a perfectly good answer.
    return fallback;
  }
}

function write(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* nothing to do — the rail just forgets */
  }
}

/**
 * Where an untouched rail opens as icons rather than expanded.
 *
 * Not a style choice. Every column layout on this floor is drawn against the
 * viewport — the errand console goes single-column at 1100px, both three-column
 * consoles step down at 1280px, the dashboard's split at 1180px — and those
 * numbers were chosen when the page had the whole width. A 268px rail on a
 * 1366px laptop takes a fifth of it away without any of those queries noticing,
 * which would squeeze the columns rather than fold them. A 76px rail costs
 * almost nothing, so under this width that is what an operator gets until they
 * say otherwise. Above it the full rail fits with room to spare.
 */
const ROOMY = '(min-width: 1440px)';

function defaultCollapsed(): boolean {
  try {
    return !window.matchMedia(ROOMY).matches;
  } catch {
    return false;
  }
}

/** Remembered across page loads, since each console is its own page. */
export function useSidebarState(): SidebarState {
  // The width is only the *default*: once the operator has chosen, their choice
  // is what is read back, at every width.
  const [collapsed, setCollapsed] = useState(() => read(COLLAPSE_KEY, defaultCollapsed()));
  const [open, setOpen] = useState(false);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      write(COLLAPSE_KEY, !prev);
      return !prev;
    });
  }, []);

  // Escape closes the drawer, the way every overlay on this floor does.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return { collapsed, toggleCollapsed, open, setOpen };
}

export interface SidebarState {
  collapsed: boolean;
  toggleCollapsed: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

/** A tooltip only when the label is not on screen — no hover noise otherwise. */
function Hint({
  when,
  label,
  children,
}: {
  when: boolean;
  label: string;
  children: ReactElement;
}) {
  if (!when) return children;
  return (
    <Tooltip title={label} placement="right" mouseEnterDelay={0.15}>
      {children}
    </Tooltip>
  );
}

function Row({
  item,
  active,
  collapsed,
  sub = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  sub?: boolean;
  onNavigate: () => void;
}) {
  return (
    <Hint when={collapsed} label={item.label}>
      <a
        className={`fk-side-item${sub ? ' fk-side-item-sub' : ''}${active ? ' fk-side-on' : ''}`}
        href={item.href}
        title={collapsed ? undefined : item.title}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
      >
        <span className="fk-side-ico" aria-hidden>
          {item.icon}
        </span>
        <span className="fk-side-text">{item.label}</span>
      </a>
    </Hint>
  );
}

export function Sidebar({
  active,
  action,
  state,
}: {
  /** Which console this page is. Aliases never match, so only one row lights. */
  active: NavKey;
  action?: SidebarAction;
  state: SidebarState;
}) {
  const { collapsed, toggleCollapsed, open, setOpen } = state;

  const activeIsAgent = AGENT_ITEMS.some((item) => item.key === active);
  // Open by default when the page you are on is inside it — a disclosure that
  // hides the row you are standing on is a disclosure that has to be opened
  // before it tells you anything.
  const [agentsOpen, setAgentsOpen] = useState(() => read(AGENTS_KEY, true) || activeIsAgent);

  const toggleAgents = useCallback(() => {
    setAgentsOpen((prev) => {
      write(AGENTS_KEY, !prev);
      return !prev;
    });
  }, []);

  // Following a link closes the drawer. The page load would anyway, but the
  // rail should not sit open over the old page while the new one loads.
  const close = useCallback(() => setOpen(false), [setOpen]);

  const actionLabel = action?.label ?? 'New Errand';
  const actionIcon = action?.icon ?? '➕';
  const actionTitle =
    action?.title ?? 'Start a new errand on the ordering agent’s console';

  return (
    <>
      {/* Under 1024px the rail is an overlay, so it needs something to close
          against. Inert and invisible above that width. */}
      <div
        className="fk-side-scrim"
        data-open={open ? 'true' : 'false'}
        onClick={close}
        aria-hidden
      />

      <aside
        className="fk-side"
        data-collapsed={collapsed ? 'true' : 'false'}
        data-open={open ? 'true' : 'false'}
        aria-label="Sidebar"
      >
        <div className="fk-side-brand">
          <img
            className="fk-side-mark"
            src="/logo.png"
            alt=""
            width={38}
            height={38}
            aria-hidden
          />
          <span className="fk-side-brand-text">
            <span className="fk-side-brand-name">Friends Kitchen</span>
            <span className="fk-side-brand-sub">
              Ordering agent — send it out with a coupon and a limit
            </span>
          </span>

          {/* The drawer's own way out, for the width where there is no scrim
              worth hunting for. Hidden on desktop. */}
          <button
            type="button"
            className="fk-side-close"
            onClick={close}
            aria-label="Close navigation"
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        <nav className="fk-side-nav" aria-label="Consoles">
          {NAV_SECTIONS.map((section) => (
            <div className="fk-side-section" key={section.label}>
              <p className="fk-side-label">{section.label}</p>

              {section.entries.map((entry) => {
                if (entry.kind === 'item') {
                  return (
                    <Row
                      key={entry.item.key}
                      item={entry.item}
                      active={entry.item.key === active && !entry.item.aliasOf}
                      collapsed={collapsed}
                      onNavigate={close}
                    />
                  );
                }

                // Collapsed, the disclosure has nothing to disclose — a label
                // it cannot show, hiding rows that are the whole point of the
                // rail. So it flattens to its children, each with a tooltip.
                if (collapsed) {
                  return (
                    <div className="fk-side-flat" key={entry.key}>
                      {entry.items.map((item) => (
                        <Row
                          key={item.key}
                          item={item}
                          active={item.key === active}
                          collapsed
                          onNavigate={close}
                        />
                      ))}
                    </div>
                  );
                }

                const holdsActive = entry.items.some((item) => item.key === active);

                return (
                  <div className="fk-side-group" key={entry.key}>
                    <button
                      type="button"
                      className={`fk-side-item fk-side-head${holdsActive ? ' fk-side-holds' : ''}`}
                      aria-expanded={agentsOpen}
                      onClick={toggleAgents}
                    >
                      <span className="fk-side-ico" aria-hidden>
                        {entry.icon}
                      </span>
                      <span className="fk-side-text">{entry.label}</span>
                      <span
                        className="fk-side-caret"
                        data-open={agentsOpen ? 'true' : 'false'}
                        aria-hidden
                      >
                        ⌄
                      </span>
                    </button>

                    <div className="fk-side-sub" data-open={agentsOpen ? 'true' : 'false'}>
                      <div className="fk-side-sub-inner">
                        {entry.items.map((item) => (
                          <Row
                            key={item.key}
                            item={item}
                            active={item.key === active}
                            collapsed={false}
                            sub
                            onNavigate={close}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div className="fk-side-section">
            <p className="fk-side-label">Actions</p>

            <Hint when={collapsed} label={actionLabel}>
              {action?.onClick ? (
                // `aria-disabled` rather than `disabled`: a disabled control
                // takes no pointer events, which would swallow the tooltip
                // exactly when the rail is collapsed and the tooltip is the
                // only thing that can say why the row is dim.
                <button
                  type="button"
                  className="fk-side-item fk-side-action"
                  onClick={() => {
                    if (action.disabled) return;
                    close();
                    action.onClick?.();
                  }}
                  aria-disabled={action.disabled || undefined}
                  data-off={action.disabled ? 'true' : undefined}
                  title={actionTitle}
                >
                  <span className="fk-side-ico" aria-hidden>
                    {actionIcon}
                  </span>
                  <span className="fk-side-text">{actionLabel}</span>
                </button>
              ) : (
                <a
                  className="fk-side-item fk-side-action"
                  href={action?.href ?? '/'}
                  title={collapsed ? undefined : actionTitle}
                  onClick={close}
                >
                  <span className="fk-side-ico" aria-hidden>
                    {actionIcon}
                  </span>
                  <span className="fk-side-text">{actionLabel}</span>
                </a>
              )}
            </Hint>
          </div>
        </nav>

        {/* The collapse control lives at the foot rather than in the brand row:
            it is housekeeping, not navigation, and it should not be the first
            thing a pointer lands on. Hidden in drawer mode, where the rail has
            only two states and the scrim is the way out of one of them. */}
        <div className="fk-side-foot">
          <Hint when={collapsed} label="Expand sidebar">
            <button
              type="button"
              className="fk-side-collapse"
              onClick={toggleCollapsed}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? undefined : 'Collapse sidebar'}
            >
              <span className="fk-side-ico" aria-hidden>
                {collapsed ? '»' : '«'}
              </span>
              <span className="fk-side-text">Collapse</span>
            </button>
          </Hint>
        </div>
      </aside>
    </>
  );
}
