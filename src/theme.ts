import { theme as antdAlgorithm, type ThemeConfig } from 'antd';

/**
 * The design system: one palette, two schemes, three consumers.
 *
 * This app is a sibling of Friends Kitchen, not part of it, so it cannot import the
 * Friends Kitchen's Tailwind config — but it should still look like the same product.
 * Every value in `C` and in the light scheme below is copied from
 * `friends-kitchen-frontend/tailwind.config.js` and `friends-kitchen-frontend/src/theme/antdTheme.ts`;
 * if a colour moves there, move it here too.
 *
 * Friends Kitchen's *back office* is the right reference, not its customer screens:
 * both are desk tools driven with a keyboard, so the surfaces here are the
 * admin's — paper cards on cream, no borders, a hairline ring and a soft
 * shadow, filled fields, pill buttons.
 *
 * Everything scheme-dependent lives in `PALETTE` and reaches the page three
 * ways:
 *
 *   `makeTheme()`  → antd's own components, which need real colour values
 *   `cssVariables()` → custom properties on <html>, for stylesheet rules
 *   `V`            → the same variables as strings, for inline styles
 *
 * One source, so a colour can never be right in the stylesheet and wrong in a
 * component.
 */

export type ColorScheme = 'light' | 'dark';

/** Friends Kitchen's brand colours. Scheme-independent by definition. */
export const C = {
  ink: '#0D0D0F',
  charcoal: '#1C1C1F',
  ash: '#76767E',
  mist: '#E9E9EE',
  cream: '#F4F4F7',
  paper: '#FFFFFF',
  amber: '#FFC72C',
  amberHover: '#F0B400',
  amberSoft: '#FFF6DF',
  amberDark: '#8A6000',
  flame: '#DA291C',
  flameSoft: '#FDECEE',
  leaf: '#12A150',
  leafSoft: '#E4F7EC',
} as const;

/** Friends Kitchen's two families, in the same two roles. */
export const FONT = {
  display: "'Plus Jakarta Sans', Inter, system-ui, sans-serif",
  sans: "Inter, system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
} as const;

interface Palette {
  bg: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  /** A hairline that has to be visible — dividers, the header's underline. */
  border: string;
  borderStrong: string;
  /**
   * What a field is filled with, and what it turns on hover.
   *
   * Deeper than the sunken surfaces beside it, and deliberately so: a chip or a
   * tile sits on the page as often as in a card, but every field on this screen
   * sits *inside* a white one, and cream on paper is four points of luminance —
   * near enough to nothing on a desk monitor at an angle. The fill is what tells
   * you where the box is, since this design draws no outlines around its
   * controls.
   */
  field: string;
  fieldHover: string;
  /** The near-invisible edge Friends Kitchen's cards carry: `ring-1 ring-ink/[0.04]`. */
  ring: string;
  /** Headings. Friends Kitchen sets these a shade darker than its body text. */
  ink: string;
  text: string;
  textSoft: string;
  textFaint: string;
  amber: string;
  amberHover: string;
  amberInk: string;
  amberSurface: string;
  amberEdge: string;
  leaf: string;
  leafInk: string;
  leafSurface: string;
  flame: string;
  flameInk: string;
  flameSurface: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  /** shadow-brand — the glow under an amber CTA. */
  shadowBrand: string;
  shadowBrandLg: string;
  glass: string;
}

const PALETTE: Record<ColorScheme, Palette> = {
  // Straight from Friends Kitchen. Nothing here is an approximation.
  light: {
    bg: C.cream,
    surface: C.paper,
    surfaceRaised: C.paper,
    surfaceSunken: C.cream,
    border: C.mist,
    borderStrong: 'rgba(118,118,126,0.32)',
    field: C.mist,
    fieldHover: '#E0E0E8',
    ring: 'rgba(13,13,15,0.04)',
    ink: C.ink,
    text: C.charcoal,
    textSoft: '#4B4B54',
    textFaint: C.ash,
    amber: C.amber,
    amberHover: C.amberHover,
    amberInk: C.amberDark,
    amberSurface: C.amberSoft,
    amberEdge: 'rgba(255,199,44,0.50)',
    leaf: C.leaf,
    leafInk: C.leaf,
    leafSurface: C.leafSoft,
    flame: C.flame,
    flameInk: C.flame,
    flameSurface: C.flameSoft,
    shadowSm: '0 1px 2px rgba(13,13,15,0.04), 0 2px 8px rgba(13,13,15,0.04)',
    shadowMd: '0 2px 6px rgba(13,13,15,0.04), 0 10px 28px rgba(13,13,15,0.06)',
    shadowLg: '0 8px 20px rgba(13,13,15,0.07), 0 28px 56px rgba(13,13,15,0.10)',
    shadowBrand: '0 4px 14px rgba(255,199,44,0.50)',
    shadowBrandLg: '0 8px 26px rgba(255,199,44,0.60)',
    glass: 'rgba(255,255,255,0.85)',
  },
  // Friends Kitchen has no dark mode, so this is the same palette read in the dark:
  // the same brand hues, the same relationships, inverted surfaces.
  dark: {
    bg: '#0B0B0E',
    surface: '#161619',
    surfaceRaised: '#1D1D21',
    surfaceSunken: '#101014',
    border: '#26262B',
    borderStrong: 'rgba(160,160,172,0.30)',
    // Lighter than the card rather than darker: on the dark scheme a sunken
    // field and the surface behind it are six points apart, and the pair the
    // eye can actually separate is the lit one.
    field: '#212128',
    fieldHover: '#282830',
    ring: 'rgba(255,255,255,0.05)',
    ink: '#FAFAFC',
    text: '#EDEDF0',
    textSoft: '#B6B6C0',
    textFaint: '#87878F',
    amber: C.amber,
    amberHover: C.amberHover,
    amberInk: '#FFD973',
    amberSurface: 'rgba(255,199,44,0.13)',
    amberEdge: 'rgba(255,199,44,0.38)',
    leaf: '#2FBF6B',
    leafInk: '#5EDB94',
    leafSurface: 'rgba(47,191,107,0.14)',
    flame: '#FF5C4D',
    flameInk: '#FF8C81',
    flameSurface: 'rgba(255,92,77,0.14)',
    shadowSm: '0 1px 2px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
    shadowMd: '0 2px 8px rgba(0,0,0,0.45), 0 16px 40px rgba(0,0,0,0.4)',
    shadowLg: '0 12px 28px rgba(0,0,0,0.5), 0 40px 80px rgba(0,0,0,0.55)',
    shadowBrand: '0 4px 14px rgba(255,199,44,0.28)',
    shadowBrandLg: '0 8px 26px rgba(255,199,44,0.36)',
    glass: 'rgba(22,22,25,0.85)',
  },
};

/** The palette as custom properties, to be set on the document root. */
export function cssVariables(scheme: ColorScheme): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(PALETTE[scheme]).map(([key, value]) => [
        `--fk-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`,
        value,
      ]),
    ),
    '--fk-font-display': FONT.display,
    '--fk-font-sans': FONT.sans,
    '--fk-font-mono': FONT.mono,
  };
}

/**
 * The same palette for inline styles.
 *
 * Referencing the variable rather than the value is what lets a component's
 * inline styles follow the scheme without re-rendering on a theme change.
 */
export const V = {
  bg: 'var(--fk-bg)',
  surface: 'var(--fk-surface)',
  surfaceRaised: 'var(--fk-surface-raised)',
  surfaceSunken: 'var(--fk-surface-sunken)',
  border: 'var(--fk-border)',
  borderStrong: 'var(--fk-border-strong)',
  ring: 'var(--fk-ring)',
  ink: 'var(--fk-ink)',
  text: 'var(--fk-text)',
  textSoft: 'var(--fk-text-soft)',
  textFaint: 'var(--fk-text-faint)',
  amber: 'var(--fk-amber)',
  amberInk: 'var(--fk-amber-ink)',
  amberSurface: 'var(--fk-amber-surface)',
  amberEdge: 'var(--fk-amber-edge)',
  leaf: 'var(--fk-leaf)',
  leafInk: 'var(--fk-leaf-ink)',
  leafSurface: 'var(--fk-leaf-surface)',
  flame: 'var(--fk-flame)',
  flameInk: 'var(--fk-flame-ink)',
  flameSurface: 'var(--fk-flame-surface)',
  shadowSm: 'var(--fk-shadow-sm)',
  shadowMd: 'var(--fk-shadow-md)',
  shadowLg: 'var(--fk-shadow-lg)',
  glass: 'var(--fk-glass)',
  fontDisplay: 'var(--fk-font-display)',
  fontMono: 'var(--fk-font-mono)',
} as const;

/** rounded-2xl on the controls, rounded-xl3 on the surfaces they open. */
const RADIUS = 16;

/** antd, wearing the palette — the same overrides Friends Kitchen's back office uses. */
export function makeTheme(scheme: ColorScheme): ThemeConfig {
  const p = PALETTE[scheme];

  /**
   * Every field renders as antd's `filled` variant, which is what Friends Kitchen's
   * controls look like: a filled box, no border. These are the tokens that
   * variant reads for its backgrounds.
   *
   * Two departures from Friends Kitchen, both because of where these fields sit. The
   * Friends Kitchen fills a field with cream and repaints it white on focus — it can,
   * because its fields sit on a cream page. Every field here sits inside a white
   * card, so cream barely reads as a box at all and white on focus is a field
   * that vanishes the moment it is clicked. So the fill is a shade deeper than
   * the surfaces around it, it stays put through focus, and focus is said in
   * amber on the border instead — which is the one thing the fill cannot say.
   */
  const filledField = {
    colorFillTertiary: p.field, // resting fill
    colorFillSecondary: p.fieldHover, // hover
    // Read as the focus fill by Input and InputNumber (via `activeBg`) and by
    // Select (directly), and as the backdrop of the Select's clear button, which
    // has to match the field it sits on.
    colorBgContainer: p.field,
    activeBg: p.field,
    activeBorderColor: p.amber,
    hoverBorderColor: 'transparent',
    activeShadow: p.shadowMd,
    colorErrorBg: p.field,
    colorErrorBgHover: p.fieldHover,
    colorErrorText: p.text,
    borderRadius: RADIUS,
    borderRadiusLG: RADIUS,
  };

  return {
    algorithm: scheme === 'dark' ? antdAlgorithm.darkAlgorithm : antdAlgorithm.defaultAlgorithm,

    token: {
      colorPrimary: p.amber,
      colorError: p.flame,
      colorSuccess: p.leaf,
      colorInfo: p.amber,
      colorWarning: p.amber,

      colorText: p.text,
      colorTextHeading: p.ink,
      colorTextSecondary: p.textSoft,
      colorTextDescription: p.textFaint,
      colorTextPlaceholder: p.textFaint,
      colorIcon: p.textFaint,
      colorIconHover: p.text,

      colorBgLayout: 'transparent',
      colorBgBase: p.bg,
      colorBgContainer: p.surface,
      colorBgElevated: p.surfaceRaised,
      // Friends Kitchen draws no borders on its controls; what separates a field from
      // the card behind it is its fill, not an outline.
      colorBorder: 'transparent',
      colorBorderSecondary: 'transparent',
      colorSplit: p.border,

      fontFamily: FONT.sans,
      fontFamilyCode: FONT.mono,
      fontSize: 14,
      lineHeight: 1.6,
      controlHeight: 44, // Friends Kitchen admin's field height
      borderRadius: RADIUS,
      borderRadiusLG: RADIUS,
      borderRadiusSM: 12,

      boxShadow: p.shadowMd,
      boxShadowSecondary: p.shadowLg,
      motionDurationFast: '0.12s',
      motionDurationMid: '0.15s',
      motionEaseInOut: 'cubic-bezier(0.22, 1, 0.36, 1)',

      wireframe: false,
    },

    components: {
      // Pills at every size — the single strongest "same app" signal Friends Kitchen
      // has. Amber is a light colour, so the label is ink rather than antd's
      // default white, in both schemes: the amber itself does not change.
      Button: {
        primaryColor: C.ink,
        primaryShadow: p.shadowBrand,
        defaultShadow: 'none',
        dangerShadow: 'none',
        defaultBg: p.surfaceSunken,
        defaultColor: p.text,
        defaultBorderColor: 'transparent',
        defaultHoverBorderColor: 'transparent',
        defaultActiveBorderColor: 'transparent',
        fontWeight: 700,
        borderRadius: 999,
        borderRadiusLG: 999,
        borderRadiusSM: 999,
        paddingInline: 22,
        paddingInlineLG: 28,
        controlHeight: 44,
        controlHeightLG: 52,
      },
      Input: {
        ...filledField,
        // 10 rather than 12: antd's line-height is 22px against Tailwind's 20,
        // and this is what lands the field back on 44px.
        paddingBlock: 10,
        paddingInline: 16,
        inputFontSize: 14,
      },
      InputNumber: {
        ...filledField,
        paddingBlock: 10,
        paddingInline: 16,
        inputFontSize: 14,
      },
      Select: {
        ...filledField,
        optionSelectedBg: p.amberSurface,
        optionSelectedColor: p.text,
        optionSelectedFontWeight: 600,
        optionActiveBg: p.surfaceSunken,
        optionPadding: '9px 14px',
        optionFontSize: 14,
        optionHeight: 40,
        borderRadiusLG: 20, // the dropdown card
        paddingSM: 8,
      },
      Switch: {
        // Friends Kitchen's toggle, to the pixel: 48×28 track, 24px knob, 2px inset.
        trackHeight: 28,
        trackMinWidth: 48,
        trackPadding: 2,
        handleSize: 24,
        handleShadow: p.shadowSm,
        colorPrimary: p.leaf,
        colorPrimaryHover: p.leaf,
        colorTextQuaternary: 'rgba(118,118,126,0.4)',
        colorTextTertiary: 'rgba(118,118,126,0.4)',
      },
      Alert: {
        borderRadiusLG: RADIUS,
        defaultPadding: '14px 20px',
        withDescriptionPadding: '16px 20px',
      },
      Tooltip: {
        colorBgSpotlight: scheme === 'dark' ? '#2A2A33' : C.ink,
        borderRadius: 12,
      },
      Progress: {
        defaultColor: p.amber,
        remainingColor: p.surfaceSunken,
      },
      Empty: {
        colorTextDescription: p.textFaint,
      },
      Form: {
        labelColor: p.textFaint,
        labelFontSize: 12,
        itemMarginBottom: 20,
        verticalLabelPadding: '0 0 8px',
      },
    },
  };
}
