/**
 * Wire types for the two services this app talks to.
 *
 * The agent types mirror `kiosk-agent/server.py`; the coupon types are the
 * subset of the kiosk API's coupon schema this app actually reads. Keep them in
 * step with those services — nothing here is generated.
 */

export type AgentMode = 'api' | 'browser';

export type AgentRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface AgentHealth {
  agent: string;
  /** Is the restaurant's own API answering? The agent is useless without it. */
  restaurantApi: boolean;
  /**
   * Can the configured provider actually run? Named for the question rather
   * than the mechanism — a local Ollama needs no key and is still ready.
   */
  hasApiKey: boolean;
  /** What is missing, in words, when `hasApiKey` is false. */
  credentialProblem: string | null;
  /** anthropic | gemini | openai | ollama */
  provider: string;
  model: string;
  kioskWeb: string;
  /** An errand is already in flight — the agent serialises runs. */
  busy: boolean;
}

export interface StartAgentRunInput {
  instruction: string;
  couponCode?: string | null;
  cashLimit: number;
  mode: AgentMode;
  customerId?: string | null;
  /** Browser mode only: run Chromium invisibly, or show the window. */
  headless: boolean;
}

export interface AgentWalletSummary {
  couponCode: string | null;
  couponRedeemed: number;
  cashLimit: number;
  cashSpent: number;
  cashRemaining: number;
}

/**
 * One thing that happened during a run.
 *
 * A discriminated union rather than a bag of optionals: the reducer renders a
 * different row per kind, and this makes the compiler check each is handled.
 */
export type AgentEvent =
  | { type: 'status'; status: AgentRunStatus; queued?: boolean }
  | { type: 'tool'; toolUseId: string; name: string }
  | { type: 'tool_result'; toolUseId: string; ok: boolean; summary: string }
  | { type: 'text'; text: string }
  | { type: 'browser'; state: 'opened' | 'closed'; headless?: boolean }
  | { type: 'final'; text: string; wallet: AgentWalletSummary }
  | { type: 'error'; message: string }
  | { type: 'end' };

/** A tool call as the timeline shows it — the call and its outcome, merged. */
export interface AgentToolCall {
  toolUseId: string;
  name: string;
  /** null while the call is still running. */
  ok: boolean | null;
  summary: string | null;
}

/** The slice of the kiosk's coupon record this app shows in its picker. */
export interface CouponOption {
  couponCode: string;
  couponType: 'product' | 'value';
  status: string;
  remainingBalance: number | null;
  originalAmount: number | null;
  productName: string | null;
  expiryDate: string;
}
