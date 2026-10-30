/**
 * chat-export.service.ts
 * The native half of "Export chat": clipboard, PDF printing, saving to the
 * photo library, and the share sheet. Everything that decides *what* goes out lives in
 * `src/utils/chat-export-format.ts`.
 *
 * Needs expo-print, expo-sharing, expo-media-library and react-native-view-shot,
 * all native — a dev client built before they were added will fail on import.
 */

import { Asset } from 'expo-asset';
import * as Clipboard from 'expo-clipboard';
import { File } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import {
  buildChatHtml,
  buildChatText,
  exportFileName,
  exportHeading,
  type ChatExportOptions,
  type ExportableChat,
} from '@/src/utils/chat-export-format';
import { logger } from '@/src/utils/logger';

/** US Letter in PostScript points — what the PDF mockup was laid out on. */
const LETTER = { width: 612, height: 792 };

export class ShareUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device');
    this.name = 'ShareUnavailableError';
  }
}

/** The user said no to saving into Photos, now or earlier. */
export class PhotosPermissionError extends Error {
  constructor() {
    super('Photo library access was denied');
    this.name = 'PhotosPermissionError';
  }
}

let logoDataUri: Promise<string | null> | null = null;

/**
 * The bundled logo as a data URI, loaded once. The print WebView can't reliably
 * reach a bundled file:// asset on either platform, so it is inlined. A failure
 * falls back to a text wordmark rather than failing the export.
 */
function loadLogo(): Promise<string | null> {
  logoDataUri ??= (async () => {
    try {
      const asset = Asset.fromModule(
        require('@/src/assets/dlla-branded/delaluna_logo.png'),
      );
      await asset.downloadAsync();
      if (!asset.localUri) return null;
      const base64 = await new File(asset.localUri).base64();
      return `data:image/png;base64,${base64}`;
    } catch (e) {
      logger.warn('[chat-export] logo unavailable, using wordmark', e);
      logoDataUri = null; // let the next export try again
      return null;
    }
  })();
  return logoDataUri;
}

async function share(uri: string, mimeType: string, uti: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new ShareUnavailableError();
  // Resolves whether the user shared or dismissed — neither is an error.
  await Sharing.shareAsync(uri, { mimeType, UTI: uti, dialogTitle: 'Export chat' });
}

/**
 * The file handed to the share sheet last time. Exports land in the cache and
 * can carry a whole conversation (and birth details, if switched on), so each
 * export removes the one before it. Not deleted right after sharing: on Android
 * the receiving app can still be reading it once the chooser has returned.
 */
let previousExportUri: string | null = null;

function replacePreviousExport(uri: string): void {
  if (previousExportUri && previousExportUri !== uri) {
    try {
      const old = new File(previousExportUri);
      if (old.exists) old.delete();
    } catch {
      // Already gone, or the OS cleared the cache — nothing to do.
    }
  }
  previousExportUri = uri;
}

/** Rename a cache file so the share sheet shows a real name, not a UUID. */
function withReadableName(uri: string, name: string): string {
  try {
    const file = new File(uri);
    // A file of the same name from an earlier export made rename throw, so a
    // second export of the same chat went out under the UUID. Replace it.
    const target = new File(file.parentDirectory, name);
    if (target.exists && target.uri !== file.uri) target.delete();
    file.rename(name);
    return file.uri;
  } catch {
    // A platform that refuses — the UUID name still shares fine.
    return uri;
  }
}

export async function copyChatAsText(
  chat: ExportableChat,
  options: ChatExportOptions,
): Promise<void> {
  await Clipboard.setStringAsync(buildChatText(chat, options));
}

export async function exportChatAsPdf(
  chat: ExportableChat,
  options: ChatExportOptions,
): Promise<void> {
  const html = buildChatHtml(chat, options, await loadLogo());
  const { uri } = await Print.printToFileAsync({ html, ...LETTER });
  const named = withReadableName(
    uri,
    exportFileName(exportHeading(chat, options.includeQuestions), 'pdf'),
  );
  replacePreviousExport(named);
  await share(named, 'application/pdf', 'com.adobe.pdf');
}

/**
 * `uri` is a JPEG already captured from the on-screen card. Asks for add-only
 * access: the app never reads the library, so iOS shows the narrower "add
 * photos" prompt and Android 10+ needs no permission at all.
 */
export async function saveChatImageToPhotos(uri: string): Promise<void> {
  const { granted } = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!granted) throw new PhotosPermissionError();
  replacePreviousExport(uri);
  await MediaLibrary.Asset.create(uri);
}

/** `uri` is a JPEG already captured from the on-screen card. */
export async function shareChatImage(uri: string): Promise<void> {
  replacePreviousExport(uri);
  await share(uri, 'image/jpeg', 'public.jpeg');
}
