// Design tokens — single source of truth for spacing, radius, shadow, motion.
// Premium apps breathe: spacing is generous, radius is consistent, shadows are soft.

export const space = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radius = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  pill: 999,
} as const;

export const shadow = {
  subtle: {
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  medium: {
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  heavy: {
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
} as const;

export const motion = {
  tapScale:    0.97,
  spring:      { damping: 18, stiffness: 220, mass: 1 },
  springSoft:  { damping: 22, stiffness: 160, mass: 1 },
  springSnap:  { damping: 14, stiffness: 320, mass: 1 },
  duration: {
    fast:   140,
    base:   240,
    slow:   420,
  },
} as const;
