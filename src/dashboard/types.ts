/**
 * What the operations dashboard reads, in TypeScript.
 *
 * This console is the only one that talks to *all four* services at once, so it
 * is also the only one that needs a vocabulary above them: an "agent" here is
 * not a service, it is a worker — the A2A server on 8101 runs two of them, and
 * the courier on 8102 runs one that has no model at all.
 *
 * The wire shapes themselves are imported from the consoles that own them
 * (`@/types`, `../a2a/types`, `../foodpanda/types`) rather than copied. That is
 * the one place this page is allowed to reach into another console's folder:
 * a second declaration of `Job` would be a second chance to disagree with the
 * board about what `awaiting` means, and this page renders the same field.
 */

import type { Job } from '../foodpanda/types';

export type { Job };

/** Every worker on the floor. Two of them live in the same process. */
export type AgentId = 'ordering' | 'buyer' | 'merchant' | 'dispatcher' | 'courier';

/**
 * What an agent is doing, in the four states an operator can act on.
 *
 * `blocked` and `offline` are kept apart on purpose. A blocked agent is running
 * and answering — it is missing a key, or the restaurant behind it is down — and
 * the fix is a config change. An offline one is not answering at all, and the
 * fix is starting it. Rolling the two into "not working" would send somebody to
 * the wrong terminal.
 */
export type AgentState = 'working' | 'idle' | 'blocked' | 'offline';

export interface AgentView {
  id: AgentId;
  name: string;
  glyph: string;
  /** What this agent is for, in one line. */
  role: string;
  port: number;
  state: AgentState;
  /** Why it is blocked or offline, in the service's own words. */
  problem: string | null;
  /** provider · model, or null for a worker that is a state machine. */
  brain: string | null;
  /**
   * How many pieces of work it is holding, or null when the service cannot say.
   *
   * Null is not zero and is never drawn as zero. The errand server on 8100 keeps
   * its runs in memory and exposes no list of them, so all this page can honestly
   * report about it is "busy" or "not busy" — and a dashboard that printed `0`
   * there would be inventing a fact.
   */
  holding: number | null;
  /** What `holding` counts, said plainly under the number. */
  holdingNote: string;
  /** The console this agent is actually driven from. */
  href: string;
}

/** One tick of the state sampler — what every agent was doing at that instant. */
export interface Sample {
  at: number;
  states: Record<AgentId, AgentState>;
}

/**
 * Who is holding a job right now.
 *
 * Derived from `status` and `awaiting` together, because neither says it alone:
 * an `accepted` job is the dispatcher's while it hunts for a rider and *yours*
 * the moment it starts waiting to be asked for one. That difference is the whole
 * point of the assignment table — it is the list of work that is not moving
 * unless somebody moves it.
 */
export type Owner = 'dispatcher' | 'rider' | 'operator' | 'settled';

export interface Assignment {
  job: Job;
  owner: Owner;
  /** What the owner is doing with it, in the present tense. */
  doing: string;
  /** Seconds since the job arrived. */
  ageSeconds: number;
  /** True when nothing will happen until a person clicks something. */
  stuck: boolean;
}

/** One line in the cross-agent feed. */
export interface FeedRow {
  id: string;
  at: number;
  /** Which agent is speaking. */
  agent: AgentId;
  /** The order this is about, for the eye to group by. */
  orderNumber: string;
  kind: 'tool' | 'result' | 'said' | 'step' | 'waiting' | 'error';
  text: string;
  /** Result rows only: did the call succeed. */
  ok?: boolean;
}

/** A magnitude at a point in time — the shape every chart on this page eats. */
export interface Point {
  /** Epoch ms at the start of the bucket. */
  t: number;
  value: number;
}

/** One bar in a horizontal bar chart. */
export interface Row {
  key: string;
  label: string;
  value: number;
  /** What the value means when it is not a plain count. */
  note?: string;
  /** Status marks only — a bar that means "arrived" or "failed" rather than "some". */
  tone?: 'work' | 'good' | 'bad' | 'idle';
}
