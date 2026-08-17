/**
 * The dispatcher's tools, in words.
 *
 * The log shows what the agent did, and `collect_from_restaurant` is a function
 * name rather than a thing a person does. Anything unrecognised falls back to
 * the raw name with its underscores knocked out — a new tool should read a
 * little roughly, not disappear.
 */

const LABELS: Record<string, string> = {
  read_delivery_request: 'Read the delivery request',
  accept_job: 'Accepted the job',
  reject_job: 'Refused the job',
  assign_rider: 'Assigned a rider',
  collect_from_restaurant: 'Collected from the restaurant',
  deliver_to_customer: 'Delivered to the customer',
  report_problem: 'Reported a problem',
};

export function toolLabel(name: string): string {
  return LABELS[name] ?? name.replace(/_/g, ' ');
}
