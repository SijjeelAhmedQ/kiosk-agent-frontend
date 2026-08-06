/**
 * The ordering agent's service.
 *
 * The run itself is streamed. `POST` starts the errand and returns an id;
 * `EventSource` then follows it. Two calls rather than one because EventSource
 * can only GET — and the split has a bonus: the stream can be re-opened after a
 * refresh, and the server replays what was missed.
 */

import type { AgentEvent, AgentHealth, StartAgentRunInput } from '@/types';

/** Where the agent process is listening. Override with VITE_AGENT_BASE_URL. */
export const AGENT_BASE =
  (import.meta.env.VITE_AGENT_BASE_URL as string | undefined) ?? 'http://localhost:8100';

export const AGENT_OFFLINE =
  'The agent service is not running. Start it in kiosk-agent with: ' +
  '.venv\\Scripts\\python -m uvicorn server:app --port 8100';

/** Every agent endpoint answers `{success, data}`, or `{detail}` on a refusal. */
interface Envelope<T> {
  success?: boolean;
  data?: T;
  detail?: string;
}

async function unwrap<T>(response: Response): Promise<T> {
  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new Error(`The agent service returned ${response.status}.`);
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.detail ?? `The agent service returned ${response.status}.`);
  }
  return payload.data as T;
}

export const agentApi = {
  /**
   * Is the agent able to run at all?
   *
   * Deliberately turns a network error into a typed answer: "the service is
   * down" is a state this app renders, not an exception it has to handle.
   */
  health: async (): Promise<AgentHealth | null> => {
    try {
      return await unwrap<AgentHealth>(await fetch(`${AGENT_BASE}/api/agent/health`));
    } catch {
      return null;
    }
  },

  start: async (input: StartAgentRunInput): Promise<string> => {
    let response: Response;
    try {
      response = await fetch(`${AGENT_BASE}/api/agent/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error(AGENT_OFFLINE);
    }
    const { runId } = await unwrap<{ runId: string }>(response);
    return runId;
  },

  cancel: async (runId: string): Promise<void> => {
    try {
      await fetch(`${AGENT_BASE}/api/agent/runs/${runId}/cancel`, { method: 'POST' });
    } catch {
      // The run is already unreachable — nothing useful left to do here.
    }
  },

  /**
   * Follow a run. Returns the unsubscribe function.
   *
   * The server closes the stream after the `end` event, and an EventSource that
   * is not explicitly closed would reconnect forever — so `end` closes it from
   * this side too.
   */
  subscribe: (
    runId: string,
    onEvent: (event: AgentEvent) => void,
    onError: (message: string) => void,
  ): (() => void) => {
    const source = new EventSource(`${AGENT_BASE}/api/agent/runs/${runId}/events`);
    let finished = false;

    source.onmessage = (message) => {
      let event: AgentEvent;
      try {
        event = JSON.parse(message.data) as AgentEvent;
      } catch {
        return; // keep-alive pings and anything malformed
      }
      if (event.type === 'end') {
        finished = true;
        source.close();
      }
      onEvent(event);
    };

    source.onerror = () => {
      // A close after `end` is the normal path, not a failure.
      if (finished) return;
      source.close();
      onError('Lost the connection to the agent service.');
    };

    return () => {
      finished = true;
      source.close();
    };
  },
};
