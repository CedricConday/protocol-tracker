import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { t } from '../i18n';
import { collectShareData } from './data';
import { bundleToJson } from './shape';
import { buildShareHtml } from './report';
import type { ShareConfig } from './types';

/**
 * The only path from this app's data to anywhere else.
 *
 * No screen calls `printToFileAsync` or `shareAsync` with patient data any
 * more; they open the sheet, and the sheet ends here. That rule is the whole
 * point of the module — the four buttons drifted apart precisely because each
 * one owned its own copy of these six lines.
 */
export async function shareFromConfig(config: ShareConfig): Promise<void> {
  const bundle = await collectShareData(config.from, config.to);

  if (config.format === 'json') {
    // No `expo-file-system` in this build, and adding a native module would
    // break OTA delivery for every install. A base64 data URI is what
    // FamilySyncScreen already hands `shareAsync` on device, so it is a proven
    // path rather than a clever one.
    const json = bundleToJson(bundle, config.sections);
    const uri = `data:application/json;base64,${toBase64(json)}`;
    await Sharing.shareAsync(uri, {
      mimeType: 'application/json',
      dialogTitle: t('shDialogTitle'),
      UTI: 'public.json',
    });
    return;
  }

  const html = buildShareHtml(bundle, config.sections);
  // expo-print resolves to undefined where there is no file-producing printer
  // (the web target prints straight to a dialog), and destructuring that threw
  // an uncaught "Cannot destructure property 'uri'" the caller never saw.
  const printed = await Print.printToFileAsync({ html });
  if (!printed?.uri) throw new Error(t('shNoPdfSupport'));
  await Sharing.shareAsync(printed.uri, {
    mimeType: 'application/pdf',
    dialogTitle: t('shDialogTitle'),
    UTI: 'com.adobe.pdf',
  });
}

/**
 * UTF-8 safe base64.
 *
 * `btoa` throws on any character above U+00FF, and this payload carries German
 * text, the mood emoji the journal stores as its value, and whatever the user
 * typed. Encoding to UTF-8 bytes first is what keeps an export from failing on
 * a single "ö".
 */
function toBase64(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const CHUNK = 0x8000; // String.fromCharCode has an argument-count ceiling.
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return globalThis.btoa(binary);
}
