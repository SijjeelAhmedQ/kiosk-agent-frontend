/**
 * Tool names as a person would say them.
 *
 * The buyer's six are the only ones that reach this console — the merchant's
 * calls go down its own task stream — but the merchant's are listed too, so
 * that opening the merchant's stream directly reads the same way.
 *
 * Anything unknown falls back to the raw name with its underscores knocked out,
 * which is wrong in a readable way rather than blank.
 */

const LABELS: Record<string, string> = {
  // The buyer's
  discover_merchant: 'reading the merchant’s card',
  talk_to_merchant: 'talking to the merchant',
  offer_coupon: 'offering the coupon',
  check_wallet: 'checking the wallet',
  authorize_payment: 'authorising payment',
  verify_order: 'verifying with the restaurant',

  // The merchant's
  list_categories: 'listing categories',
  browse_menu: 'looking up the menu',
  add_to_basket: 'adding to the basket',
  remove_from_basket: 'removing from the basket',
  view_basket: 'checking the basket',
  send_quote: 'sending a quote',
  check_coupon: 'checking the coupon',
  confirm_order: 'confirming the order',
  redeem_coupon: 'redeeming the coupon',
  take_payment: 'taking payment',
  look_up_order: 'looking the order up',
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, ' ');
}
