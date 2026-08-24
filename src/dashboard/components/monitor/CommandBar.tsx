/**
 * One search box and four filters, above every tab in the control centre.
 *
 * Deliberately *not* per-tab. An operator who narrows the log to the courier and
 * then opens the handover board is still asking about the courier, and a panel
 * that silently widened back to everything when they changed tab would be
 * answering a different question than the one on screen. So the query lives
 * above the tabs and each tab applies it with its own predicate (`ops.ts`).
 *
 * The search covers the fields people actually type: a task id, an order number,
 * an agent's name, a tool, half a remembered sentence — and the stored payload,
 * because a delivery id only ever exists as a JSON value and a search that could
 * not find `DEL-8291` is a search nobody uses twice.
 *
 * Native `<select>` rather than a styled dropdown. This bar is sticky and sits
 * over a scrolling log; a custom menu would need a portal and a scroll listener
 * to stay attached, and it would still open slower than the one the OS ships.
 */

import { ACTORS, FILTERS, type Actor } from '../../monitor';
import { isNarrowed, STATUSES, WINDOWS, type Query } from '../../ops';

interface Props {
  query: Query;
  onQuery: (query: Query) => void;
  /** How many rows the current tab is showing, and out of how many. */
  showing: number;
  total: number;
  /** What the tab calls its rows — "events", "handovers", "calls". */
  noun: string;
}

/** The parties worth offering as a filter, agents first — services get called too. */
const CHOICES: Actor[] = ['ordering', 'buyer', 'merchant', 'dispatcher', 'courier', 'kitchen', 'operator'];

export function CommandBar({ query, onQuery, showing, total, noun }: Props) {
  const set = <K extends keyof Query>(key: K, value: Query[K]) =>
    onQuery({ ...query, [key]: value });

  const narrowed = isNarrowed(query);

  return (
    <div className="fko-bar">
      <label className="fko-find">
        <span className="fko-find-glyph" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          className="fko-find-input"
          value={query.text}
          placeholder="Search tasks, agents, order and request ids, messages, tool calls…"
          onChange={(change) => set('text', change.target.value)}
          aria-label="Search everything the control centre is holding"
        />
        {query.text && (
          <button
            type="button"
            className="fko-find-clear"
            onClick={() => set('text', '')}
            aria-label="Clear the search"
          >
            ⤫
          </button>
        )}
      </label>

      <div className="fko-selects">
        <label className="fko-select">
          <span className="fko-select-label">Agent</span>
          <select
            value={query.agent}
            onChange={(change) => set('agent', change.target.value as Query['agent'])}
          >
            <option value="all">All agents</option>
            {CHOICES.map((actor) => (
              <option key={actor} value={actor}>
                {ACTORS[actor].name}
              </option>
            ))}
          </select>
        </label>

        <label className="fko-select">
          <span className="fko-select-label">Event</span>
          <select
            value={query.kind}
            onChange={(change) => set('kind', change.target.value as Query['kind'])}
          >
            {FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fko-select">
          <span className="fko-select-label">Status</span>
          <select
            value={query.status}
            onChange={(change) => set('status', change.target.value as Query['status'])}
          >
            {STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        <label className="fko-select">
          <span className="fko-select-label">Time</span>
          <select
            value={query.minutes === null ? 'all' : String(query.minutes)}
            onChange={(change) =>
              set('minutes', change.target.value === 'all' ? null : Number(change.target.value))
            }
          >
            {WINDOWS.map((window) => (
              <option
                key={window.label}
                value={window.minutes === null ? 'all' : String(window.minutes)}
              >
                {window.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The count is the honest half of a filter bar: it is how somebody tells
          "nothing matched" apart from "nothing happened". */}
      <p className={`fko-bar-count${narrowed ? ' fko-bar-count-on' : ''}`}>
        <strong>{showing}</strong>
        {showing === total ? ` ${noun}` : ` of ${total} ${noun}`}
      </p>

      {narrowed && (
        <button
          type="button"
          className="fko-reset"
          onClick={() => onQuery({ text: '', agent: 'all', kind: 'all', status: 'all', minutes: null })}
        >
          <span aria-hidden>⤫</span> Clear filters
        </button>
      )}
    </div>
  );
}
