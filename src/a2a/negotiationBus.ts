/**
 * The buyer and the merchant, re-broadcast onto the shared bus.
 *
 * This is the one genuinely agent-to-agent conversation on the floor: two
 * models, each with its own tools, talking to each other over the A2A protocol
 * until they either agree a price or do not. The operations dashboard's
 * conversation view is built almost entirely out of what this file forwards.
 *
 * Same rule as `src/hooks/runBus.ts`, and it is worth repeating because this is
 * the file where it would be most tempting to break it: **nothing here invents a
 * turn.** Every `publish` below sits directly on an event the A2A service sent.
 * A negotiation the console did not witness does not appear on the dashboard,
 * and a dashboard showing an empty conversation while the desk is busy is
 * telling the truth — it means nobody has this console open.
 *
 * The one thing this file adds that the wire does not carry is *direction*. The
 * service says "the buyer said this"; a monitoring board needs "the buyer said
 * this **to the merchant**", because the arrow is what makes a transcript into a
 * conversation. The mapping is not a guess: on this protocol the buyer's turns
 * go to the merchant and the merchant's come back, and a tool call goes to
 * whatever the tool reaches — the restaurant for a menu, the courier for a
 * handover.
 */

import { publish, type Actor, type BusKind, type BusInput } from '@/shared/agentBus';
import type { A2AEvent, ArtifactData, Speaker, StartA2ARunInput } from './types';

/** The two negotiators, in the bus's vocabulary. */
const SIDE: Record<Speaker, Actor> = { buyer: 'buyer', merchant: 'merchant' };

/** Who the other one is — the `to` of every turn. */
const FACING: Record<Speaker, Actor> = { buyer: 'merchant', merchant: 'buyer' };

/**
 * Where a tool call actually lands.
 *
 * The buyer has no reach outside the conversation: its tools are about its own
 * wallet and its own decisions, so they are drawn as the buyer working alone
 * rather than as a call to somewhere. The merchant's tools are the ones that
 * touch the world — the restaurant's API, and the courier at the end.
 */
const REACHES: Record<string, Actor> = {
  arrange_delivery: 'courier',
  check_delivery: 'courier',
  hand_to_delivery: 'courier',
};

const ORDER_TOOLS = new Set([
  'place_order',
  'authorize_payment',
  'pay',
  'confirm_order',
  'get_order',
]);

function toolKind(name: string): BusKind {
  if (name in REACHES) return 'delivery';
  if (ORDER_TOOLS.has(name)) return 'order';
  return 'tool_call';
}

/** A tool name in words. The A2A service names its tools for the model. */
function words(name: string): string {
  return name.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase());
}

/**
 * A quote or a receipt, in one line.
 *
 * The artifact itself is the interesting object and the console renders it in
 * full; on the bus it is a headline plus the numbers that make the negotiation
 * legible — what was offered, what it came to, whether a coupon moved.
 */
function artifactLine(name: 'quote' | 'receipt', data: ArtifactData): string {
  const total = data.total?.text ?? data.estimatedTotal?.text ?? data.amountDue?.text;
  const items = data.itemCount ?? data.lines?.length ?? null;
  const parts = [
    name === 'quote' ? 'Quoted' : 'Receipt',
    items === null ? null : `${items} ${items === 1 ? 'item' : 'items'}`,
    total ?? null,
    data.couponCode ? `coupon ${data.couponCode}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

/** JSON small enough for a log row to carry. */
function preview(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return undefined;
  }
  return text.length > 900 ? `${text.slice(0, 900)}…` : text;
}

/**
 * One negotiation's tap. Returns the forwarder the hook feeds every event to.
 *
 * `ref` upgrades from the run id to the order number as soon as the merchant
 * mentions one, for the same reason the ordering console's tap does: an
 * operator scanning the board recognises `FK-1043`, not `9f2c81a0`.
 */
export function negotiationTap(runId: string, input: StartA2ARunInput) {
  let ref = runId.slice(0, 8);

  const emit = (event: Omit<BusInput, 'channel' | 'correlationId' | 'ref'>) =>
    publish({ ...event, channel: 'a2a', correlationId: runId, ref });

  const toolNames = new Map<string, { name: string; speaker: Speaker }>();

  emit({
    from: 'operator',
    to: 'buyer',
    kind: 'run_started',
    title: 'Negotiation opened',
    detail: input.instruction,
    status: 'active',
    data: {
      cashLimit: input.cashLimit,
      coupon: input.couponCode ?? null,
      delivering: Boolean(input.userLocation),
    },
  });

  return (event: A2AEvent): void => {
    switch (event.type) {
      case 'status':
        if (event.status === 'queued') {
          emit({
            from: 'buyer',
            to: null,
            kind: 'waiting',
            title: 'Queued — the desk runs one negotiation at a time',
            status: 'waiting',
          });
        }
        break;

      case 'discovery':
        // The A2A handshake proper: one agent reads the other's card before it
        // says a word. This is the row that answers "who did it even find".
        emit({
          from: SIDE[event.speaker],
          to: FACING[event.speaker],
          kind: 'handshake',
          title: `Found ${event.name}`,
          detail:
            event.skills.length > 0
              ? `Skills offered: ${event.skills.join(', ')}`
              : 'No skills advertised.',
          status: 'done',
          data: { url: event.url, skills: event.skills },
        });
        break;

      case 'merchant_task':
        emit({
          from: 'buyer',
          to: 'merchant',
          kind: 'handshake',
          title: 'Opened a task with the merchant',
          detail: `Task ${event.taskId}`,
          status: 'active',
          data: { taskId: event.taskId },
        });
        break;

      case 'message':
        if (!event.text.trim()) break;
        emit({
          from: SIDE[event.speaker],
          to: FACING[event.speaker],
          kind: 'message',
          title: event.text.trim(),
          status: 'active',
          at: typeof event.ts === 'number' ? event.ts : undefined,
          data: event.data && event.data.length > 0 ? { parts: event.data.length } : undefined,
        });
        break;

      case 'artifact': {
        if (event.data.orderNumber) ref = event.data.orderNumber;
        emit({
          from: 'merchant',
          to: 'buyer',
          kind: event.name === 'receipt' ? 'order' : 'artifact',
          title: artifactLine(event.name, event.data),
          detail: preview(event.data),
          status: 'done',
          ok: true,
          at: typeof event.ts === 'number' ? event.ts : undefined,
          data: { artifact: event.name, orderNumber: event.data.orderNumber ?? null },
        });
        break;
      }

      case 'tool':
        toolNames.set(event.toolUseId, { name: event.name, speaker: event.speaker });
        emit({
          from: SIDE[event.speaker],
          to: REACHES[event.name] ?? (event.speaker === 'merchant' ? 'kitchen' : null),
          kind: toolKind(event.name),
          title: words(event.name),
          toolName: event.name,
          status: 'processing',
        });
        break;

      case 'tool_result': {
        const call = toolNames.get(event.toolUseId);
        const name = call?.name ?? 'unknown';
        const speaker = call?.speaker ?? 'merchant';
        const from = REACHES[name] ?? (speaker === 'merchant' ? 'kitchen' : SIDE[speaker]);

        emit({
          from,
          to: SIDE[speaker],
          kind: 'tool_result',
          title: event.summary || (event.ok ? 'Answered' : 'Refused'),
          detail: preview(event.detail),
          toolName: name,
          ok: event.ok,
          status: event.ok ? 'done' : 'error',
        });

        // The handover rides in on the payment — see `useNegotiation.ts`, which
        // reads it the same way. It is worth its own row because "the order was
        // paid for" and "a courier has it" are different facts, and the second
        // one is the one that can quietly not happen.
        const handed = (event.detail as { delivery?: { ok?: boolean; jobId?: string; status?: string; error?: string } } | null)?.delivery;
        if (handed && typeof handed.ok === 'boolean') {
          emit({
            from: 'merchant',
            to: 'courier',
            kind: handed.ok ? 'delivery' : 'error',
            title: handed.ok
              ? `Handed to the courier — ${handed.status ?? 'requested'}`
              : 'The courier would not take it',
            detail: handed.ok ? `Job ${handed.jobId ?? 'unknown'}` : (handed.error ?? undefined),
            ok: handed.ok,
            status: handed.ok ? 'done' : 'error',
            data: { jobId: handed.jobId ?? null },
          });
        }
        break;
      }

      case 'final':
        if (event.orderNumber) ref = event.orderNumber;
        emit({
          from: 'buyer',
          to: 'operator',
          kind: 'run_finished',
          title: event.paid ? 'Negotiation settled — paid' : 'Negotiation ended without a purchase',
          detail: event.text,
          ok: !event.afterError,
          status: event.afterError ? 'error' : 'done',
          data: {
            paid: event.paid === true,
            orderNumber: event.orderNumber ?? null,
            cashSpent: event.wallet.cashSpent,
            couponRedeemed: event.wallet.couponRedeemed,
          },
        });
        break;

      case 'error':
        emit({
          from: 'buyer',
          to: 'operator',
          kind: 'error',
          title: 'The negotiation failed',
          detail: event.message,
          ok: false,
          status: 'error',
        });
        break;

      case 'end':
        break;
    }
  };
}
