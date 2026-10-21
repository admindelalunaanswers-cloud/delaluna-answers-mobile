import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { ExportableChat } from '@/src/utils/chat-export-format';

// An in-memory cache directory. The global stub in jest.setup.js has no
// exists / delete / parentDirectory, which is exactly what these tests are about.
const mockFiles = new Set<string>();
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    // new File(uri) or new File(directory, name), as the service uses it.
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get parentDirectory() {
      return { uri: this.uri.slice(0, this.uri.lastIndexOf('/')) };
    }
    delete() {
      if (!mockFiles.has(this.uri)) throw new Error('missing');
      mockFiles.delete(this.uri);
    }
    rename(name: string) {
      const next = `${this.parentDirectory.uri}/${name}`;
      if (mockFiles.has(next)) throw new Error('destination exists');
      mockFiles.delete(this.uri);
      mockFiles.add(next);
      this.uri = next;
    }
    base64() {
      return Promise.resolve('TE9HTw==');
    }
  }
  return { File: MockFile };
});
jest.mock('expo-asset', () => ({
  Asset: { fromModule: () => ({ downloadAsync: () => Promise.resolve(), localUri: null }) },
}));

const CHAT: ExportableChat = {
  title: 'Should I move?',
  date: new Date('2026-10-21T15:00:00Z'),
  turns: [{ question: 'Should I move?', answer: 'Yes.', askedAt: new Date('2026-10-21T15:00:00Z') }],
};
const OPTIONS = { includeQuestions: true };

let printed = 0;

// Fresh module per test: it remembers the previous export between calls.
const loadService = () => {
  let service!: typeof import('@/src/services/chat-export.service');
  jest.isolateModules(() => {
    service = require('@/src/services/chat-export.service');
  });
  return service;
};

describe('chat-export.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Print.printToFileAsync as jest.Mock).mockImplementation(async () => {
      const uri = `file:///cache/${++printed}-uuid.pdf`;
      mockFiles.add(uri);
      return { uri };
    });
  });

  const sharedUri = (call = 0) => (Sharing.shareAsync as jest.Mock).mock.calls[call][0] as string;

  it('shares the PDF under a readable name', async () => {
    const { exportChatAsPdf } = loadService();
    await exportChatAsPdf(CHAT, OPTIONS);

    expect(sharedUri()).toBe('file:///cache/Delaluna - Should I move.pdf');
  });

  // A same-named file from an earlier export made rename throw, so the second
  // export of a chat went out under its UUID.
  it('keeps the readable name when the same chat is exported again', async () => {
    const { exportChatAsPdf } = loadService();
    await exportChatAsPdf(CHAT, OPTIONS);
    await exportChatAsPdf(CHAT, OPTIONS);

    expect(sharedUri(1)).toBe('file:///cache/Delaluna - Should I move.pdf');
  });

  // Exports can carry a whole conversation and birth details; they used to
  // pile up in the cache.
  it('removes the previous export when a new one is made', async () => {
    const { exportChatAsPdf, shareChatImage } = loadService();
    await exportChatAsPdf(CHAT, OPTIONS);
    const firstPdf = sharedUri();

    mockFiles.add('file:///cache/card.png');
    await shareChatImage('file:///cache/card.png');

    expect(mockFiles.has(firstPdf)).toBe(false);
    expect([...mockFiles]).toEqual(['file:///cache/card.png']);
  });

  it('throws ShareUnavailableError when the device cannot share', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const { exportChatAsPdf, ShareUnavailableError } = loadService();

    await expect(exportChatAsPdf(CHAT, OPTIONS)).rejects.toBeInstanceOf(ShareUnavailableError);
  });
});
