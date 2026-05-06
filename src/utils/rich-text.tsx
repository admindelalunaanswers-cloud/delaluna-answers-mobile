/**
 * rich-text.tsx
 * Shared helpers for rendering AI-generated copy. The model occasionally
 * returns markdown-style bold (`**word**`) and section titles
 * (`**Reality Check:**`). We strip the title-style runs but preserve inline
 * `**word**` as bold text spans so emphasis survives in the UI.
 *
 * Used across every screen that displays an AI response (chat, horoscope,
 * natal chart breakdown, transit reading, connection / synastry copy).
 */

import React from 'react';
import { StyleSheet, Text, type TextStyle } from 'react-native';

/** Strip markdown bold titles like `**Reality Check:**` while preserving inline `**word**`. */
export function cleanResponse(text: string): string {
  return text
    .replace(/\*\*[^*]+:\*\*\s*/g, '')
    .replace(/^ +/gm, '')
    .trim();
}

/**
 * Render text, turning `**word**` into bold Text spans.
 * The result can be rendered as the children of a single <Text>, e.g.
 *   <Text style={styles.body}>{renderRichText(value)}</Text>
 */
export function renderRichText(
  text: string | null | undefined,
  boldStyle: TextStyle = richTextStyles.bold,
): React.ReactNode[] {
  if (!text) return [];
  const cleaned = cleanResponse(text);
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const m = part.match(/^\*\*([^*]+)\*\*$/);
    if (m) {
      return (
        <Text key={i} style={boldStyle}>
          {m[1]}
        </Text>
      );
    }
    return part;
  });
}

export const richTextStyles = StyleSheet.create({
  bold: { fontWeight: '700' },
});
