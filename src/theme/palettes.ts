/**
 * Three tiers of one palette: light, dim, dark.
 *
 * Every neutral is drawn from a single hue (250) and stepped in OKLCH, then
 * emitted as hex because React Native cannot parse `oklch()`. The palette this
 * replaced put surfaces at hue 60-75 and ink at 217-221 — two near-opposite
 * neutrals at low saturation, which the eye resolves as mud rather than as
 * warm or cool. One family fixes that. Chroma tapers as the ink lightens, so
 * white-ish text on a dark ground stays ink and does not turn cyan.
 *
 * `dim` is not a lighter `dark`. It exists because this app is used by people
 * with MS, where photophobia is common and a true-dark ground at 16:1 is its
 * own kind of glare late at night. Dim lands the same text between 6:1 and 7:1
 * on a ground light enough not to bloom, and it is the tier most patients will
 * sit in — the reason there are three tiers and not two.
 *
 * Floors every tier holds, measured: body text 4.5:1 on its own ground, and a
 * full outline (`border`) 3:1 on `surface`. A card whose edge cannot be
 * resolved is why this app used to read as one undifferentiated field, and
 * contrast sensitivity is measurably reduced in MS even at normal acuity.
 *
 * Generated, not hand-picked. A new token means a value in all three tiers.
 */

export type Palette = {
  /** the page ground */
  bg: string;
  /** a card, lifted off the ground */
  surface: string;
  /** a quieter card, or a card on a card */
  surfaceAlt: string;
  /** a track, a well, a progress groove */
  sunken: string;
  /** a hairline between list rows */
  borderSoft: string;
  /** a full outline: 3:1 on surface in every tier */
  border: string;
  /** a disabled date, a placeholder */
  textFaint: string;
  /** secondary body text: clears 4.5:1 */
  textMuted: string;
  /** supporting text */
  textSub: string;
  /** primary ink */
  text: string;
  /** cobalt: the app's own colour */
  primary: string;
  /** a pressed or heavier cobalt */
  primaryDk: string;
  /** a cobalt wash behind cobalt ink */
  primaryBg: string;
  /** coral: the dose due right now, nothing else */
  due: string;
  /** a second warm mark */
  orange: string;
  /** an informational mark */
  blueBright: string;
  /** water */
  teal: string;
  /** water, filled */
  tealSoft: string;
  /** water wash */
  tealBg: string;
  /** a taken dose, in text: clears 4.5:1 */
  success: string;
  /** a streak, a win */
  successBright: string;
  /** green ink on a green wash */
  successInk: string;
  /** a filled green bar */
  successSoft: string;
  /** green wash */
  successBg: string;
  /** amber: a fill, never text on the ground */
  warning: string;
  /** a second amber */
  warningAlt: string;
  /** amber, filled */
  warningSoft: string;
  /** amber ink on an amber wash */
  warningInk: string;
  /** amber wash */
  warningBg: string;
  /** a destructive action */
  danger: string;
  /** red ink on a red wash */
  dangerInk: string;
  /** a red edge */
  dangerSoft: string;
  /** red wash */
  dangerBg: string;
  /** sleep */
  purple: string;
  /** a second purple */
  purpleAlt: string;
  /** a purple mark */
  purpleBright: string;
  /** purple wash */
  purpleBg: string;
  /** ink on a filled cobalt button */
  onPrimary: string;
};

export const light: Palette = {
  bg: '#F7FAFE',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EFF6',
  sunken: '#D8E1EA',
  borderSoft: '#D8E1EA',
  border: '#8393A3',
  textFaint: '#8393A3',
  textMuted: '#617285',
  textSub: '#495D72',
  text: '#112438',
  primary: '#1162B9',
  primaryDk: '#004593',
  primaryBg: '#DEEFFF',
  due: '#E7603F',
  orange: '#DC631E',
  blueBright: '#0486D3',
  teal: '#2192A8',
  tealSoft: '#60B2C6',
  tealBg: '#CFF9FF',
  success: '#227D4C',
  successBright: '#36A558',
  successInk: '#00572D',
  successSoft: '#94C9A6',
  successBg: '#E0F9E8',
  warning: '#E8A846',
  warningAlt: '#DCA81C',
  warningSoft: '#F8C885',
  warningInk: '#895709',
  warningBg: '#FFF0D3',
  danger: '#B33333',
  dangerInk: '#932B2A',
  dangerSoft: '#FDB1AA',
  dangerBg: '#FFE7E3',
  purple: '#7152B5',
  purpleAlt: '#866EC5',
  purpleBright: '#9E6DE7',
  purpleBg: '#F2EBFF',
  onPrimary: '#FFFFFF',
};

export const dim: Palette = {
  bg: '#1F2329',
  surface: '#272F37',
  surfaceAlt: '#313941',
  sunken: '#3B434D',
  borderSoft: '#404952',
  border: '#6F7C8A',
  textFaint: '#76828E',
  textMuted: '#99A6B5',
  textSub: '#BFC8D3',
  text: '#EEF2F7',
  primary: '#62ADFF',
  primaryDk: '#498DE2',
  primaryBg: '#293647',
  due: '#FF7B5A',
  orange: '#FF894B',
  blueBright: '#58C0FF',
  teal: '#5BC1D9',
  tealSoft: '#59ACBF',
  tealBg: '#153B44',
  success: '#64BA85',
  successBright: '#67D283',
  successInk: '#85D2A0',
  successSoft: '#5B8E6D',
  successBg: '#273B2D',
  warning: '#F0B04F',
  warningAlt: '#EDB836',
  warningSoft: '#C99B5A',
  warningInk: '#F3BB7A',
  warningBg: '#44331B',
  danger: '#FF7A73',
  dangerInk: '#FF9890',
  dangerSoft: '#BD7670',
  dangerBg: '#4A2C2A',
  purple: '#B296FF',
  purpleAlt: '#BCA4FF',
  purpleBright: '#CD9CFF',
  purpleBg: '#38324C',
  onPrimary: '#1F2329',
};

export const dark: Palette = {
  bg: '#0E1217',
  surface: '#151C24',
  surfaceAlt: '#1F262E',
  sunken: '#283039',
  borderSoft: '#2E363F',
  border: '#667381',
  textFaint: '#6F7A86',
  textMuted: '#94A0AD',
  textSub: '#BDC5CE',
  text: '#EBEFF4',
  primary: '#69B3FF',
  primaryDk: '#4F94E9',
  primaryBg: '#1D2A3A',
  due: '#FF8260',
  orange: '#FF8E50',
  blueBright: '#5DC5FF',
  teal: '#60C6DE',
  tealSoft: '#5EB1C4',
  tealBg: '#052D35',
  success: '#6AC08B',
  successBright: '#6DD787',
  successInk: '#89D7A5',
  successSoft: '#5F9271',
  successBg: '#192D20',
  warning: '#F5B554',
  warningAlt: '#F2BD3D',
  warningSoft: '#CEA05E',
  warningInk: '#F8C07E',
  warningBg: '#36250D',
  danger: '#FF8079',
  dangerInk: '#FF9D94',
  dangerSoft: '#C27B75',
  dangerBg: '#3B1E1C',
  purple: '#B99CFF',
  purpleAlt: '#C1A9FF',
  purpleBright: '#D2A1FF',
  purpleBg: '#2A243D',
  onPrimary: '#0E1217',
};

export const PALETTES = { light, dim, dark };
export type ThemeMode = keyof typeof PALETTES;
export const THEME_MODES: ThemeMode[] = ['light', 'dim', 'dark'];
