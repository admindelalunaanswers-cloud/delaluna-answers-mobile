/**
 * chat-export-format.ts
 * Pure builders behind "Export chat": the plain-text copy, the PDF's HTML, and
 * the summary line the sheet and the history list share. No native modules —
 * the service in `src/services/chat-export.service.ts` does the printing,
 * sharing and clipboard work on top of these.
 *
 * Only answered turns are exported. A pending or failed turn has nothing to
 * read, and "Something went wrong" is not worth keeping.
 */

import type {
  ChatMessageDoc,
  ChatMode,
  SavedChatSession,
} from '@/src/services/chat.service';
import type { UserDoc } from '@/src/types/user.type';
import { cleanResponse, plainRichText } from '@/src/utils/rich-text';

export type ChatExportFormat = 'text' | 'pdf' | 'image';

export interface ChatExportTurn {
  question: string;
  answer: string;
  askedAt: Date;
  mode?: ChatMode;
  /** Card names, as read — only known for the open thread. */
  cards?: string[];
}

export interface ExportableChat {
  title: string;
  date: Date;
  turns: ChatExportTurn[];
}

export interface ChatExportOptions {
  includeQuestions: boolean;
  /** Already formatted by `formatBirthDetails`; omitted when switched off. */
  birthDetails?: string | null;
}

// ─── Building the chat ───────────────────────────────────────────────────────

/** The open thread. `cards` maps a message id to the card names it was read from. */
export function exportableFromThread(
  messages: ChatMessageDoc[],
  cards?: Map<string, string[]>,
): ExportableChat | null {
  const turns: ChatExportTurn[] = messages
    .filter((m) => !!m.response && !m.isError)
    .map((m) => ({
      question: m.userMessage,
      answer: m.response as string,
      askedAt: m.createdAt,
      mode: m.mode,
      cards: cards?.get(m.id),
    }));
  if (turns.length === 0) return null;
  return {
    // Same rule saveChatAndClear titles a session by, so the thread exports
    // under the name it will later have in the history list.
    title: turns[0].question,
    date: turns[0].askedAt,
    turns,
  };
}

export function exportableFromSession(
  session: SavedChatSession,
): ExportableChat | null {
  const turns: ChatExportTurn[] = session.messages
    .filter((m) => !!m.response)
    .map((m) => ({
      question: m.userMessage,
      answer: m.response as string,
      askedAt: m.createdAt,
      mode: m.mode ?? session.mode,
    }));
  if (turns.length === 0) return null;
  return {
    title: session.title || turns[0].question,
    date: session.messages[0]?.createdAt ?? session.savedAt,
    turns,
  };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

/**
 * Questions plus replies. A stored message holds both halves of a turn, which
 * is why the history list used to say "1 message" for a question and its answer.
 */
export function countChatMessages(
  messages: { userMessage: string; response: string | null }[],
): number {
  return messages.reduce(
    (n, m) => n + (m.userMessage ? 1 : 0) + (m.response ? 1 : 0),
    0,
  );
}

export function messageCountLabel(count: number): string {
  return `${count} message${count === 1 ? '' : 's'}`;
}

/** "Astrology", "Tarot", or both when the thread changed reader. */
export function chatModeLabel(turns: { mode?: ChatMode }[]): string {
  const modes = new Set(turns.map((t) => t.mode ?? 'astrology'));
  if (modes.size > 1) return 'Astrology & Tarot';
  return modes.has('tarot') ? 'Tarot' : 'Astrology';
}

export function formatExportDate(date: Date, style: 'short' | 'long'): string {
  return date.toLocaleDateString('en-US', {
    month: style,
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Astrology · Oct 21, 2026 · 2 messages" */
export function exportSummaryLine(chat: ExportableChat): string {
  const count = chat.turns.length * 2;
  return [
    chatModeLabel(chat.turns),
    formatExportDate(chat.date, 'short'),
    messageCountLabel(count),
  ].join(' · ');
}

/**
 * The heading an export goes out under. The title *is* the first question, so
 * with questions switched off it would leak the very thing the user chose to
 * leave out — use the reader instead.
 */
export function exportHeading(
  chat: ExportableChat,
  includeQuestions: boolean,
): string {
  return includeQuestions
    ? chat.title
    : `${chatModeLabel(chat.turns)} reading`;
}

// ─── Birth details ───────────────────────────────────────────────────────────

type BirthFields = Pick<
  UserDoc,
  'birthday' | 'birthtime' | 'isBirthTimeUnknown' | 'placeOfBirth' | 'isPlaceOfBirthUnknown'
>;

/**
 * The stored birthday as a Date at midnight UTC. Sign-up and Edit Profile write
 * a "YYYY-MM-DD" string — despite `UserDoc` long saying Timestamp — so the
 * string is the case that matters; a Date or Timestamp from older documents is
 * still read.
 */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const maybe = value as { toDate?: () => Date };
  return typeof maybe.toDate === 'function' ? maybe.toDate() : null;
}

/** "14:05" → "2:05 PM". Anything unparseable is returned as stored. */
function formatClock(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return hhmm;
  const h = Number(match[1]);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${match[2]} ${suffix}`;
}

/**
 * "Born Mar 4, 1994 · 2:05 PM · Chicago, IL", leaving out whatever the user
 * said they don't know. Null when there is nothing to show.
 */
export function formatBirthDetails(
  user: Partial<BirthFields> | null | undefined,
): string | null {
  if (!user) return null;
  const parts: string[] = [];
  const birthday = toDate(user.birthday);
  // Stored as midnight UTC, so read it in UTC or it slips a day west of Greenwich.
  if (birthday) {
    parts.push(
      birthday.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    );
  }
  if (user.birthtime && !user.isBirthTimeUnknown) {
    parts.push(formatClock(user.birthtime));
  }
  if (user.placeOfBirth && !user.isPlaceOfBirthUnknown) {
    parts.push(user.placeOfBirth);
  }
  return parts.length ? `Born ${parts.join(' · ')}` : null;
}

// ─── Plain text ──────────────────────────────────────────────────────────────

export function buildChatText(
  chat: ExportableChat,
  options: ChatExportOptions,
): string {
  const lines: string[] = [
    exportHeading(chat, options.includeQuestions),
    `${chatModeLabel(chat.turns)} chat · ${formatExportDate(chat.date, 'long')}`,
  ];
  if (options.birthDetails) lines.push(options.birthDetails);

  for (const turn of chat.turns) {
    lines.push('');
    if (options.includeQuestions) {
      lines.push('You asked:', turn.question, '');
    }
    if (turn.cards?.length) lines.push(`Cards: ${turn.cards.join(', ')}`, '');
    lines.push('Delaluna:', plainRichText(turn.answer));
  }

  lines.push('', '— Exported from Delaluna');
  return lines.join('\n');
}

// ─── PDF (HTML for expo-print) ───────────────────────────────────────────────

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escaped, with `**bold**` / `*italic*` turned into tags. */
function inlineHtml(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

/**
 * The model's reply as paragraphs and lists. `cleanResponse` has already
 * turned `* item` lines into `• item` and dropped `**Title:**` runs, so this
 * only has to group the bullets and split on blank lines.
 */
export function answerToHtml(answer: string): string {
  const blocks = cleanResponse(answer)
    // The persona's structure uses bare `---` rules between sections.
    .replace(/^-{3,}\s*$/gm, '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
      const out: string[] = [];
      let list: string[] = [];
      const flush = () => {
        if (list.length) out.push(`<ul>${list.join('')}</ul>`);
        list = [];
      };
      let para: string[] = [];
      const flushPara = () => {
        if (para.length) out.push(`<p>${para.map(inlineHtml).join('<br/>')}</p>`);
        para = [];
      };
      for (const line of lines) {
        if (line.startsWith('• ')) {
          flushPara();
          list.push(`<li>${inlineHtml(line.slice(2))}</li>`);
        } else {
          flush();
          para.push(line);
        }
      }
      flush();
      flushPara();
      return out.join('');
    })
    .join('');
}

// Print palette: white page, deep purple ink. Deliberately not the app's dark
// look — a dark page wastes toner and prints muddy.
const INK = '#1c0d3a';
const INK_MUTED = '#5e5680';
const ACCENT = '#0f7a68'; // turquoise darkened until it reads on white
const RULE = '#e4e1ee';

export function buildChatHtml(
  chat: ExportableChat,
  options: ChatExportOptions,
  /** `data:image/png;base64,…` of the white logo; drawn as a purple mask. */
  logoDataUri?: string | null,
): string {
  const heading = exportHeading(chat, options.includeQuestions);
  const turns = chat.turns
    .map((turn) => {
      const asked = options.includeQuestions
        ? `<div class="label">You asked</div><p class="question">${inlineHtml(turn.question)}</p>`
        : '';
      const cards = turn.cards?.length
        ? `<p class="cards">Cards: ${escapeHtml(turn.cards.join(', '))}</p>`
        : '';
      return `<section class="turn">${asked}${cards}<div class="label accent">Delaluna</div><div class="answer">${answerToHtml(turn.answer)}</div></section>`;
    })
    .join('');

  // The logo file is white line art on transparent, which vanishes on paper.
  // Using it as a mask over a purple fill keeps the real artwork in print ink.
  const logo = logoDataUri
    ? `<div class="logo" role="img" aria-label="Delaluna Answers" style="-webkit-mask-image:url('${logoDataUri}');mask-image:url('${logoDataUri}')"></div>`
    : `<div class="wordmark">DELALUNA</div>`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(heading)}</title>
<style>
  @page { size: letter; margin: 0.75in 0.75in 0.9in; }
  * { box-sizing: border-box; }
  body { margin: 0; color: ${INK}; font: 11pt/1.55 -apple-system, "Helvetica Neue", Roboto, Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 2px solid ${INK}; }
  .logo { width: 150px; height: 58px; background-color: ${INK}; -webkit-mask-size: contain; mask-size: contain; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; -webkit-mask-position: left center; mask-position: left center; }
  .wordmark { font-weight: 800; letter-spacing: 0.2em; font-size: 16pt; }
  .meta { text-align: right; color: ${INK_MUTED}; font-size: 10pt; line-height: 1.5; }
  h1 { font-size: 21pt; line-height: 1.2; margin: 26px 0 18px; }
  .birth { color: ${INK_MUTED}; font-size: 10pt; margin: -8px 0 18px; }
  .turn { margin-bottom: 18px; }
  .label { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${INK_MUTED}; margin: 16px 0 4px; }
  .label.accent { color: ${ACCENT}; }
  .question { margin: 0; }
  .cards { color: ${INK_MUTED}; font-style: italic; margin: 8px 0 0; }
  .answer p { margin: 0 0 10px; }
  .answer ul { margin: 0 0 10px; padding-left: 22px; }
  .answer li { margin-bottom: 6px; }
  footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid ${RULE}; color: ${INK_MUTED}; font-size: 9pt; }
</style></head>
<body>
  <header>${logo}<div class="meta">${escapeHtml(chatModeLabel(chat.turns))} chat<br/>${escapeHtml(formatExportDate(chat.date, 'long'))}</div></header>
  <h1>${escapeHtml(heading)}</h1>
  ${options.birthDetails ? `<p class="birth">${escapeHtml(options.birthDetails)}</p>` : ''}
  ${turns}
  <footer>Exported from Delaluna</footer>
</body></html>`;
}

// ─── Image card ──────────────────────────────────────────────────────────────

/**
 * The latest reading cut to fit a story-sized card: whole sentences up to
 * `max` characters, then an ellipsis.
 */
export function excerptForCard(answer: string, max = 520): string {
  const plain = plainRichText(answer).replace(/^-{3,}\s*$/gm, '').replace(/\n{2,}/g, '\n\n').trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (lastStop > max * 0.5 ? cut.slice(0, lastStop + 1) : cut.trimEnd()) + ' …';
}

/** A file name the share sheet can show: "Delaluna – How does a new love….pdf" */
export function exportFileName(heading: string, extension: 'pdf' | 'png'): string {
  const safe = heading
    .replace(/[\\/:*?"<>|\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48)
    .trim();
  return `Delaluna - ${safe || 'Chat'}.${extension}`;
}
