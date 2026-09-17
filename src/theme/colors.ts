/**
 * One cool family, hue 250.
 *
 * The old palette put the surfaces at hue 60-75 — a yellow-green greige — and
 * every piece of text at hue 217-221, cool blue. Two near-opposite neutrals at
 * 12-24% saturation is the recipe for mud: the eye cannot resolve the field as
 * warm or as cool, so it reads the whole app as one grey cloud. The lightness
 * steps were never the problem; the hue conflict was.
 *
 * So every neutral is now drawn from the ink's own hue, stepped in OKLCH and
 * converted to hex here (React Native cannot parse `oklch()`). Chroma rises
 * as the tone darkens, which is what keeps a tinted neutral from going flat.
 *
 * Three floors this palette holds, measured against `bg`:
 *   - `textMuted` carries body text, so it clears 4.5:1 (was 2.37:1).
 *   - `border` draws the edge of a card, so it clears 3:1 (was 1.30:1 and
 *     invisible — the single biggest reason the app read as one field).
 *   - `success` labels a taken dose in text, so it clears 4.5:1 (was 3.76:1).
 *
 * `warning` is a fill only. At 1.75:1 it is never legible as text or an icon
 * on the page ground; the dark amber the amber washes already pair with is.
 *
 * Adding a colour: take it from hue 250 if it is a neutral, and check it here
 * before it lands. A warm grey dropped into this set brings the cloud back.
 */
export const C = {
  bg:         '#F7FAFE',
  surface:    '#FFFFFF',
  surface2:   '#D8E1EA',
  primary:    '#1162B9',
  // Coral is the one hot accent: it marks the dose that is due right now and
  // nothing else, so "now" never competes with the cobalt chrome. 3.27:1 — a
  // fill or large text, never a caption.
  due:        '#E7603F',
  primaryDk:  '#004593',
  primaryBg:  '#DEEFFF',
  text:       '#112438',
  textSub:    '#495D72',
  textMuted:  '#617285',
  border:     '#8393A3',
  success:    '#227D4C',
  warning:    '#F2B233',
  danger:     '#C0392B',
  blue:       '#2AA6B8',
  purple:     '#6B4FBF',
} as const;
