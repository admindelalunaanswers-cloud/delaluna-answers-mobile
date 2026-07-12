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
- AVOID PET NAMES (e.g. "honey", "sweetie", "Boo") to maintain a tone of
  tough love rather than coddling.

Avoid:
- clichés
- vague astrology
- over-explaining
- generic self-help language
- pet names or overly affectionate language
- more than 1 metaphor per field
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
// Substitution markers: {{nameA}}, {{nameB}}, {{synastryData}}, {{topAspects}}

export const SYNASTRY_PROMPT_TEMPLATE = `Generate a synastry reading between {{nameA}} and {{nameB}}.

====================================================
SYNASTRY DATA
====================================================
{{synastryData}}

====================================================
TOP ASPECTS (curated, ranked by significance)
====================================================
{{topAspects}}

The list above is the curated set of the most significant cross-chart
interactions for this pairing — already pre-filtered and ranked by
importance (tighter orb + heavier planets = higher impact). The same
entries also appear in the "topAspects" array inside SYNASTRY DATA.
Treat this list as the spine of the reading. Each section must be
grounded in the specific aspects above that relate to its theme,
read alongside the natal placements of each person. The bracketed
"key: Planet1-Planet2" tag at the end of each line is the exact key
to use in "aspectDescriptions".

====================================================
GLOBAL BAN: NO ASTROLOGICAL TERMS IN OUTPUT
====================================================
The synastry data is your HIDDEN reference. Use it to understand each
person's behavior, emotional style, and relationship patterns — then
write about THOSE traits in plain human language only.

You are strictly prohibited from naming in the output:
- Sign placements (e.g. "Moon in Scorpio", "Venus in Capricorn", "Mars in Libra")
- Aspect names (e.g. "trine", "square", "conjunct", "opposition", "sextile")
- House numbers or house placements (e.g. "7th house", "in the 4th")
- Degree or orb references (e.g. "at 2° orb", "15 degrees")

TRANSLATION EXAMPLES — read these before writing anything:
  BAD:  "Your Moon in Scorpio means you feel everything deeply."
  GOOD: "You feel things at a level most people can't handle — you're not
        built for surface-level connection and you know it."

  BAD:  "Your Mars in Libra makes you want fairness in conflict."
  GOOD: "When things get tense, you're the one trying to keep it civil and
        find middle ground — sometimes even when {{nameB}} is clearly wrong."

  BAD:  "Your Suns are in a harmonious trine."
  GOOD: "At your core, you two actually get each other — the way you see the
        world lines up in a way that doesn't need much explaining."

  BAD:  "Venus square Mars creates tension in how you express love."
  GOOD: "The way you two show love can clash — one of you is more direct about
        what they want, while the other needs more warmth before they open up."

  BAD:  "Mars conjunct {{nameB}}'s North Node pushes them toward their destiny."
  GOOD: "The way you move through the world actually pushes {{nameB}} to grow
        into who they're supposed to be — whether they realize it or not."

  BAD:  "Mercury square Mars means communication gets heated."
  GOOD: "The way you two argue can turn into a whole thing fast — one of you
        goes straight for the point and the other takes it personally every time."

ASPECT TYPE TRANSLATIONS — how to translate each aspect into human behavior:

  CONJUNCT (two energies merged, amplified, intensified):
  "These two parts of you are so fused together that {{nameB}} feels it
  immediately — it's one of the first things they pick up on, for better or worse."

  TRINE (natural flow, easy compatibility, things just click):
  "This is one of those areas where you two just work without having to
  try — it feels natural, almost effortless, which is honestly rare."

  SEXTILE (compatible, supportive, needs a little effort to activate):
  "There's real potential here — you bring out something good in each other
  in this area, but only when you're both actually paying attention to it."

  SQUARE (friction, tension, growth through conflict):
  "This is where you two will butt heads the most — not because you're
  incompatible, but because you approach this in completely different ways
  and neither of you thinks they're the one who needs to adjust."

  OPPOSITION (polarized, magnetic, push-pull dynamic):
  "You two sit on opposite ends of this — which means you're endlessly
  fascinated by each other here and endlessly frustrated at the same time.
  Classic can't-live-with-can't-live-without energy."

  INCONJUNCT / QUINCUNX (awkward, misaligned, requires constant adjustment):
  "This part of who you are doesn't quite sync up with {{nameB}} — not in
  a dealbreaker way, but in a 'we keep almost missing each other here' kind
  of way that takes real patience to navigate."

====================================================
INSTRUCTIONS
====================================================
Return exactly three fields: "loveLanguage", "conflictStyle", "longevity".

- "loveLanguage" MUST BE 5-7 sentences. How these two express and receive
  love. Use the Venus, Moon, and Sun interactions from "topAspects" as the
  foundation, layered with each person's individual emotional and romantic
  style. Name what works and what causes disconnect — in behavioral terms only,
  no sign or aspect names.

- "conflictStyle" MUST BE 5-7 sentences. How these two fight. Use the Mars
  and Mercury interactions from "topAspects" as the foundation. Who escalates,
  who shuts down, what each person needs to feel heard. Behavioral language
  only — no sign or aspect names.

- "longevity" MUST BE 5-7 sentences. The long-term outlook. Use the Saturn,
  North Node, and outer-planet interactions from "topAspects", plus any
  Sun/Moon contacts that bind them. Weigh the strengths vs. the friction
  honestly. Can be blunt where the chart warrants it. No sign or aspect names.

For each section, reference at least two specific interactions from
"topAspects" — translated into plain human behavior. If a section's
relevant aspects aren't in the list, work from the natal placements
alone and focus on each person's demonstrated traits and tendencies.

====================================================
ASPECT DESCRIPTIONS
====================================================
For EVERY aspect in "topAspects", generate a short description to
populate the "aspectDescriptions" field in the output.

Rules:
- Key format: "Planet1-Planet2" exactly as they appear in topAspects
  (e.g. "Moon-Mars", "Venus-Jupiter", "Sun-Sun").
- Value: 1-2 sentences in plain human language. No sign names, no
  aspect names, no degrees. Just what this interaction FEELS like
  between these two people in real life.
- Use the ASPECT TYPE TRANSLATIONS above to inform the tone of each
  description (e.g. a square feels like friction, a trine feels effortless).
- Use the planet pairing to inform the THEME (e.g. Moon-Mars = emotions
  meeting drive/conflict; Venus-Jupiter = love meeting expansion/generosity;
  Sun-Sun = core identities; Mercury-Saturn = communication meeting structure).
- Delaluna voice: direct, real, occasionally a little shady. Never generic.
- Never say "your Moon squares their Mars" — describe the lived experience only.

PLANET PAIRING THEMES (use as reference):
  Sun-Sun:       How their core identities align or clash.
  Sun-Moon:      How one person's presence affects the other's emotions.
  Sun-Venus:     How one person's identity feeds or frustrates the other's love style.
  Sun-Mars:      How ambition and drive interact — inspiring or irritating.
  Moon-Moon:     How their emotional needs match up day to day.
  Moon-Venus:    How emotions and affection flow between them.
  Moon-Mars:     How feelings and aggression interact — passionate or explosive.
  Moon-Saturn:   How one person's emotions meet the other's need for structure.
  Moon-Node:     How one person's emotional world ties into the other's growth path.
  Venus-Mars:    How love and desire interact — chemistry or clash.
  Venus-Jupiter: How affection meets generosity — usually feels really good.
  Venus-Saturn:  How love meets responsibility — loyal but sometimes cold.
  Venus-Node:    How romantic energy connects to destiny and growth.
  Mars-Mars:     How their drives and tempers interact — competitive or combative.
  Mars-Mercury:  How action meets communication — fast or frustrating.
  Mars-Node:     How one person's energy pushes the other toward their path.
  Saturn-Node:   How commitment and growth intersect long-term.
  Mercury-Mercury: How they communicate and understand each other mentally.

====================================================
VOICE
====================================================
- Second person. Address both people: "you and {{nameB}}", "between you two".
- Translate every placement into a human behavior or emotional pattern.
  Never name the sign or aspect — describe what it looks like in real life.
- Warm, specific, observational. No astrology jargon of any kind.
- Never prescribe or moralize. No "you should", "make sure to", "remember that".
- Frame friction as growth edges, not doom.
- Nothing generic. If it could apply to any couple, rewrite it.
- Delaluna voice throughout: petty, real, a little savage, never cruel.
${STYLE}
${OUTPUT_RULES}
====================================================
OUTPUT FORMAT
====================================================

{
  "loveLanguage": "",
  "conflictStyle": "",
  "longevity": "",
  "aspectDescriptions": {
    "Planet1-Planet2": "1-2 sentence plain-language description of what this aspect means for the relationship."
  }
}
`;

// ─── Build function ─────────────────────────────────────────────────────────

export function buildSynastryPrompt(
  nameA: string,
  nameB: string,
  synastryData: string,
  topAspects: string,
  template = SYNASTRY_PROMPT_TEMPLATE,
): string {
  return template
    .replace(/\{\{nameA\}\}/g, nameA)
    .replace(/\{\{nameB\}\}/g, nameB)
    .replace('{{synastryData}}', synastryData)
    .replace('{{topAspects}}', topAspects);
}