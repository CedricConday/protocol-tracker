import { t } from '../i18n';
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
 * Where the "Support this app" row goes.
 * TODO(cedric): INSERT GOFUNDME HERE — the row stays disabled until this is a
 * real https:// URL. Note the Play rule above: Google has enforced against the
 * destination link, not just in-app collection, so a direct fundraiser URL is
 * the risk to weigh before shipping to Play.
 */
export const SUPPORT_URL = 'INSERT GOFUNDME HERE';

/** Support address the Send Feedback screen hands to the user's mail app. */
export const FEEDBACK_EMAIL = 'cedric@condaydigital.com';

/**
 * Shown wherever the app could be mistaken for giving medical guidance
 * (Apple 1.4.1). A function, not a constant: a constant is evaluated at import
 * and would hold whichever language was active then — on the one string in the
 * app that has to be right.
 *
 * THE GERMAN IS A WORKING TRANSLATION, NOT A REVIEWED ONE. It says what the
 * English says, but this is the app's legal position and should be read by
 * someone who writes German clinical copy before release.
 */
export const medicalDisclaimer = (): string => t('medicalDisclaimer');
