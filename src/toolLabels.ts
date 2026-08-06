/**
 * Tool names, in words an operator recognises.
 *
 * The agent's tools are named for the model's benefit (`authorize_payment`),
 * which reads as jargon in a timeline. This maps each to what actually
 * happened, so someone watching a run sees a shopping trip rather than a stack
 * trace. Unknown names fall back to the raw name — a new tool shows up
 * unlabelled rather than invisible.
 */

interface ToolLabel {
  icon: string;
  label: string;
  /** Steps that move money get called out in the timeline. */
  spends?: boolean;
}

const LABELS: Record<string, ToolLabel> = {
  // Shared between both modes
  list_categories: { icon: '🗂️', label: 'Looked at the categories' },
  add_to_cart: { icon: '➕', label: 'Added to the order' },
  apply_coupon: { icon: '🎟️', label: 'Applied the coupon' },

  // API mode
  browse_menu: { icon: '🍔', label: 'Browsed the menu' },
  view_cart: { icon: '🧾', label: 'Checked the order' },
  remove_from_cart: { icon: '➖', label: 'Removed an item' },
  check_coupon: { icon: '🔍', label: 'Checked the coupon' },
  place_order: { icon: '📨', label: 'Placed the order' },
  authorize_payment: { icon: '💳', label: 'Paid', spends: true },
  get_order: { icon: '✅', label: 'Confirmed the order' },

  // Browser mode
  open_kiosk: { icon: '🖥️', label: 'Walked up to the kiosk' },
  read_screen: { icon: '👀', label: 'Read the screen' },
  open_category: { icon: '🗂️', label: 'Opened a category' },
  search_menu: { icon: '🔎', label: 'Searched the menu' },
  go_to_checkout: { icon: '🛒', label: 'Went to checkout' },
  pay: { icon: '💳', label: 'Paid', spends: true },
};

export function toolLabel(name: string): ToolLabel {
  return LABELS[name] ?? { icon: '🔧', label: name };
}
