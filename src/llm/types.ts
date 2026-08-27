/**
 * What the LLM configuration endpoints answer with.
 *
 * Nothing in here is or contains a credential. `configured` is whether a key is
 * present and `keyEnv` is the *name* of the variable to put one in — the value
 * never leaves the backend, which is the whole reason this screen changes the
 * selection rather than the secrets.
 */

/** The provider and model every agent on this floor is running on. */
export interface ActiveLlm {
  /** The canonical name: `ollama`, `openrouter`, `anthropic`, … */
  provider: string;
  model: string;
  /**
   * `central` once somebody has chosen on this screen, `environment` while the
   * floor is still running on whatever .env says. Worth showing: "why is it on
   * this model" is the first question an operator asks.
   */
  source: 'central' | 'environment';
  updatedAt: string | null;
  displayName: string;
  /** `local` runs on this machine, `cloud` does not. The screen says which. */
  kind: string;
  /** Whether it could serve a run — for a cloud provider, whether a key is set. */
  ready: boolean;
  problem: string | null;
}

/**
 * One knob a provider exposes, described well enough to draw a field from.
 *
 * The backend sends the shape rather than this screen knowing it, which is what
 * keeps the settings section one section: a provider with a server URL and a
 * temperature gets fields, a provider with neither gets no section, and neither
 * case is a branch on a provider's name in here.
 */
export interface ProviderSetting {
  key: string;
  label: string;
  /** `url` and `text` draw an input; `number` draws a stepper. */
  kind: 'url' | 'number' | 'text';
  default: string | number;
  help: string;
  /** Folded away behind the Advanced disclosure. */
  advanced: boolean;
  min: number | null;
  max: number | null;
  step: number | null;
  /** `int` or `float`, for the steppers. */
  number: 'int' | 'float';
}

/** What a provider's settings are, and what shape they have. */
export interface ProviderSettings {
  provider: string;
  displayName: string;
  fields: ProviderSetting[];
  values: Record<string, string | number>;
}

/** One selectable provider, as the cards and the fallback list draw it. */
export interface ProviderInfo {
  name: string;
  displayName: string;
  kind: string;
  blurb: string;
  /** The two this screen leads with. The rest stay selectable underneath. */
  featured: boolean;
  /** Whether its model list is fetched from the provider or is just a default. */
  dynamicModels: boolean;
  requiresKey: boolean;
  /** The .env variable its key goes in. Never the key. */
  keyEnv: string | null;
  configured: boolean;
  problem: string | null;
  defaultModel: string;
  /** How to get a local runtime going, when it is not going. */
  startHint: string | null;
  /** Empty for a provider with nothing to configure here — most of them. */
  settings: ProviderSetting[];
  /** What those fields currently hold: what .env says, under what was saved. */
  settingValues: Record<string, string | number>;
}

/** A model a provider can run. The optional fields differ by provider. */
export interface ModelInfo {
  id: string;
  label: string;
  /** OpenRouter: tokens of context, and whether it is free to call. */
  contextLength?: number | null;
  free?: boolean;
  /** Ollama and llama.cpp: what is on the disk. */
  sizeBytes?: number | null;
  parameterSize?: string | null;
  family?: string | null;
  /** llama.cpp: the GGUF's quantisation, e.g. `Q4_K - Medium`. */
  quantization?: string | null;
}

export interface ModelList {
  provider: string;
  displayName: string;
  dynamic: boolean;
  items: ModelInfo[];
  /** Set instead of throwing when the provider will not answer. */
  problem: string | null;
}

/** One line of a health or test report. */
export interface HealthCheck {
  label: string;
  ok: boolean;
  detail: string | null;
}

export interface ProviderHealth {
  provider: string;
  displayName?: string;
  kind?: string;
  model: string | null;
  ok: boolean;
  checks: HealthCheck[];
  problem: string | null;
}

/** What `POST /api/llm/test` answers — health, plus a real generation. */
export interface TestResult {
  ok: boolean;
  provider: string;
  model: string;
  checks: HealthCheck[];
  problem: string | null;
  reply?: string;
}
