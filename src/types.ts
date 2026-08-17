/**
 * Wire types for the two services this app talks to.
 *
 * The agent types mirror `friends-kitchen-agent-backend/server.py`; the coupon types are the
 * subset of the Friends Kitchen API's coupon schema this app actually reads. Keep them in
 * step with those services — nothing here is generated.
 */

export type AgentMode = 'api' | 'browser';

export type AgentRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/**
 * Where the customer is.
 *
 * Sent with an errand to turn it into a delivery; leave it off and the agent
 * places the counter order it always did. The browser gives the coordinates,
 * the operator can type the label — nothing here is derived on this side, and
 * the agent is never handed the position through its prompt.
 */
export interface UserLocation {
  latitude: number;
  longitude: number;
  /** The device's own claim about its precision, in metres. */
  accuracyMeters?: number | null;
  /** What the customer calls this place — a flat number, an office name. */
  label?: string | null;
  /** How the fix was come by, for the audit trail. */
  source?: 'browser' | 'manual';
}

/** One Friends Kitchen, as a courier needs to know it. */
export interface RestaurantBranch {
  branchId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
}

/**
 * Which courier a delivery would go to, and whether it could.
 *
 * Never carries a credential — the server answers "a key is present", never
 * what it is. See friends-kitchen-agent-backend/agent/delivery/registry.py.
 */
export interface DeliveryHealth {
  provider: string;
  displayName: string;
  configured: boolean;
  /** What is missing, in words, when `configured` is false. */
  problem: string | null;
  available: string[];
}

/**
 * Where a delivery has got to.
 *
 * `delivered` is its own field rather than a comparison against `status`,
 * because the difference between "a courier has it" and "the customer has it"
 * is the one this whole flow must not blur. Only the delivery agent sets it.
 */
export interface DeliveryJob {
  jobId: string;
  status: DeliveryStatus;
  delivered: boolean;
  deliveryService?: string | null;
  courier?: string | null;
  etaMinutes?: number | null;
  fee?: string | null;
  trackingUrl?: string | null;
  message?: string | null;
  orderNumber?: string | null;
}

/** The courier's lifecycle. `delivered` is the only one that means it arrived. */
export type DeliveryStatus =
  | 'requested'
  | 'accepted'
  | 'courier_assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'unknown';

/** What the run was told before it started: who is where, and who delivers. */
export interface DeliveryContext {
  userLocation: UserLocation;
  restaurant: RestaurantBranch;
  /** Straight-line km between the two — a ranking, not a driving distance. */
  distanceKm: number | null;
  deliveryService: string;
}

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
  /** anthropic | gemini | openai | groq | ollama */
  provider: string;
  model: string;
  friendsKitchenWeb: string;
  /** An errand is already in flight — the agent serialises runs. */
  busy: boolean;
  /** Optional: an older agent server does not report on delivery at all. */
  delivery?: DeliveryHealth;
  /** How many branches the agent can choose between. */
  branches?: number;
  /**
   * The customer's saved address, as the agent server holds it.
   *
   * Offered by the form as one click, so the common case — "deliver it to my
   * own address" — is not a geolocation prompt. It arrives as an ordinary
   * `UserLocation` because that is what it is: the same shape a device fix
   * takes, with `source: 'manual'` and the street in `label`.
   */
  customer?: UserLocation;
}

export interface StartAgentRunInput {
  instruction: string;
  couponCode?: string | null;
  cashLimit: number;
  mode: AgentMode;
  customerId?: string | null;
  /** Browser mode only: run Chromium invisibly, or show the window. */
  headless: boolean;
  /**
   * Where to deliver, or null/absent for a counter order.
   *
   * Optional on purpose: every errand this app sent before delivery existed is
   * still a valid errand, and one sent without a location behaves exactly as
   * it used to.
   */
  userLocation?: UserLocation | null;
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
  | {
      type: 'tool_result';
      toolUseId: string;
      ok: boolean;
      summary: string;
      detail?: ToolDetail | null;
    }
  | { type: 'text'; text: string }
  | { type: 'browser'; state: 'opened' | 'closed'; headless?: boolean }
  // Emitted once, before the agent starts, when the errand carries a location:
  // what the server resolved it to. The trace shows this rather than making
  // someone take the agent's word for which branch it chose.
  | {
      type: 'location';
      userLocation: UserLocation;
      restaurant: RestaurantBranch;
      distanceKm: number | null;
      deliveryService: string;
    }
  | { type: 'final'; text: string; wallet: AgentWalletSummary }
  | { type: 'error'; message: string }
  | { type: 'end' };

/**
 * What a tool handed back, field by field.
 *
 * Deliberately loose: every tool returns a different shape and new ones arrive
 * without this file changing. `toolStory.ts` is where a shape is read, and it
 * checks each field it reads rather than trusting a type that cannot be checked
 * at the wire.
 */
export type ToolDetail = Record<string, unknown>;

/** A tool call as the timeline shows it — the call and its outcome, merged. */
export interface AgentToolCall {
  toolUseId: string;
  name: string;
  /** null while the call is still running. */
  ok: boolean | null;
  summary: string | null;
  /** The tool's own return value, for the timeline to put into words. */
  detail: ToolDetail | null;
}

/**
 * Where a coupon stands. Friends Kitchen computes this at read time — `expired` is
 * never stored — and the five are mutually exclusive.
 */
export type CouponStatus =
  | 'unused'
  | 'partially_redeemed'
  | 'fully_redeemed'
  | 'expired'
  | 'cancelled';

/** The slice of Friends Kitchen's coupon record this app shows in its picker. */
export interface CouponOption {
  couponCode: string;
  couponType: 'product' | 'value';
  status: CouponStatus;
  remainingBalance: number | null;
  originalAmount: number | null;
  productName: string | null;
  expiryDate: string;
}
