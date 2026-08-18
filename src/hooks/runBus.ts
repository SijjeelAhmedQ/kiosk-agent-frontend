/**
 * The ordering agent's run, re-broadcast onto the shared bus.
 *
 * The errand server on 8100 streams a run only to the client that started it,
 * keyed by a run id that is never listed anywhere — so this console is the only
 * thing in the building that can see what the agent is doing. The operations
 * dashboard cannot, and starting a second run from it just to watch would be a
 * different run.
 *
 * So this file forwards, and only forwards. Every call below happens on an
 * event that has already arrived from the service's own `EventSource`; nothing
 * here fabricates a step, infers one that was not sent, or fires on a timer.
 * Turn the console off and the dashboard goes quiet, which is the correct
 * behaviour — a monitoring screen that keeps talking after the thing it watches
 * has stopped is worse than a blank one.
 *
 * Kept out of `useAgentRun` rather than inlined into it, because that hook is
 * the run's state machine and this is a tap on the wire. Mixing them would put
 * a `publish` inside a `setState` updater, which React would then call twice
 * under StrictMode and log everything on this floor in duplicate.
 */

import { publish, type Actor, type BusInput, type BusKind } from '@/shared/agentBus';
import { toolLabel } from '@/toolLabels';
import type { AgentEvent, StartAgentRunInput, ToolDetail } from '@/types';

/**
 * Which service a tool actually reaches out to.
 *
 * This is the difference between "the agent did something" and "the agent
 * called Friends Kitchen" — and on a board whose whole job is showing who talked
 * to whom, that is the entire content of the row. Anything unlisted is assumed
 * to be the restaurant, which is where all but two of the agent's tools go.
 */
const REACHES: Record<string, Actor> = {
  arrange_delivery: 'courier',
  check_delivery: 'courier',
};

/** The tools that mean an order exists, or that money moved. */
const ORDER_TOOLS = new Set(['place_order', 'authorize_payment', 'pay', 'get_order']);
const DELIVERY_TOOLS = new Set(['arrange_delivery', 'check_delivery']);

function kindOf(name: string): BusKind {
  if (DELIVERY_TOOLS.has(name)) return 'delivery';
  if (ORDER_TOOLS.has(name)) return 'order';
  return 'tool_call';
}

/**
 * A tool's return value, small enough to put in a log row.
 *
 * `browse_menu` can hand back a hundred products and the bus keeps four hundred
 * events; storing the lot would blow a localStorage quota inside one busy
 * afternoon. The expandable row wants a shape and a few fields, not the payload.
 */
function preview(detail: ToolDetail | null | undefined): string | undefined {
  if (!detail) return undefined;
  let text: string;
  try {
    text = JSON.stringify(detail);
  } catch {
    return undefined;
  }
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

/** The order number a tool result carries, if it carries one. */
function orderNumberIn(detail: ToolDetail | null | undefined): string | null {
  const value = detail?.orderNumber;
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * One run's tap. Held for as long as the run is, so the ref can improve.
 *
 * `ref` starts as a short run id and becomes the order number the moment the
 * agent's tools mention one — every event already published keeps the id it was
 * published with, and the dashboard groups by `correlationId` rather than by
 * `ref` for exactly that reason.
 */
export function runTap(runId: string, input: StartAgentRunInput) {
  let ref = runId.slice(0, 8);

  const emit = (event: Omit<BusInput, 'channel' | 'correlationId' | 'ref'>) =>
    publish({ ...event, channel: 'ordering', correlationId: runId, ref });

  /** The name of the tool a result belongs to — the stream only sends the id. */
  const toolNames = new Map<string, string>();

  emit({
    from: 'operator',
    to: 'ordering',
    kind: 'run_started',
    title: 'Errand handed to the ordering agent',
    detail: input.instruction,
    status: 'active',
    data: {
      mode: input.mode,
      cashLimit: input.cashLimit,
      coupon: input.couponCode ?? null,
      delivering: Boolean(input.userLocation),
    },
  });

  return (event: AgentEvent): void => {
    switch (event.type) {
      case 'status':
        // Only the queue is worth a row. 'running' is implied by the tool calls
        // that follow it, and 'done' arrives again as `final`.
        if (event.status === 'queued') {
          emit({
            from: 'ordering',
            to: null,
            kind: 'waiting',
            title: 'Waiting its turn — the agent runs one errand at a time',
            status: 'waiting',
          });
        }
        break;

      case 'tool': {
        toolNames.set(event.toolUseId, event.name);
        const { icon, label } = toolLabel(event.name);
        emit({
          from: 'ordering',
          to: REACHES[event.name] ?? 'kitchen',
          kind: kindOf(event.name),
          title: `${icon} ${label}`,
          toolName: event.name,
          status: 'processing',
        });
        break;
      }

      case 'tool_result': {
        const name = toolNames.get(event.toolUseId) ?? 'unknown';
        const found = orderNumberIn(event.detail);
        if (found) ref = found;

        emit({
          from: REACHES[name] ?? 'kitchen',
          to: 'ordering',
          kind: 'tool_result',
          title: event.summary || (event.ok ? 'Answered' : 'Refused'),
          detail: preview(event.detail),
          toolName: name,
          ok: event.ok,
          status: event.ok ? 'done' : 'error',
        });
        break;
      }

      case 'location':
        emit({
          from: 'operator',
          to: 'ordering',
          kind: 'location',
          title: `Delivering to ${event.userLocation.label ?? 'the pinned location'}`,
          detail:
            `Nearest branch: ${event.restaurant.name}` +
            (event.distanceKm === null ? '' : ` · ${event.distanceKm.toFixed(1)} km away`) +
            ` · courier: ${event.deliveryService}`,
          status: 'done',
          data: {
            latitude: event.userLocation.latitude,
            longitude: event.userLocation.longitude,
            branch: event.restaurant.name,
            distanceKm: event.distanceKm,
          },
        });
        break;

      case 'browser':
        emit({
          from: 'ordering',
          to: 'kitchen',
          kind: 'handshake',
          title:
            event.state === 'opened'
              ? 'Opened a browser on Friends Kitchen'
              : 'Closed the browser',
          status: event.state === 'opened' ? 'active' : 'done',
        });
        break;

      case 'text':
        // Streamed token by token. Publishing each one would put a thousand
        // one-character rows on the bus; the whole of it arrives with `final`.
        break;

      case 'final':
        emit({
          from: 'ordering',
          to: 'operator',
          kind: 'run_finished',
          title: 'Errand finished',
          detail: event.text,
          status: 'done',
          ok: true,
          data: {
            cashSpent: event.wallet.cashSpent,
            cashRemaining: event.wallet.cashRemaining,
            coupon: event.wallet.couponCode,
          },
        });
        break;

      case 'error':
        emit({
          from: 'ordering',
          to: 'operator',
          kind: 'error',
          title: 'The errand failed',
          detail: event.message,
          status: 'error',
          ok: false,
        });
        break;

      case 'end':
        break;
    }
  };
}
