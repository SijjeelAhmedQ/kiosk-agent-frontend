/**
 * Wire types for the A2A service on 8101.
 *
 * Mirrors `friends-kitchen-agent-backend/agent/a2a/protocol.py`. Kept separate from
 * `src/types.ts` on purpose: that file describes the errand service on 8100,
 * the two protocols are free to diverge, and a shared file would make every
 * change to one a risk to the other.
 */

export type A2ARunStatus = 'idle' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

/** Who said it. The whole console is built around telling these two apart. */
export type Speaker = 'buyer' | 'merchant';

export interface AgentSide {
  provider: string;
  model: string;
  ready: boolean;
  problem: string | null;
  /** Merchant only: 'api' drives the REST API, 'browser' drives Friends Kitchen. */
  hands?: string;
}

export interface A2AHealth {
  a2a: string;
  restaurantApi: boolean;
  buyer: AgentSide;
  merchant: AgentSide;
  busy: boolean;
}

/**
 * The delivery agent, as this console needs to know it.
 *
 * A third service on a third port, reported beside the other two because a
 * negotiation that ends in a paid take-away order hands it straight over — and
 * finding out the courier was never running is worth knowing before the money
 * moves rather than after. Read as a status, never as a gate: a dead courier
 * does not stop two agents agreeing a price, and the A2A service is explicit
 * that a failed handover leaves a paid order rather than undoing one.
 *
 * The slice is deliberately small. `src/foodpanda/types.ts` describes the whole
 * of that service for the board that drives it; this is the strip's four words.
 */
export interface DeliveryHealth {
  service: string;
  dispatcher: { ready: boolean; problem: string | null };
  activeJobs: number;
}

export interface StartA2ARunInput {
  instruction: string;
  couponCode?: string | null;
  cashLimit: number;
  customerId?: string | null;
}

/**
 * The delivery a paid negotiation was handed over to.
 *
 * Not a top-level event: it arrives inside the `detail` of the merchant's
 * payment tool result, because on this service the handover *is* part of paying.
 * `agent/a2a/merchant_tools.py` calls `agent/a2a/delivery.py` the moment the
 * charge goes through and puts what came back under `delivery`, so the console
 * reads it from there rather than asking the delivery board a second time.
 *
 * Every field but `ok` is optional, and deliberately so: a failed handover
 * carries `error` and nothing else, and a dine-in order carries no delivery at
 * all. See `agent/a2a/delivery.py` for the two shapes.
 */
export interface A2ADelivery {
  ok: boolean;
  /** Why there is no rider, when `ok` is false. The order is still paid for. */
  error?: string;
  deliveryService?: string;
  jobId?: string;
  /** The courier's own word — `requested`, `courier_assigned`, `delivered`… */
  status?: string;
  /** The only field allowed to mean "the customer has it". */
  delivered?: boolean;
  deliveringTo?: string;
  pickupFrom?: string;
  /** Straight-line km between the two — a ranking, not a driving distance. */
  distanceKm?: number | null;
  etaMinutes?: number | null;
  fee?: string | null;
  /** The service's own sentence about what has and has not happened yet. */
  note?: string;
}

export interface WalletSummary {
  couponCode: string | null;
  couponRedeemed: number;
  cashLimit: number;
  cashSpent: number;
  cashRemaining: number;
}

/**
 * One figure, twice: the number for arithmetic, the text for reading.
 *
 * The service sends both because its own buyer needs to compute against the
 * amount while its model reads the same field. The console renders `text` and
 * never formats a number itself — currency formatting is the service's job and
 * doing it in two places is how the two disagree.
 */
export interface Amount {
  amount: number;
  text: string;
}

/** A quote or a receipt. Loose, because the two shapes overlap but differ. */
export interface ArtifactData {
  kind?: 'estimate' | 'firm';
  currency?: string;
  orderNumber?: string;
  orderType?: string;
  paymentMethod?: string;
  status?: string;
  couponCode?: string;
  couponStatus?: string;
  taxRate?: number;
  itemCount?: number;
  note?: string;
  transactionRef?: string;
  lines?: {
    lineId?: string;
    name: string;
    quantity: number;
    unitPrice?: Amount;
    lineTotal: Amount;
    isMeal?: boolean;
  }[];
  subtotal?: Amount;
  tax?: Amount;
  estimatedTax?: Amount;
  estimatedTotal?: Amount;
  total?: Amount;
  couponDiscount?: Amount;
  remainingCouponBalance?: Amount;
  amountDue?: Amount;
  charged?: Amount;
}

/**
 * One thing that happened during a run.
 *
 * A discriminated union rather than a bag of optionals: the transcript renders
 * a different row per kind, and this makes the compiler check each is handled.
 */
export type A2AEvent =
  | { type: 'status'; status: string; queued?: boolean }
  | { type: 'discovery'; speaker: Speaker; name: string; skills: string[]; url: string }
  | { type: 'merchant_task'; speaker: Speaker; taskId: string }
  | {
      type: 'message';
      speaker: Speaker;
      text: string;
      data?: unknown[];
      messageId?: string;
      ts?: number;
    }
  | {
      type: 'artifact';
      speaker: Speaker;
      name: 'quote' | 'receipt';
      data: ArtifactData;
      artifactId?: string;
      ts?: number;
    }
  | { type: 'tool'; speaker: Speaker; toolUseId: string; name: string }
  | {
      type: 'tool_result';
      speaker: Speaker;
      toolUseId: string;
      ok: boolean;
      summary: string;
      detail?: Record<string, unknown> | null;
    }
  | {
      type: 'final';
      text: string;
      wallet: WalletSummary;
      paid?: boolean;
      orderNumber?: string | null;
      /** The run died after this point — the facts still stand. */
      afterError?: boolean;
    }
  | { type: 'error'; message: string }
  | { type: 'end' };

/**
 * The transcript as the console draws it: one entry per row, in arrival order.
 *
 * Consecutive tool calls collapse into a single strip rather than a row each.
 * They are the machinery under a turn — "looked up the menu, checked the
 * wallet" — and given a row apiece they bury the two sentences that are the
 * actual conversation.
 *
 * Chronological rather than grouped by speaker, because the order *is* the
 * information: a quote that arrives before a confirmation reads differently
 * from one that arrives after.
 */
export interface ToolCall {
  toolUseId: string;
  name: string;
  ok: boolean | null;
  summary: string | null;
}

export type Entry =
  | { kind: 'discovery'; name: string; skills: string[]; url: string }
  | { kind: 'tools'; speaker: Speaker; calls: ToolCall[] }
  | { kind: 'turn'; speaker: Speaker; text: string }
  | { kind: 'artifact'; name: 'quote' | 'receipt'; data: ArtifactData }
  | { kind: 'error'; message: string };
