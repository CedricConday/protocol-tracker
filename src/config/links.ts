/**
 * Outbound links. Everything here opens in the system browser or mail client —
 * nothing is collected inside the app.
 *
 * Store rules this file exists to respect:
 *  - Apple 3.2.2(iv): an app raising money for a cause must be free and may only
 *    collect funds OUTSIDE the app (Safari/SMS). So SUPPORT_URL must be a link out.
 *  - Apple 3.2.1(vii): a gift must never be "connected to or associated at any point
 *    in time with receiving digital content or services". Nothing in this app may
 *    change behaviour based on whether someone donated. Do not add a supporter tier.
 *  - Google Play requires donations go to a validated tax-exempt organisation and
 *    has enforced this against the LINK, not just in-app collection. SUPPORT_URL
 *    therefore points at the community page, not at a fundraiser.
 */

/** TODO(cedric): real Facebook page URL — placeholder, will not open as-is. */
export const COMMUNITY_URL = 'https://www.facebook.com/REPLACE-ME-protocol-tracker';

/**
 * Where the "Support this app" row goes. Points at the community page; the
 * fundraiser lives on that page, not here.
 * TODO(cedric): confirm this should stay COMMUNITY_URL and not a direct link.
 */
export const SUPPORT_URL = COMMUNITY_URL;

/** TODO(cedric): real support address. */
export const FEEDBACK_EMAIL = 'REPLACE-ME@example.com';

/** Shown wherever the app could be mistaken for giving medical guidance (Apple 1.4.1). */
export const MEDICAL_DISCLAIMER =
  'Protocol Tracker records what you enter. It does not give medical advice, ' +
  'interpret your results, or recommend doses. Always talk to your doctor before ' +
  'making any decision about your treatment.';
