import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
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
    const json = bundleToJson(bundle, config.sections);
    await Sharing.shareAsync(jsonUri(json, config), {
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
 * Where the JSON backup lives for the moment it takes to hand it over.
 *
 * This was a `data:` URI until 2026-09-17, on the reasoning that the app had no
 * `expo-file-system` and adding one would need a new APK. Both halves were
 * wrong, and the device said so: *"Only local file URLs are supported (expected
 * scheme to be 'file', got 'data')"*. `ExpoSharing` on Android hands the URI to
 * a `FileProvider`, which can only vend a real file — and `expo-file-system` is
 * a dependency of `expo` itself, so its native module was already in the 09-15
 * build (verified in that APK's `classes3.dex`). Nothing here needs a rebuild.
 *
 * The cache directory is the right home: `sharing_provider_paths.xml` grants the
 * provider `cache-path`, and Android is free to reclaim the file once the
 * receiving app has copied it. The name is the range, so what lands in someone's
 * Downloads folder says what it holds.
 *
 * Web keeps the data URI. There is no FileProvider there, `Paths.cache` is OPFS
 * — a sandbox nothing outside the page can read — and the browser's share sheet
 * takes the URI directly.
 */
function jsonUri(json: string, config: ShareConfig): string {
  if (Platform.OS === 'web') {
    return `data:application/json;base64,${toBase64(json)}`;
  }
  const file = new File(Paths.cache, `protocol-tracker-${config.from}_${config.to}.json`);
  // An export of the same range earlier in the session already holds the name.
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  return file.uri;
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
