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
  StartAgentRunInput,
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
};

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

        case 'tool_result':
          return {
            ...prev,
            toolCalls: prev.toolCalls.map((call) =>
              call.toolUseId === event.toolUseId
                ? { ...call, ok: event.ok, summary: event.summary, detail: event.detail ?? null }
                : call,
            ),
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
