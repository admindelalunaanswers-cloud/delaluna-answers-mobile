/**
 * rich-text.tsx
 * Shared helpers for rendering AI-generated copy. The model occasionally
 * returns markdown-style bold (`**word**`), italic (`*word*`), and section
 * titles (`**Reality Check:**`). We strip the title-style runs but preserve
 * inline `**word**` / `*word*` as bold/italic text spans so emphasis
 * survives in the UI.
 *
 * Used across every screen that displays an AI response (chat, horoscope,
 * natal chart breakdown, transit reading, connection / synastry copy).
 */

import React from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { Text } from '@/src/components/app-text';

/** Strip markdown bold titles like `**Reality Check:**` while preserving inline `**word**`. */
export function cleanResponse(text: string): string {
  return text
    .replace(/\*\*[^*]+:\*\*\s*/g, '')
    .replace(/^[ \t]*\*[ \t]+/gm, '• ')
    .replace(/^[ \t]+/gm, '')
    .trim();
}

/**
 * The same text with the emphasis markers removed — what renderRichText shows,
 * as a plain string. For accessibilityLabel, which can't hold styled spans and
 * would otherwise have VoiceOver read the asterisks.
 */
export function plainRichText(text: string | null | undefined): string {
  if (!text) return '';
  return cleanResponse(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1');
}

/**
 * Render text, turning `**word**` into bold and `*word*` into italic Text spans.
 * The result can be rendered as the children of a single <Text>, e.g.
 *   <Text style={styles.body}>{renderRichText(value)}</Text>
 */
export function renderRichText(
  text: string | null | undefined,
  boldStyle: TextStyle = richTextStyles.bold,
  italicStyle: TextStyle = richTextStyles.italic,
): React.ReactNode[] {
  if (!text) return [];
  const cleaned = cleanResponse(text);
  const parts = cleaned.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*)/g);
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <Text key={i} style={boldStyle}>
          {bold[1]}
        </Text>
      );
    }
    const italic = part.match(/^\*([^*\n]+)\*$/);
    if (italic) {
      return (
        <Text key={i} style={italicStyle}>
          {italic[1]}
        </Text>
      );
    }
    return part;
  });
}

export const richTextStyles = StyleSheet.create({
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
});
