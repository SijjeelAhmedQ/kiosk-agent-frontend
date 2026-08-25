import { createContext, useContext, type ReactNode } from 'react';
import { Sidebar, useSidebarState, type SidebarState } from '@/components/Sidebar';
import type { NavKey, SidebarAction } from '@/nav';
import '@/sidebar.css';

/**
 * The layout every console sits in: the rail on the left, the page on the right.
 *
 * It owns nothing but the rail's own state — collapsed or not, drawer open or
 * not. The page inside it is untouched: each console still renders its own
 * `.fk-shell` with its own header, its own status strip and its own columns,
 * and this wrapper only puts a flex row around it so the content region gets
 * whatever width the rail is not using.
 *
 * The header button that opens the drawer is `SidebarTrigger`, which each
 * console drops into its own header — it has to live in the header row, and it
 * reads the state from here rather than the four pages each keeping their own.
 */

const SidebarContext = createContext<SidebarState | null>(null);

export function AppShell({
  active,
  action,
  children,
}: {
  active: NavKey;
  action?: SidebarAction;
  children: ReactNode;
}) {
  const state = useSidebarState();

  return (
    <SidebarContext.Provider value={state}>
      <div className="fk-app">
        <Sidebar active={active} action={action} state={state} />
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

/**
 * The drawer's handle, for the widths where the rail is an overlay.
 *
 * Rendered by every header and hidden by CSS above 1024px, so the header markup
 * is the same at every width and only the stylesheet decides where the button
 * is real.
 */
export function SidebarTrigger() {
  const state = useContext(SidebarContext);
  if (!state) return null;

  return (
    <button
      type="button"
      className="fk-side-trigger"
      onClick={() => state.setOpen(!state.open)}
      aria-label="Open navigation"
      aria-expanded={state.open}
    >
      <span aria-hidden>☰</span>
    </button>
  );
}
