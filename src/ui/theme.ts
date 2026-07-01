// Pronatura Noroeste design tokens (Dashboard Extension variant — the capture app
// is a functional field tool: Tide = primary action, Amber = warning only,
// Danger = errors, Success = confirmed). See Planning/DESIGN-pronatura.md.

export const color = {
  // brand + surfaces
  tide: '#1b5c5a',          // primary action / brand
  tideHover: '#164d4b',
  tideSoft: '#e8f3f2',      // selected / active fills
  mangrove: '#0f3634',      // deepest surface
  shell: '#f0f0ed',         // app background
  canvas: '#ffffff',        // cards / inputs
  fog: '#e8e4df',           // borders / dividers
  // text
  ink: '#1e1c19',
  stone: '#6b6760',
  white: '#ffffff',
  // semantic
  warning: '#e07c2a',       // amber — caution only
  warningSoft: '#fbebd8',
  danger: '#b83c2b',        // errors / destructive
  dangerSoft: '#fbeae7',
  success: '#2e7b78',       // confirmed / valid
  successSoft: '#e5f3f2',
};

// Loaded via @expo-google-fonts in App.tsx. Family carries the weight (don't stack fontWeight).
export const font = {
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  display: 'Fraunces_600SemiBold',       // app name / page titles only
  displayLight: 'Fraunces_400Regular',
};

export const radius = { card: 6, input: 4, button: 4, badge: 3 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const type = {
  pageTitle: 22,
  sectionTitle: 16,
  body: 14,
  input: 15,        // a touch larger than 14 for finger entry on tablets
  label: 12,
  caption: 12,
  badge: 11,
};
