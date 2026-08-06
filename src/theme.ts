import type { ThemeConfig } from 'antd';

/**
 * antd in the Friends Kitchen palette.
 *
 * This app is a sibling of the kiosk, not part of it, so it cannot import the
 * kiosk's Tailwind config — but it should still look like the same product.
 * These hexes are copied from `kiosk-frontend/tailwind.config.js`; if a colour
 * moves there, move it here too.
 */

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

const SHADOW_CARD = '0 2px 6px rgba(13,13,15,0.04), 0 10px 28px rgba(13,13,15,0.06)';
const SHADOW_LIFT = '0 8px 20px rgba(13,13,15,0.07), 0 28px 56px rgba(13,13,15,0.10)';
const RADIUS = 16;

export const agentTheme: ThemeConfig = {
  token: {
    colorPrimary: C.amber,
    colorError: C.flame,
    colorSuccess: C.leaf,
    colorInfo: C.amber,

    colorText: C.charcoal,
    colorTextHeading: C.ink,
    colorTextDescription: C.ash,
    colorTextPlaceholder: C.ash,

    colorBgLayout: C.cream,
    colorBgContainer: C.paper,
    colorBgElevated: C.paper,
    colorBorder: C.mist,
    colorSplit: C.mist,

    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 14,
    controlHeight: 44,
    borderRadius: RADIUS,
    borderRadiusLG: RADIUS,
    borderRadiusSM: 10,

    boxShadow: SHADOW_CARD,
    boxShadowSecondary: SHADOW_LIFT,
    motionDurationMid: '0.15s',
  },

  components: {
    // Amber is a light colour: antd's default white button text is unreadable
    // on it, so primary buttons take the ink text the kiosk's CTAs use.
    Button: {
      primaryColor: C.ink,
      fontWeight: 700,
      paddingInlineLG: 28,
      controlHeightLG: 48,
    },
    Card: {
      paddingLG: 24,
      colorBorderSecondary: C.mist,
    },
    Segmented: {
      itemSelectedBg: C.ink,
      itemSelectedColor: C.paper,
      trackBg: C.cream,
      controlHeight: 44,
      borderRadius: RADIUS,
    },
    Input: { paddingBlock: 10, paddingInline: 16 },
    InputNumber: { paddingBlock: 6, paddingInline: 12 },
    Select: {
      optionSelectedBg: C.amberSoft,
      optionSelectedFontWeight: 600,
      optionPadding: '9px 14px',
    },
    Switch: { colorPrimary: C.leaf, colorPrimaryHover: C.leaf },
    Timeline: { dotBg: 'transparent', tailColor: C.mist },
    Tag: { borderRadiusSM: 999 },
  },
};
