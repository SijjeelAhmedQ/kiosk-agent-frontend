/**
 * The one place that knows where the consoles live.
 *
 * These screens are separate Vite entries rather than routes in one app —
 * see `vite.config.ts` — so "navigation" here has always meant a plain anchor
 * to a second page, and it still does. Nothing in this file invents a
 * destination: every `href` below is one of the four entries that already
 * existed, taken from the header links this model replaced.
 *
 * `llm` is the newest and the odd one out: it is not an agent's console but the
 * one screen that decides which model *every* agent runs on, so it sits in its
 * own section under the three consoles rather than inside the agents group.
 *
 * Two labels are aliases. `operations` points at the same board as `dashboard`,
 * and `errands` at the same console as `ordering`, because the operator asked
 * for both names in the rail and there is exactly one page behind each pair.
 * `aliasOf` is what keeps that honest: the alias links and highlights nothing,
 * the page it shadows owns the active state, so a page can never light two rows.
 */

/** Which console a page is. Every page declares one; the rail lights that row. */
export type NavKey =
  | 'dashboard'
  | 'ordering'
  | 'a2a'
  | 'delivery'
  | 'llm'
  | 'operations'
  | 'errands';

export interface NavItem {
  key: NavKey;
  label: string;
  /** Emoji, the way every other nav surface in this app draws its icons. */
  icon: string;
  /** One of the four Vite entries. A full page load is the point. */
  href: string;
  /** The `title` a hover gets, and the tooltip the collapsed rail shows. */
  title: string;
  /**
   * Set when this row is a second name for a page another row owns. The owner
   * takes the active state, so `/dashboard.html` lights "Dashboard" and not
   * "Operations" as well.
   */
  aliasOf?: NavKey;
}

/** A row in the rail: either a link, or a disclosure holding links. */
export type NavEntry =
  | { kind: 'item'; item: NavItem }
  | { kind: 'group'; key: string; label: string; icon: string; items: NavItem[] };

export interface NavSection {
  label: string;
  entries: NavEntry[];
}

const DASHBOARD: NavItem = {
  key: 'dashboard',
  label: 'Dashboard',
  icon: '🏠',
  href: '/dashboard.html',
  title: 'Open the operations dashboard',
};

const ORDERING: NavItem = {
  key: 'ordering',
  label: 'Ordering Agent',
  icon: '🤖',
  href: '/',
  title: 'Open the ordering agent’s console',
};

const A2A: NavItem = {
  key: 'a2a',
  label: 'A2A Ordering',
  icon: '🤝',
  href: '/a2a.html',
  title: 'Open the A2A ordering console',
};

const DELIVERY: NavItem = {
  key: 'delivery',
  label: 'Delivery Agent',
  icon: '🛵',
  href: '/foodpanda.html',
  title: 'Open the delivery agent’s board',
};

const LLM: NavItem = {
  key: 'llm',
  label: 'LLM Configuration',
  icon: '🧠',
  href: '/llm.html',
  title: 'Choose the provider and model every agent runs on',
};

export const OPERATIONS: NavItem = {
  key: 'operations',
  label: 'Operations',
  icon: '⚙️',
  href: '/dashboard.html',
  title: 'The operations board — same page as Dashboard',
  aliasOf: 'dashboard',
};

export const ERRANDS: NavItem = {
  key: 'errands',
  label: 'Errands',
  icon: '🧾',
  href: '/',
  title: 'Errands are run from the ordering agent’s console',
  aliasOf: 'ordering',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    entries: [
      { kind: 'item', item: DASHBOARD },
      {
        kind: 'group',
        key: 'agents',
        label: 'AI Agents',
        icon: '🤖',
        items: [ORDERING, A2A, DELIVERY],
      },
      // Parked, not deleted — the operator asked for both names and may ask
      // again. They are exported so that a definition with no live row is not
      // an unused local, which is what `tsc --noEmit` was failing the build on.
      // { kind: 'item', item: OPERATIONS },
      // { kind: 'item', item: ERRANDS },
    ],
  },
  {
    // Its own section rather than a row inside "AI Agents": what it configures
    // is not one of them, it is the brain all three of them share.
    label: 'Configuration',
    entries: [{ kind: 'item', item: LLM }],
  },
];

/** The three agent consoles, flattened — what the collapsed rail draws. */
export const AGENT_ITEMS: NavItem[] = [ORDERING, A2A, DELIVERY];

/**
 * The rail's one action, described by the page that owns it.
 *
 * Deliberately not a route. "New errand" was a button in the ordering and A2A
 * headers that cleared the finished run and re-read the coupons, and it stays
 * that exact handler — the rail only moved where it is pressed. A page with no
 * such handler passes nothing and gets a link to the console that has one.
 */
export interface SidebarAction {
  label?: string;
  icon?: string;
  /** The page's own handler, when it has one. Takes precedence over `href`. */
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  /** Why it is disabled, or where it goes. Always worth saying. */
  title?: string;
}
