import { TextStyle } from 'react-native';

// Type scale — clear hierarchy, considered line-heights.
// Display sizes get tight tracking; small caps get open tracking.

export const typography = {
  display:    34,
  heading:    26,
  subheading: 19,
  bodyLg:     17,
  body:       15,
  small:      13,
  tiny:       11,
} as const;

export const weight = {
  regular:  '400',
  medium:   '500',
  semibold: '600',
  bold:     '700',
  black:    '800',
} as const;

export const text: Record<string, TextStyle> = {
  display: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.3,
    lineHeight: 30,
  },
  subheading: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 24,
  },
  bodyLg: {
    fontSize: 17,
    fontWeight: '500',
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  small: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  caps: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    lineHeight: 14,
  },
};
