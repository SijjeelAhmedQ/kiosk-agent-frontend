/**
 * The line icons this app draws itself.
 *
 * Everything else on these pages uses an emoji, which is right for a panel's
 * glyph tile: it is one character, it themes itself, and it carries no weight.
 * The delivery panel is the exception. Its icon changes with the state of a job
 * — waiting, riding, arrived, failed — and an emoji set that reads consistently
 * across those four does not exist: 🛵 and ✅ sit at different weights, colour
 * themselves differently in each font, and cannot take the panel's tone.
 *
 * So these are strokes, in `currentColor`, at the weight `Panel`'s own chevron
 * is drawn at. That is what lets a headline tile go amber for "on its way" and
 * green for "delivered" without the glyph fighting it.
 */

import type { SVGProps } from 'react';

type Props = SVGProps<SVGSVGElement>;

/** Every icon here is the same box, weight and cap. One place to change it. */
function Glyph({ children, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** A courier on the way. The delivery panel's resting state. */
export function Scooter(props: Props) {
  return (
    <Glyph {...props}>
      <circle cx="6" cy="17.5" r="2.5" />
      <circle cx="18" cy="17.5" r="2.5" />
      <path d="M8.5 17.5h7" />
      <path d="M15.5 17.5 13 8H9.5" />
      <path d="M13 8h4l1.6 7" />
      <path d="M4 12h4" />
    </Glyph>
  );
}

/** Where the order is collected. */
export function Storefront(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M4 10v9h16v-9" />
      <path d="M3 10 4.6 5h14.8L21 10a2.6 2.6 0 0 1-4.5 1.6A2.6 2.6 0 0 1 12 11.4a2.6 2.6 0 0 1-4.5.2A2.6 2.6 0 0 1 3 10Z" />
      <path d="M10 19v-4.5h4V19" />
    </Glyph>
  );
}

/** Where it is going. */
export function Home(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5h4v5" />
    </Glyph>
  );
}

/** A place on a map — used when there is a fix but no journey yet. */
export function MapPin(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </Glyph>
  );
}

/** Waiting on something that has not happened yet. */
export function Hourglass(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M7 3h10" />
      <path d="M7 21h10" />
      <path d="M7 3c0 4.5 5 5.6 5 9s-5 4.5-5 9" />
      <path d="M17 3c0 4.5-5 5.6-5 9s5 4.5 5 9" />
    </Glyph>
  );
}

/** The one success. Nothing else in the delivery panel is allowed this. */
export function CheckCircle(props: Props) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.3 2.7 2.7L16 9.7" />
    </Glyph>
  );
}

/** Something went wrong on the way. */
export function AlertTriangle(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M12 4.2 21 19.5H3L12 4.2Z" />
      <path d="M12 10v4" />
      <path d="M12 16.8v.01" />
    </Glyph>
  );
}

/** Called off deliberately — not the same as failed, and drawn differently. */
export function StopOctagon(props: Props) {
  return (
    <Glyph {...props}>
      <path d="M8.6 3.5h6.8L20.5 8.6v6.8l-5.1 5.1H8.6l-5.1-5.1V8.6l5.1-5.1Z" />
      <path d="M9.5 9.5h5v5h-5z" />
    </Glyph>
  );
}

/** The courier said a word we do not recognise. Honest, rather than hopeful. */
export function QuestionCircle(props: Props) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.6" />
      <path d="M12 17.4v.01" />
    </Glyph>
  );
}
