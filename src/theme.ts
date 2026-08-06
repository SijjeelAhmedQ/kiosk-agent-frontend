import { theme as antdAlgorithm, type ThemeConfig } from 'antd';

/**
 * The design system: one palette, two schemes, three consumers.
 *
 * This app is a sibling of the kiosk, not part of it, so it cannot import the
 * kiosk's Tailwind config — but it should still look like the same product.
 * The brand hexes in `C` are copied from `kiosk-frontend/tailwind.config.js`;
 * if a colour moves there, move it here too.
 *
 * Everything else is scheme-dependent and lives in `PALETTE`. It reaches the
 * page three ways:
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
  amberSoft: '#FFF6DF',
  amberDark: '#8A6000',
  flame: '#DA291C',
  flameSoft: '#FDECEA',
  leaf: '#12A150',
  leafSoft: '#E7F6EE',
} as const;

interface Palette {
  bg: string;
  bgVeil: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;
  text: string;
  textSoft: string;
  textFaint: string;
  amber: string;
  amberInk: string;
  amberSurface: string;
  amberEdge: string;
  leaf: string;
  leafInk: string;
  leafSurface: string;
  flame: string;
  flameInk: string;
  flameSurface: string;
  /** The two ambient washes behind the page. */
  aura1: string;
  aura2: string;
  shadowSm: string;
  shadowMd: string;
  shadowLg: string;
  glass: string;
}

const PALETTE: Record<ColorScheme, Palette> = {
  light: {
    bg: '#F4F4F8',
    bgVeil: 'rgba(255,255,255,0.72)',
    surface: '#FFFFFF',
    surfaceRaised: '#FFFFFF',
    surfaceSunken: '#F3F3F7',
    border: '#E8E8F0',
    borderStrong: '#D8D8E3',
    text: '#111116',
    textSoft: '#4C4C58',
    textFaint: '#83838F',
    amber: '#FFC72C',
    amberInk: '#7A5400',
    amberSurface: '#FFF6DF',
    amberEdge: 'rgba(255,199,44,0.45)',
    leaf: '#0F9D50',
    leafInk: '#0A6B37',
    leafSurface: '#E8F6EE',
    flame: '#DA291C',
    flameInk: '#A31C12',
    flameSurface: '#FDECEA',
    aura1: 'rgba(255,199,44,0.30)',
    aura2: 'rgba(18,161,80,0.09)',
    shadowSm: '0 1px 2px rgba(13,13,15,0.05), 0 2px 8px rgba(13,13,15,0.04)',
    shadowMd: '0 2px 6px rgba(13,13,15,0.05), 0 12px 32px rgba(13,13,15,0.07)',
    shadowLg: '0 10px 24px rgba(13,13,15,0.08), 0 32px 64px rgba(13,13,15,0.12)',
    glass: 'rgba(255,255,255,0.78)',
  },
  dark: {
    bg: '#09090C',
    bgVeil: 'rgba(10,10,14,0.72)',
    surface: '#131318',
    surfaceRaised: '#1A1A21',
    surfaceSunken: '#0F0F14',
    border: '#26262F',
    borderStrong: '#35353F',
    text: '#F3F3F6',
    textSoft: '#B4B4C0',
    textFaint: '#7B7B89',
    amber: '#FFC72C',
    amberInk: '#FFD973',
    amberSurface: 'rgba(255,199,44,0.13)',
    amberEdge: 'rgba(255,199,44,0.32)',
    leaf: '#2FBF6B',
    leafInk: '#5EDB94',
    leafSurface: 'rgba(47,191,107,0.14)',
    flame: '#FF5C4D',
    flameInk: '#FF8C81',
    flameSurface: 'rgba(255,92,77,0.14)',
    aura1: 'rgba(255,199,44,0.16)',
    aura2: 'rgba(47,191,107,0.10)',
    shadowSm: '0 1px 2px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.3)',
    shadowMd: '0 2px 8px rgba(0,0,0,0.45), 0 16px 40px rgba(0,0,0,0.4)',
    shadowLg: '0 12px 28px rgba(0,0,0,0.5), 0 40px 80px rgba(0,0,0,0.55)',
    glass: 'rgba(19,19,24,0.76)',
  },
};

/** The palette as custom properties, to be set on the document root. */
export function cssVariables(scheme: ColorScheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PALETTE[scheme]).map(([key, value]) => [
      `--fk-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`,
      value,
    ]),
  );
}

/**
 * The same palette for inline styles.
 *
 * Referencing the variable rather than the value is what lets a component's
 * inline styles follow the scheme without re-rendering on a theme change.
 */
export const V = {
  bg: 'var(--fk-bg)',
  bgVeil: 'var(--fk-bg-veil)',
  surface: 'var(--fk-surface)',
  surfaceRaised: 'var(--fk-surface-raised)',
  surfaceSunken: 'var(--fk-surface-sunken)',
  border: 'var(--fk-border)',
  borderStrong: 'var(--fk-border-strong)',
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
} as const;

const RADIUS = 14;

/** antd, wearing the palette. */
export function makeTheme(scheme: ColorScheme): ThemeConfig {
  const p = PALETTE[scheme];

  return {
    algorithm: scheme === 'dark' ? antdAlgorithm.darkAlgorithm : antdAlgorithm.defaultAlgorithm,

    token: {
      colorPrimary: p.amber,
      colorError: p.flame,
      colorSuccess: p.leaf,
      colorInfo: p.amber,
      colorWarning: p.amber,

      colorText: p.text,
      colorTextHeading: p.text,
      colorTextSecondary: p.textSoft,
      colorTextDescription: p.textFaint,
      colorTextPlaceholder: p.textFaint,

      colorBgLayout: 'transparent',
      colorBgBase: p.bg,
      colorBgContainer: p.surface,
      colorBgElevated: p.surfaceRaised,
      colorBorder: p.border,
      colorBorderSecondary: p.border,
      colorSplit: p.border,

      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      fontFamilyCode: "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace",
      fontSize: 14,
      lineHeight: 1.6,
      controlHeight: 44,
      borderRadius: RADIUS,
      borderRadiusLG: RADIUS,
      borderRadiusSM: 10,

      boxShadow: p.shadowMd,
      boxShadowSecondary: p.shadowLg,
      motionDurationFast: '0.12s',
      motionDurationMid: '0.2s',
      motionEaseInOut: 'cubic-bezier(0.22, 1, 0.36, 1)',

      wireframe: false,
    },

    components: {
      // Amber is a light colour: antd's default white button text is unreadable
      // on it, so primary buttons take the ink text the kiosk's CTAs use — in
      // both schemes, because the amber itself does not change.
      Button: {
        primaryColor: C.ink,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        fontWeight: 650,
        paddingInlineLG: 26,
        controlHeightLG: 50,
        borderRadiusLG: RADIUS,
      },
      Input: {
        paddingBlock: 11,
        paddingInline: 15,
        activeShadow: `0 0 0 4px ${p.amberEdge}`,
        hoverBorderColor: p.borderStrong,
        activeBorderColor: p.amber,
        colorBgContainer: p.surfaceSunken,
      },
      InputNumber: {
        paddingBlock: 8,
        paddingInline: 12,
        activeShadow: `0 0 0 4px ${p.amberEdge}`,
        hoverBorderColor: p.borderStrong,
        activeBorderColor: p.amber,
        colorBgContainer: p.surfaceSunken,
      },
      Select: {
        optionSelectedBg: p.amberSurface,
        optionSelectedFontWeight: 600,
        optionPadding: '10px 14px',
        optionHeight: 40,
        selectorBg: p.surfaceSunken,
        colorBorder: p.border,
        hoverBorderColor: p.borderStrong,
        activeBorderColor: p.amber,
        activeOutlineColor: p.amberEdge,
        borderRadiusSM: 10,
      },
      Switch: {
        colorPrimary: p.leaf,
        colorPrimaryHover: p.leaf,
        handleShadow: p.shadowSm,
      },
      Alert: {
        borderRadiusLG: 12,
        defaultPadding: '12px 16px',
        withDescriptionPadding: '14px 16px',
      },
      Tooltip: {
        colorBgSpotlight: scheme === 'dark' ? '#2A2A33' : C.ink,
        borderRadius: 10,
      },
      Progress: {
        defaultColor: p.amber,
        remainingColor: p.surfaceSunken,
      },
      Empty: {
        colorTextDescription: p.textFaint,
      },
      Form: {
        labelColor: p.text,
        labelFontSize: 13,
        itemMarginBottom: 20,
        verticalLabelPadding: '0 0 6px',
      },
    },
  };
}
