/**
 * Tool results, in words rather than JSON.
 *
 * A tool hands back a dict — `{"ok": true, "added": {…}, "cart": {…}}` — and
 * printing that into the timeline asks an operator to read a wire format to find
 * out whether their burger went in the basket. This turns each result into the
 * three things actually worth showing:
 *
 *   headline — one sentence: what happened
 *   facts    — the figures that sentence leaves out (money, counts, references)
 *   things   — the named items involved (products found, lines ordered)
 *
 * Unknown shapes are not a dead end. `generic()` reads whatever a result happens
 * to carry, so a tool added to the agent tomorrow reads as prose here today
 * without this file knowing its name. That is also why every field is checked
 * rather than typed: these shapes are the agent's, not this app's.
 */

import type { AgentToolCall, ToolDetail } from '@/types';

export interface Fact {
  label: string;
  value: string;
  /** Green for what was covered, amber for money spent, red for a refusal. */
  tone?: 'leaf' | 'amber' | 'flame';
}

export interface Thing {
  name: string;
  /** A qualifier — "× 2", "as a meal". */
  note?: string;
  /** Usually a price. */
  value?: string;
}

export interface ToolStory {
  headline: string;
  /** The restaurant's own words when it has any — a coupon's reason, a caveat. */
  note?: string;
  facts: Fact[];
  things: Thing[];
  /** Named things this result had beyond the ones `things` carries. */
  more: number;
}

type Bag = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Reading a result's fields without trusting any of them
// ---------------------------------------------------------------------------
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const count = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const bag = (value: unknown): Bag | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Bag) : null;

const rows = (value: unknown): Bag[] =>
  Array.isArray(value) ? value.map(bag).filter((item): item is Bag => item !== null) : [];

/**
 * A field worth putting a number on screen for.
 *
 * Note what this does *not* do: add a currency. Every rupee figure is already
 * written as `Rs 1,093` by the time it leaves the agent — that is deliberate
 * there, so the model cannot misread a bare `1093` — which means a bare number
 * arriving here is a count, not money, and stamping `Rs` on it would invent a
 * price for a queue length.
 */
const figure = (value: unknown): string | null => {
  const asText = text(value);
  if (asText) return asText;
  const asNumber = count(value);
  return asNumber === null ? null : asNumber.toLocaleString();
};

/** Is this figure worth a chip? "Rs 0" is noise in a timeline; Rs 1,702 is not. */
const spent = (value: string | null): boolean => value !== null && /[1-9]/.test(value);

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Drops the facts a result had nothing to say about. */
const factsOf = (candidates: (Fact | null)[]): Fact[] =>
  candidates.filter((fact): fact is Fact => fact !== null);

const fact = (label: string, value: unknown, tone?: Fact['tone']): Fact | null => {
  const shown = figure(value);
  return shown === null ? null : { label, value: shown, tone };
};

/** A product card, from either the API or a scrape of Friends Kitchen's screen. */
const product = (item: Bag): Thing => ({
  name: text(item.name) ?? text(item.productId) ?? 'Something on the menu',
  value: figure(item.price) ?? undefined,
});

/** A cart line, which unlike a product carries a quantity. */
const line = (item: Bag): Thing => {
  const quantity = count(item.quantity) ?? 1;
  const meal = item.isMeal === true ? 'as a meal' : null;
  return {
    name: text(item.name) ?? 'An item',
    note: [quantity > 1 ? `× ${quantity}` : null, meal].filter(Boolean).join(' · ') || undefined,
    value: figure(item.lineTotal) ?? figure(item.price) ?? undefined,
  };
};

/**
 * The courier half of a payment.
 *
 * A paid take-away order on a delivery errand is handed over in the same call
 * that charges for it, so the payment's story has to carry the handover —
 * otherwise the timeline shows the money leaving and nothing collecting the
 * food. `note` says who has it and, as everywhere else in this file, refuses to
 * round a rider on its way up into an arrival.
 */
const handover = (detail: Bag): { note?: string; facts: Fact[] } => {
  const delivery = bag(detail.delivery);
  if (!delivery) return { facts: [] };

  if (delivery.ok === false) {
    return {
      note: `No rider: ${text(delivery.error) ?? 'the delivery service would not take the job.'}`,
      facts: [{ label: 'Delivery', value: 'not arranged', tone: 'flame' }],
    };
  }

  const service = text(delivery.deliveryService) ?? 'the courier';
  return {
    note: `Handed to ${service} — with a rider, not with the customer.`,
    facts: factsOf([
      { label: 'Delivery', value: service },
      text(delivery.status)
        ? { label: 'Job', value: text(delivery.status)!.replace(/_/g, ' ') }
        : null,
      count(delivery.etaMinutes) === null
        ? null
        : { label: 'ETA', value: `~${count(delivery.etaMinutes)} min`, tone: 'amber' },
    ]),
  };
};

/** The two figures every cart-shaped result carries. */
const cartFacts = (detail: Bag): Fact[] => {
  const cart = bag(detail.cart) ?? {};
  return factsOf([
    fact('Order so far', cart.estimatedSubtotal ?? detail.basketTotal, 'amber'),
    count(cart.itemCount) === null
      ? null
      : { label: 'In the basket', value: plural(count(cart.itemCount) ?? 0, 'item', 'items') },
  ]);
};

/** Which screen Friends Kitchen is showing, as somewhere you would say you are. */
const screenName = (detail: Bag): string | null => {
  const screen = text(detail.screen);
  return screen ? (screen === 'splash' ? 'the welcome screen' : `the ${screen} screen`) : null;
};

// ---------------------------------------------------------------------------
// One writer per tool
// ---------------------------------------------------------------------------
/**
 * Keyed by tool name, so a tool that exists in both modes is handled by one
 * writer that reads whichever shape arrived — the API's `add_to_cart` returns
 * the line it created, the browser's returns what the basket now says, and both
 * are "something went in the order".
 */
const WRITERS: Record<string, (detail: Bag) => Partial<ToolStory>> = {
  // ---- The menu ----------------------------------------------------------
  browse_menu: (detail) => {
    const products = rows(detail.products);
    const matched = count(detail.matched) ?? products.length;
    return {
      headline:
        matched === 0
          ? 'Nothing matched — read the whole menu instead'
          : `Found ${plural(matched, 'thing', 'things')} on the menu`,
      note: text(detail.note) ?? undefined,
      things: products.map(product),
      more: Math.max(matched, products.length) - products.length,
    };
  },

  list_categories: (detail) => {
    const categories = rows(detail.categories);
    return {
      headline: `Read ${plural(categories.length, 'category', 'categories')}`,
      things: categories.map((item) => ({ name: text(item.name) ?? 'Unnamed' })),
    };
  },

  search_menu: (detail) => {
    const products = rows(detail.products);
    return {
      headline: products.length
        ? `${plural(products.length, 'thing', 'things')} showing on screen`
        : 'The search found nothing on screen',
      things: products.map(product),
      facts: factsOf([fact('Order so far', detail.basketTotal, 'amber')]),
    };
  },

  // ---- The cart ----------------------------------------------------------
  add_to_cart: (detail) => {
    const added = bag(detail.added);

    // API mode: the line it created, so the item can be named.
    if (added) {
      const item = line(added);
      const quantity = count(added.quantity) ?? 1;
      return {
        headline: `${item.name}${quantity > 1 ? ` × ${quantity}` : ''} went in the order${
          added.isMeal === true ? ', as a meal' : ''
        }`,
        facts: factsOf([fact('This line', added.lineTotal), ...cartFacts(detail)]),
      };
    }

    // Browser mode: a tap on a screen that never told us what it was tapping.
    const quantity = count(detail.quantity) ?? 1;
    return {
      headline: quantity > 1 ? `${quantity} of them went in the order` : 'Went in the order',
      note: text(detail.note) ?? undefined,
      facts: factsOf([
        detail.asMeal === true ? { label: 'Upgraded', value: 'as a meal', tone: 'leaf' } : null,
        fact('Order so far', detail.basketTotal, 'amber'),
      ]),
    };
  },

  view_cart: (detail) => {
    const cart = bag(detail.cart) ?? {};
    const lines = rows(cart.lines);
    const items = count(cart.itemCount) ?? lines.length;
    return {
      headline:
        items === 0 ? 'The order is still empty' : `${plural(items, 'item', 'items')} in the order`,
      facts: factsOf([fact('Running total', cart.estimatedSubtotal, 'amber')]),
      things: lines.map(line),
    };
  },

  remove_from_cart: (detail) => ({
    headline: 'Taken back out of the order',
    facts: cartFacts(detail),
    things: rows((bag(detail.cart) ?? {}).lines).map(line),
  }),

  // ---- The coupon --------------------------------------------------------
  check_coupon: (detail) => {
    const covers = figure(detail.wouldCover);
    return {
      headline:
        detail.valid === true
          ? covers
            ? `The coupon is good for ${covers} off`
            : 'The coupon is good on this order'
          : 'The coupon does not apply to this order',
      note: text(detail.reason) ?? undefined,
      facts: factsOf([
        fact('Would cover', detail.wouldCover, 'leaf'),
        fact('Coupon balance', detail.remainingBalance),
      ]),
    };
  },

  apply_coupon: (detail) => {
    // Browser mode says whether Friends Kitchen took it; API mode says how much it took.
    if ('applied' in detail) {
      return {
        headline:
          detail.applied === true
            ? 'Friends Kitchen accepted the coupon'
            : 'Friends Kitchen would not take the coupon',
        note: text(detail.detail) ?? text(detail.problem) ?? undefined,
        facts: factsOf([fact('Left to pay', detail.amountDue, 'amber')]),
      };
    }

    const redeemed = figure(detail.redeemed);
    return {
      headline: redeemed ? `The coupon took ${redeemed} off the bill` : 'The coupon was redeemed',
      facts: factsOf([
        fact('Came off', detail.redeemed, 'leaf'),
        fact('Left to pay', detail.amountDue, 'amber'),
        fact('Coupon left', detail.remainingCouponBalance),
        text(detail.couponStatus)
          ? { label: 'Coupon', value: text(detail.couponStatus)!.replace(/_/g, ' ') }
          : null,
      ]),
    };
  },

  // ---- Checkout ----------------------------------------------------------
  place_order: (detail) => ({
    headline: `Order #${text(detail.orderNumber) ?? '—'} is with the kitchen, unpaid`,
    facts: factsOf([
      fact('Subtotal', detail.subtotal),
      fact('Tax', detail.tax),
      fact('Total', detail.total),
      fact('To pay', detail.amountDue, 'amber'),
    ]),
  }),

  authorize_payment: (detail) => {
    const charged = figure(detail.charged);
    const purse = bag(detail.wallet) ?? {};
    const courier = handover(detail);
    return {
      headline: charged
        ? `Paid ${charged} for order #${text(detail.orderNumber) ?? '—'}`
        : 'The payment went through',
      note: courier.note,
      facts: factsOf([
        fact('Charged', detail.charged, 'amber'),
        spent(figure(purse.couponRedeemed)) ? fact('Coupon covered', purse.couponRedeemed, 'leaf') : null,
        fact('Cash left', purse.cashRemaining),
        text(detail.transactionRef) ? { label: 'Reference', value: text(detail.transactionRef)! } : null,
      ]).concat(courier.facts),
    };
  },

  get_order: (detail) => {
    const status = text(detail.status)?.replace(/_/g, ' ');
    return {
      headline: `Order #${text(detail.orderNumber) ?? '—'} is ${status ?? 'on the system'}`,
      facts: factsOf([
        fact('Total', detail.total),
        spent(figure(detail.couponDiscount)) ? fact('Coupon covered', detail.couponDiscount, 'leaf') : null,
        fact('Still owed', detail.amountDue, spent(figure(detail.amountDue)) ? 'flame' : undefined),
      ]),
      things: rows(detail.items).map(line),
    };
  },

  // ---- Delivery ----------------------------------------------------------
  check_delivery_location: (detail) => {
    const restaurant = bag(detail.restaurant) ?? {};
    const branch = text(restaurant.name);

    if (detail.haveLocation !== true) {
      return {
        headline: 'No delivery address — this is a counter order',
        note: text(detail.note) ?? undefined,
        facts: [],
      };
    }

    return {
      headline: branch
        ? `Ordering from ${branch}, the nearest branch`
        : 'Found where the customer is',
      note: text(detail.note) ?? undefined,
      facts: factsOf([
        text(detail.customerLocationText)
          ? { label: 'Customer', value: text(detail.customerLocationText)! }
          : null,
        text(restaurant.address)
          ? { label: 'Collect from', value: text(restaurant.address)! }
          : null,
        // The only number here that is not money, so it is spelled with its
        // unit — `figure()` would render a bare 6.3 and invite "Rs 6.3".
        count(detail.distanceKm) === null
          ? null
          : { label: 'Apart', value: `${(count(detail.distanceKm) ?? 0).toFixed(1)} km` },
      ]),
    };
  },

  /**
   * The handover, and the one story in this file with a rule of its own: a
   * successful dispatch is *not* an arrival. The headline says the courier has
   * it, never that the customer does, unless the courier's own `delivered`
   * says otherwise.
   */
  arrange_delivery: (detail) => {
    const service = text(detail.deliveryService) ?? 'the courier';
    const order = text(detail.orderNumber);
    return {
      headline:
        detail.delivered === true
          ? `${service} has delivered order #${order ?? '—'}`
          : `${service} is collecting order #${order ?? '—'} — not delivered yet`,
      note: text(detail.message) ?? undefined,
      facts: factsOf([
        text(detail.status)
          ? { label: 'Status', value: text(detail.status)!.replace(/_/g, ' ') }
          : null,
        text(detail.deliveringTo) ? { label: 'To', value: text(detail.deliveringTo)! } : null,
        text(detail.courier) ? { label: 'Rider', value: text(detail.courier)! } : null,
        count(detail.etaMinutes) === null
          ? null
          : { label: 'ETA', value: `~${count(detail.etaMinutes)} min`, tone: 'amber' },
        fact('Delivery fee', detail.fee, 'amber'),
        text(detail.jobId) ? { label: 'Job', value: text(detail.jobId)! } : null,
      ]),
    };
  },

  check_delivery: (detail) => {
    const status = text(detail.status)?.replace(/_/g, ' ');
    return {
      headline:
        detail.delivered === true
          ? 'Delivered to the customer'
          : `Still on its way — ${status ?? 'in progress'}`,
      note: text(detail.message) ?? undefined,
      facts: factsOf([
        status ? { label: 'Status', value: status } : null,
        text(detail.courier) ? { label: 'Rider', value: text(detail.courier)! } : null,
        count(detail.etaMinutes) === null
          ? null
          : { label: 'ETA', value: `~${count(detail.etaMinutes)} min`, tone: 'amber' },
      ]),
    };
  },

  // ---- Friends Kitchen itself, in browser mode ---------------------------------
  open_friends_kitchen: (detail) => ({
    headline: `At ${screenName(detail) ?? 'Friends Kitchen'}, ready to order`,
    things: rows(detail.products).map(product),
  }),

  read_screen: (detail) => ({
    headline: `Looking at ${screenName(detail) ?? 'Friends Kitchen'}`,
    note: text(detail.couponProblem) ?? text(detail.couponApplied) ?? undefined,
    facts: factsOf([
      fact('Order so far', detail.basketTotal, 'amber'),
      fact('Left to pay', detail.amountDue, 'amber'),
      text(detail.orderNumber) ? { label: 'Order', value: `#${text(detail.orderNumber)}` } : null,
      detail.paymentFailed === true
        ? { label: 'Payment', value: 'refused', tone: 'flame' as const }
        : null,
    ]),
    things: rows(detail.products).map(product),
  }),

  open_category: (detail) => ({
    headline: `${plural(rows(detail.products).length, 'thing', 'things')} on this category's screen`,
    things: rows(detail.products).map(product),
  }),

  go_to_checkout: (detail) => ({
    headline: 'At the checkout screen',
    note: text(detail.couponProblem) ?? undefined,
    facts: factsOf([fact('Left to pay', detail.amountDue, 'amber')]),
  }),

  pay: (detail) => {
    const charged = figure(detail.charged);
    const purse = bag(detail.wallet) ?? {};
    const courier = handover(detail);
    return {
      headline: charged
        ? `Paid ${charged} for order #${text(detail.orderNumber) ?? '—'}`
        : 'Friends Kitchen completed the payment',
      note: courier.note,
      facts: factsOf([
        fact('Charged', detail.charged, 'amber'),
        spent(figure(purse.couponRedeemed)) ? fact('Coupon covered', purse.couponRedeemed, 'leaf') : null,
        fact('Cash left', purse.cashRemaining),
      ]).concat(courier.facts),
    };
  },
};

// ---------------------------------------------------------------------------
// The fallback, for a shape nobody wrote a writer for
// ---------------------------------------------------------------------------
/** Keys that carry no news: bookkeeping, and instructions meant for the model. */
const SKIP = new Set(['ok', 'next', 'note', 'detail', 'error', 'path', 'screen']);

const LABELS: Record<string, string> = {
  amountDue: 'Left to pay',
  basketTotal: 'Order so far',
  cashRemaining: 'Cash left',
  charged: 'Charged',
  couponDiscount: 'Coupon covered',
  couponStatus: 'Coupon',
  itemCount: 'Items',
  lineTotal: 'Line total',
  orderNumber: 'Order',
  redeemed: 'Came off',
  remainingBalance: 'Coupon balance',
  transactionRef: 'Reference',
  unitPrice: 'Each',
  wouldCover: 'Would cover',
};

/** `remainingCouponBalance` → `Remaining coupon balance`. */
const label = (key: string): string => {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Whatever this result happens to say, read off its own field names.
 *
 * Not as good as a writer, and much better than JSON: a new tool's booleans and
 * figures land as chips, and anything with a name in it lands as a thing.
 */
function generic(detail: Bag): Partial<ToolStory> {
  const facts: Fact[] = [];
  let things: Thing[] = [];

  for (const [key, value] of Object.entries(detail)) {
    if (SKIP.has(key)) continue;

    if (Array.isArray(value)) {
      const named = rows(value).filter((item) => text(item.name));
      if (named.length && !things.length) things = named.map(line);
      continue;
    }

    const nested = bag(value);
    if (nested) {
      // One level in — `{"cart": {…}}` and `{"wallet": {…}}` both hide their
      // figures there, and a chip per leaf is still readable.
      for (const [innerKey, innerValue] of Object.entries(nested)) {
        if (SKIP.has(innerKey) || Array.isArray(innerValue) || bag(innerValue)) continue;
        const chip = fact(label(innerKey), innerValue);
        if (chip) facts.push(chip);
      }
      const lines = rows(nested.lines);
      if (lines.length && !things.length) things = lines.map(line);
      continue;
    }

    if (typeof value === 'boolean') {
      facts.push({ label: label(key), value: value ? 'yes' : 'no', tone: value ? 'leaf' : undefined });
      continue;
    }

    const chip = fact(label(key), value);
    if (chip) facts.push(chip);
  }

  return { headline: 'Done', facts: facts.slice(0, 6), things };
}

/**
 * What to show for one step of the trace.
 *
 * Returns null while the call is in flight — the timeline has its own "working"
 * animation for that, and an empty story would flash a headline before the
 * result it summarises exists.
 *
 * A refusal is told by its own sentence rather than by a writer: the tools word
 * their errors for a reader ("That would take you Rs 300 past your cash limit"),
 * and no rewriting of ours improves on it.
 */
export function toolStory(call: AgentToolCall): ToolStory | null {
  if (call.ok === null) return null;

  if (call.ok === false) {
    return {
      headline: call.summary ?? 'This step was refused',
      facts: [],
      things: [],
      more: 0,
    };
  }

  const detail = call.detail;
  if (!detail || Object.keys(detail).length === 0) {
    return { headline: call.summary ?? 'Done', facts: [], things: [], more: 0 };
  }

  const written = (WRITERS[call.name] ?? generic)(detail);
  return {
    headline: written.headline ?? 'Done',
    note: written.note,
    facts: written.facts ?? [],
    things: written.things ?? [],
    more: written.more ?? 0,
  };
}

/** The result as it came off the wire, for the step's own "raw result" panel. */
export function rawDetail(detail: ToolDetail | null): string | null {
  if (!detail) return null;
  try {
    return JSON.stringify(detail, null, 2);
  } catch {
    return null;
  }
}
