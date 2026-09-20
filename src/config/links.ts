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
 *    has enforced this against the LINK, not just in-app collection. A SUPPORT_URL
 *    must therefore point at a page that is not a fundraiser.
 *
 * 2026-09-20: COMMUNITY_URL (a placeholder Facebook page for Protocol Tracker) was
 * deleted. There is no per-project page and never will be — the website is the
 * surface people are pointed at, and contact runs through FEEDBACK_EMAIL or
 * WhatsApp below. Do not reintroduce a social link here without a screen that
 * actually uses it.
 */

/*
 * SUPPORT_URL and the Settings row that opened it were removed on 2026-09-17 at
 * Cedric's request. The store rules above are kept because they are the reason
 * this is not a small decision to reverse: if a support link ever returns it
 * must still be a link OUT, nothing in the app may unlock from it, and Google
 * has enforced against the destination, not just in-app collection.
 */

/** Support address the Send Feedback screen hands to the user's mail app. */
export const FEEDBACK_EMAIL = 'cedric@condaydigital.com';

/**
 * Support number the Send Feedback screen hands to WhatsApp, in full
 * international form, digits only — no `+`, spaces or dashes. wa.me rejects
 * anything else.
 *
 * If this ever goes back to a placeholder, the WhatsApp button renders disabled
 * and says why — the same stance SUPPORT_URL takes above. A contact route that
 * silently opens a dead chat is worse than a button admitting it is not wired
 * up.
 */
export const FEEDBACK_WHATSAPP = '491725327581';

/** True once FEEDBACK_WHATSAPP is a plausible international number. */
export const hasWhatsApp = (): boolean => /^[1-9]\d{7,14}$/.test(FEEDBACK_WHATSAPP);

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
