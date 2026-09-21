import { useWindowDimensions } from 'react-native';

/**
 * Screen width, for the one thing the app does differently on a big screen.
 *
 * An Android tablet is the first real install (2026-09-20), and until then every
 * layout here assumed a phone: flex columns with percentage widths, which
 * stretch rather than break. Stretching is the problem — a 10" landscape screen
 * gave 60-word line lengths and controls spread to the far edges.
 *
 * So there is one rule, not a tablet design: content stops widening past a
 * readable measure and centres. A real two-column Today is worth building after
 * someone has used the app on a tablet, not before.
 */

/** Above this, the window is not a phone held in the hand. */
export const WIDE_SCREEN_MIN_WIDTH = 700;

/**
 * Where content stops widening. Roughly a large phone's worth of column, which
 * keeps line length readable and thumb targets where a hand expects them; the
 * rest of the window is app background, not stretched UI.
 */
export const CONTENT_MAX_WIDTH = 760;

/** True on a tablet, a landscape phone that is wide enough, or a desktop web view. */
export function useIsWideScreen(): boolean {
  const { width } = useWindowDimensions();
  return width >= WIDE_SCREEN_MIN_WIDTH;
}
