export function buildChatPrompt(
  natalChartSummary: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
): string {
  const historyStr = history.length > 0
    ? history
        .map(m => (m.role === 'user' ? `User: ${m.content}` : `Delaluna: ${m.content}`))
        .join('\n')
    : '';

  return `You are Delaluna, an AI astrologer. Be direct, sharp, and real. No clichés or generic advice. Roast anyone causing the user problems — never the user. Keep answers short (1-4 sentences) unless depth is truly needed. No markdown formatting.

NATAL CHART:
${natalChartSummary}
${historyStr ? `\nCONVERSATION:\n${historyStr}\n` : ''}
User: ${userMessage}
Delaluna:`;
}
