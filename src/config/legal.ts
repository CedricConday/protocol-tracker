import documents from './legal.json';

/**
 * Impressum and Datenschutzerklärung, bundled so they work with no network.
 *
 * THE TEXT LIVES IN `legal.json`, NOT HERE (split 2026-09-21)
 * Because it has two surfaces. The app renders it through
 * `screens/LegalDocumentScreen.tsx`, and the website generates
 * `/tracker/privacy.html` and `/de/tracker/datenschutz.html` from the same file
 * via `build-legal.py` in the website tree. Legal text that says one thing in
 * an app and another on its download page is the kind of discrepancy that gets
 * noticed exactly when it matters, so there is one copy and both surfaces read
 * it. This module is the typed door onto that data; it holds no prose.
 *
 * **Edit `legal.json`, then re-run `build-legal.py` and deploy the site**, or
 * the two halves drift — which is the failure this split exists to prevent.
 *
 * WHY IT IS IN THE APP AT ALL
 * § 5 DDG (which replaced the TMG on 2024-05-14 — cite DDG, not TMG) requires
 * the provider details to be reachable in at most two steps and available
 * without a network connection. A missing app-Impressum is an established
 * Abmahnung target, and an app that stores health data and links its privacy
 * policy to a URL has nothing to show a user on a plane or in a clinic
 * basement. Both screens are therefore offline text, not a WebView.
 *
 * THE GERMAN IS AUTHORITATIVE. The English is a faithful rendering provided
 * because the app ships in both languages; where the two could be read
 * differently, the German governs. Same standing caveat as
 * `links.ts -> medicalDisclaimer`: this is working legal German, and it is
 * Cedric's to have reviewed, not mine to have written and declared final.
 *
 * KEEP IN STEP WITH THE SITE'S OWN PAGES. condaydigital.com/impressum.html is
 * the same provider, so the Diensteanbieter, Kontakt, Umsatzsteuer and MStV
 * blocks must not drift from it. What legitimately differs: the site's
 * "Haftung für Links" and its Markenhinweis about booking platforms are about
 * the website and have no meaning here, and the site's datenschutz.html
 * describes a static website — cookies, server logfiles, Calendly — none of
 * which this app has. The privacy text was written from what the code does.
 *
 * WHAT THE CODE ACTUALLY DOES, as of 2026-09-21, verified in source:
 *  - Everything the user enters is in a local SQLite database in the app
 *    sandbox. There is no account and no first-party server:
 *    `src/api/syncClient.ts` has no default endpoint and is unreferenced by
 *    design, and `__tests__/no-first-party-server.test.ts` guards that.
 *  - Two outbound hosts exist in `src/`, both third-party:
 *    api.open-meteo.com and air-quality-api.open-meteo.com, reached only when
 *    the weather card is switched on (`src/hooks/useWeather.ts`), and wa.me,
 *    reached only when the user taps WhatsApp on the feedback screen.
 *  - No analytics, no crash reporting, no advertising SDK. None is installed.
 * If any of that changes, `legal.json` changes in the same commit.
 */

export interface LegalSection {
  heading: string;
  /** Paragraphs. Rendered in order, one <Text> each. */
  body: string[];
}

export interface LegalDocument {
  title: string;
  /** Shown under the title, smaller. */
  intro?: string;
  sections: LegalSection[];
  /** Rendered last, muted. */
  updated: string;
}

interface LegalDocuments {
  impressum: { de: LegalDocument; en: LegalDocument };
  privacy: { de: LegalDocument; en: LegalDocument };
}

const legal = documents as LegalDocuments;

/** The Impressum in the given language. German is authoritative. */
export function impressum(lang: string): LegalDocument {
  return lang === 'de' ? legal.impressum.de : legal.impressum.en;
}

/** The privacy policy in the given language. German is authoritative. */
export function privacyPolicy(lang: string): LegalDocument {
  return lang === 'de' ? legal.privacy.de : legal.privacy.en;
}
