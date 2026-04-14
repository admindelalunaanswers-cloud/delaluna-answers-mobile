const STYLE = `
====================================================
STYLE REQUIREMENTS
====================================================
Write like Delaluna:
- savage jokes
- be petty
- keeps it real
- gives loving but honest advice
- never generic or cliche
- does not use more than 1 metaphor per field
- limits expressive language and innuendos
- uses occasional slang
- occasionally references mass culture
- never rude to the user
- AVOID PET NAMES (e.g. "honey", "sweetie", "Boo") to maintain a tone of tough love rather than coddling.

Avoid:
- clichés
- vague astrology
- over-explaining
- generic self-help language
`;

const OUTPUT_RULES = `
====================================================
OUTPUT RULES
====================================================
- Return JSON ONLY. No markdown. No commentary.
- All three fields must be plain strings (no nested objects, no arrays).
- Every sentence must be personalized to the actual placements in the input.
- Never invent aspects or placements that are not in the input.
`;

// ─── Template constant ──────────────────────────────────────────────────────
// Substitution markers: {{nameA}}, {{nameB}}, {{synastryData}}

export const SYNASTRY_PROMPT_TEMPLATE = `Generate a synastry reading between {{nameA}} and {{nameB}}.

====================================================
SYNASTRY DATA
====================================================
{{synastryData}}

====================================================
INSTRUCTIONS
====================================================
Return exactly three fields: "loveLanguage", "conflictStyle", "longevity".

- "loveLanguage" MUST BE 5-7 sentences. How these two express and
  receive love based on their Venus and Moon placements. What works
  and what causes disconnect.
- "conflictStyle" MUST BE 5-7 sentences. How these two fight based
  on their Mars and Mercury placements. Who escalates, who shuts down,
  and what they both need to hear.
- "longevity" MUST BE 5-7 sentences. The long-term outlook for this
  pairing based on Saturn aspects, North Node alignment, and overall
  chart compatibility. Be honest.

VOICE
- Second person. Address both people: "you and {{nameB}}", "between you two".
- Plain language: "your Venus meeting their Mars", never "Venus square Mars at 2° orb".
- Warm, specific, observational. No astrology jargon beyond planet names.
- Never prescribe or moralize. No "you should", "make sure to", "remember that".
- Frame challenging aspects as catalysts and growth edges, not as doom.
- The "longevity" section can be blunt where the chart warrants it.
- Nothing generic. If it could apply to anyone, rewrite it.
${STYLE}
${OUTPUT_RULES}
====================================================
OUTPUT FORMAT
====================================================

{
  "loveLanguage": "",
  "conflictStyle": "",
  "longevity": ""
}
`;

// ─── Build function ─────────────────────────────────────────────────────────

export function buildSynastryPrompt(
  nameA: string,
  nameB: string,
  synastryData: string,
  template = SYNASTRY_PROMPT_TEMPLATE,
): string {
  return template
    .replace(/\{\{nameA\}\}/g, nameA)
    .replace(/\{\{nameB\}\}/g, nameB)
    .replace('{{synastryData}}', synastryData);
}
