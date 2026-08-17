/**
 * Drives one errand and keeps the page's view of it.
 *
 * The agent streams three different things — which tool it is calling, how that
 * call turned out, and what it is saying — and they arrive interleaved. This
 * folds them into the two shapes the UI renders: an ordered list of tool calls,
 * and the agent's prose.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { agentApi } from '@/services/agentApi';
import type {
  AgentEvent,
  AgentRunStatus,
  AgentToolCall,
  AgentWalletSummary,
  DeliveryContext,
  DeliveryJob,
  DeliveryStatus,
  StartAgentRunInput,
  ToolDetail,
} from '@/types';

interface AgentRunState {
  runId: string | null;
  status: AgentRunStatus | 'idle';
  toolCalls: AgentToolCall[];
  /** What the agent has said so far, streamed token by token. */
  narration: string;
  finalText: string;
  wallet: AgentWalletSummary | null;
  error: string | null;
  browserOpen: boolean;
  /** Where this errand is going — null for a counter order. */
  delivery: DeliveryContext | null;
  /** The courier's job, once one has been arranged. */
  deliveryJob: DeliveryJob | null;
}

const EMPTY: AgentRunState = {
  runId: null,
  status: 'idle',
  toolCalls: [],
  narration: '',
  finalText: '',
  wallet: null,
  error: null,
  browserOpen: false,
  delivery: null,
  deliveryJob: null,
};

/** The tools whose results say where a delivery has got to. */
const DELIVERY_TOOLS = new Set(['arrange_delivery', 'check_delivery']);

/**
 * The tools that hand an order to a courier as part of paying for it.
 *
 * Their result is not a job — it is a payment that happens to carry one, under
 * `delivery`. Read separately for that reason: the handover being automatic is
 * what stops a delivery going missing on the run where the agent forgets to ask
 * for one, and this is the panel finding out about it.
 */
const PAYMENT_TOOLS = new Set(['authorize_payment', 'pay']);

/** `detail.delivery`, if the payment tool put a job there. */
function nestedDelivery(detail: ToolDetail | null): ToolDetail | null {
  const nested = detail?.delivery;
  return typeof nested === 'object' && nested !== null ? (nested as ToolDetail) : null;
}

/**
 * A delivery job read off a tool result, or null if that is not what this was.
 *
 * Every field is checked rather than trusted: this shape is the agent's, not
 * this app's, and a tool that answered with a refusal has none of it. `delivered`
 * in particular is only ever taken from the courier's own boolean — never
 * inferred from a successful call, which is exactly the mistake that would have
 * the page announce an arrival that has not happened.
 */
function readDeliveryJob(detail: ToolDetail | null): DeliveryJob | null {
  if (!detail) return null;
  const jobId = detail.jobId;
  const status = detail.status;
  if (typeof jobId !== 'string' || !jobId || typeof status !== 'string') return null;

  const string = (value: unknown): string | null =>
    typeof value === 'string' && value.trim() ? value : null;

  return {
    jobId,
    status: status as DeliveryStatus,
    delivered: detail.delivered === true,
    deliveryService: string(detail.deliveryService),
    courier: string(detail.courier),
    etaMinutes: typeof detail.etaMinutes === 'number' ? detail.etaMinutes : null,
    fee: string(detail.fee),
    trackingUrl: string(detail.trackingUrl),
    message: string(detail.message),
    orderNumber: string(detail.orderNumber),
  };
}

export function useAgentRun() {
  const [state, setState] = useState<AgentRunState>(EMPTY);
  const unsubscribe = useRef<(() => void) | null>(null);

  // Always detach on unmount, or an EventSource keeps streaming into a
  // component that is no longer there.
  useEffect(() => () => unsubscribe.current?.(), []);

  const apply = useCallback((event: AgentEvent) => {
    setState((prev) => {
      switch (event.type) {
        case 'status':
          // `final` and `error` have already settled the run; a late status
          // event must not drag it back to "running".
          return prev.status === 'done' || prev.status === 'failed'
            ? prev
            : { ...prev, status: event.status };

        case 'tool':
          // Guard against a replayed event double-adding on reconnect.
          if (prev.toolCalls.some((call) => call.toolUseId === event.toolUseId)) return prev;
          return {
            ...prev,
            toolCalls: [
              ...prev.toolCalls,
              {
                toolUseId: event.toolUseId,
                name: event.name,
                ok: null,
                summary: null,
                detail: null,
              },
            ],
          };

        case 'tool_result': {
          const toolCalls = prev.toolCalls.map((call) =>
            call.toolUseId === event.toolUseId
              ? { ...call, ok: event.ok, summary: event.summary, detail: event.detail ?? null }
              : call,
          );

          // A delivery tool that succeeded carries the courier's latest word on
          // the job. A refused one carries a reason instead, and must not
          // overwrite what the last good answer said.
          const source = toolCalls.find((call) => call.toolUseId === event.toolUseId);
          const detail = event.detail ?? null;
          let job: DeliveryJob | null = null;
          if (event.ok && source) {
            if (DELIVERY_TOOLS.has(source.name)) job = readDeliveryJob(detail);
            // A payment that failed to hand the order over leaves `delivery`
            // holding a refusal rather than a job, and readDeliveryJob returns
            // null for it — which is right: no rider is not a rider.
            else if (PAYMENT_TOOLS.has(source.name)) job = readDeliveryJob(nestedDelivery(detail));
          }

          return { ...prev, toolCalls, deliveryJob: job ?? prev.deliveryJob };
        }

        case 'location':
          return {
            ...prev,
            delivery: {
              userLocation: event.userLocation,
              restaurant: event.restaurant,
              distanceKm: event.distanceKm,
              deliveryService: event.deliveryService,
            },
          };

        case 'text':
          return { ...prev, narration: prev.narration + event.text };

        case 'browser':
          return { ...prev, browserOpen: event.state === 'opened' };

        case 'final':
          return {
            ...prev,
            status: 'done',
            finalText: event.text || prev.narration,
            wallet: event.wallet,
          };

        case 'error':
          return { ...prev, status: 'failed', error: event.message };

        case 'end':
          // A run that ended without a verdict failed somewhere unusual. Say so
          // rather than leaving a spinner turning forever.
          return prev.status === 'running' || prev.status === 'queued'
            ? { ...prev, status: 'failed', error: prev.error ?? 'The run ended unexpectedly.' }
            : prev;

        default:
          return prev;
      }
    });
  }, []);

  const start = useCallback(
    async (input: StartAgentRunInput) => {
      unsubscribe.current?.();
      setState({ ...EMPTY, status: 'queued' });

      try {
        const runId = await agentApi.start(input);
        setState((prev) => ({ ...prev, runId }));
        unsubscribe.current = agentApi.subscribe(runId, apply, (message) =>
          setState((prev) => ({ ...prev, status: 'failed', error: message })),
        );
      } catch (err) {
        setState((prev) => ({
          ...prev,
          status: 'failed',
          error: err instanceof Error ? err.message : 'Could not start the agent.',
        }));
      }
    },
    [apply],
  );

  const cancel = useCallback(async () => {
    if (state.runId) await agentApi.cancel(state.runId);
  }, [state.runId]);

  const reset = useCallback(() => {
    unsubscribe.current?.();
    setState(EMPTY);
  }, []);

  const busy = state.status === 'queued' || state.status === 'running';

  return { ...state, busy, start, cancel, reset };
}
