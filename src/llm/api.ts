/**
 * The LLM configuration service.
 *
 * All four backends mount these endpoints — the selection behind them is a file
 * every one of them reads — so this client speaks to the ordering agent on 8100
 * simply because that is the service a control panel expects to be up. The port
 * is re-declared here rather than imported from the errand console's own
 * `api.ts` for the reason `src/dashboard/api.ts` gives: a port is a fact about
 * the deployment, and importing one console's module into another couples two
 * apps that are separate on purpose. Same variable, so a moved port moves once.
 *
 * Reads answer `null` rather than throwing — "the service is not running" is a
 * state this screen renders. Writes throw, because a save that silently did
 * nothing would be the worst possible outcome on a page whose entire job is to
 * change something.
 */

import type {
  ActiveLlm,
  ModelList,
  ProviderHealth,
  ProviderInfo,
  TestResult,
} from './types';

export const LLM_BASE =
  (import.meta.env.VITE_AGENT_BASE_URL as string | undefined) ?? 'http://localhost:8100';

export const START_COMMAND = '.venv\\Scripts\\python -m uvicorn server:app --port 8100';

export const LLM_OFFLINE =
  'The agent service is not running. Start it in friends-kitchen-agent-backend with: ' +
  START_COMMAND;

/**
 * The service is up, but does not have these endpoints.
 *
 * A distinct state from "not running", and a common one exactly once per
 * upgrade: `/api/llm/*` is newer than the process answering on 8100, which
 * means a uvicorn started before this feature existed is still running.
 * Telling somebody to *start* a service they can watch serving requests is the
 * one message guaranteed to waste their afternoon — so this one says restart.
 */
export const LLM_STALE =
  'The agent service is running, but it is an older build with no LLM ' +
  'configuration endpoints. Restart it in friends-kitchen-agent-backend with: ' +
  START_COMMAND;

/** Why a read failed, where the difference changes what the operator should do. */
export type ServiceFault = 'offline' | 'stale' | 'error';

export class ServiceError extends Error {
  constructor(
    readonly fault: ServiceFault,
    message: string,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

interface Envelope<T> {
  success?: boolean;
  data?: T;
  detail?: string;
}

async function unwrap<T>(response: Response): Promise<T> {
  // A 404 on one of these paths is not "no such record" — none of them takes an
  // id, and every one of them exists in any build that has them at all. It
  // means the build does not.
  if (response.status === 404) {
    throw new ServiceError('stale', LLM_STALE);
  }

  let payload: Envelope<T>;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    throw new ServiceError('error', `The agent service returned ${response.status}.`);
  }
  if (!response.ok || payload.success === false) {
    throw new ServiceError(
      'error',
      payload.detail ?? `The agent service returned ${response.status}.`,
    );
  }
  return payload.data as T;
}

/** One GET, with nothing answering told apart from an answer we did not like. */
async function get<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${LLM_BASE}${path}`);
  } catch {
    // Nothing answered at all: connection refused, or CORS blocked it.
    throw new ServiceError('offline', LLM_OFFLINE);
  }
  return unwrap<T>(response);
}

/** A read where "not there" is an answer rather than an exception. */
async function read<T>(path: string): Promise<T | null> {
  try {
    return await get<T>(path);
  } catch {
    return null;
  }
}

export const llmApi = {
  /** What every agent on this floor is running on right now. */
  config: () => read<{ active: ActiveLlm }>('/api/llm/config').then((data) => data?.active ?? null),

  /**
   * Everything the screen needs to draw itself.
   *
   * The one read here that throws rather than answering null: it decides
   * whether this page can be used at all, and "it did not work" is useless
   * when the fix differs between a service that is down and one that is
   * merely old.
   */
  providers: () =>
    get<{ items: ProviderInfo[]; active: ActiveLlm }>('/api/llm/providers'),

  /**
   * What one provider can run.
   *
   * The backend answers 200 with `problem` set when the provider will not talk
   * — a local runtime that is not running is the commonest state this call is
   * made in, and the screen has a proper empty state for it. A `null` here
   * means something else entirely: the agent service itself is down.
   */
  models: (provider: string) =>
    read<ModelList>(`/api/llm/models?provider=${encodeURIComponent(provider)}`),

  health: (provider: string, model: string) =>
    read<ProviderHealth>(
      `/api/llm/health?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`,
    ),

  /**
   * Ask the model a question and read the answer back.
   *
   * The one check that proves the whole path, so it is slow by nature — a real
   * generation on a real model. It never fails as an exception on the backend
   * side; a failed test arrives as `ok: false` with a sentence in `problem`.
   */
  test: async (provider: string, model: string): Promise<TestResult> => {
    let response: Response;
    try {
      response = await fetch(`${LLM_BASE}/api/llm/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      });
    } catch {
      throw new ServiceError('offline', LLM_OFFLINE);
    }
    return unwrap<TestResult>(response);
  },

  /** Point every agent at a different provider or model. Throws on refusal. */
  apply: async (provider: string, model: string): Promise<ActiveLlm> => {
    let response: Response;
    try {
      response = await fetch(`${LLM_BASE}/api/llm/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model }),
      });
    } catch {
      throw new ServiceError('offline', LLM_OFFLINE);
    }
    const { active } = await unwrap<{ active: ActiveLlm }>(response);
    return active;
  },
};
