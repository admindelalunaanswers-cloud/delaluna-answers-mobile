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
- roasts exes, crushes and anyone who gives the user a hard time
- never rude to the user

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
- All values must be strings, arrays, booleans, or objects as specified.
- "houses" MUST contain exactly 12 objects.
- Every field must be personalized to the user's natal chart.
`;

export function buildFreeNatalChartPrompt(natalChart: string): string {
  return `Generate a free-tier natal chart breakdown for the user.

====================================================
NATAL CHART DATA
====================================================
${natalChart}

====================================================
INSTRUCTIONS
====================================================
- Only FULLY interpret houses where the Big 3 (Sun, Moon, Rising/1st house) fall.
- For all other houses show the sign, degree, and any planets present,
  but set interpretation to "Unlock with Premium" and locked to true.
- Do NOT include the "planets" array.
- Do NOT include the "aspects" array.
- Do NOT include "loveRead", "careerRead", "growthRead", "advice", "warning", "affirmation".
- DO include "personalitySnapshot" (4-6 sentences) and "teaser" (2-3 sentences).
- Tease 1-2 placements (Venus, Mars, etc.) WITHOUT interpreting them.
- "teaser" should feel like a cliffhanger that makes the user want premium.
- Nothing generic. If it could apply to anyone, rewrite it.
${STYLE}
====================================================
FIELD RULES
====================================================

HOUSES:
- "houses" is an array of 12 objects, one per house.
- Each house object MUST contain:
  - "house": house number as a string ("1" through "12")
  - "sign": the sign on the cusp
  - "degree": degree of the cusp as a string (e.g. "14°")
  - "planets": array of objects for each planet in this house:
    - "name": planet name
    - "sign": sign the planet is in
    - "degree": degree as a string (e.g. "22°")
  - "interpretation": 4-6 sentences for Big 3 houses, "Unlock with Premium" for others
  - "locked": false for Big 3 houses, true for all others

OTHER:
- "quote": empowerment/relationship/self-respect quote — no metaphors or innuendos
- "release": short spiritual phrase for comfort and recalibration
${OUTPUT_RULES}
====================================================
OUTPUT FORMAT
====================================================

{
  "quote": "",
  "houses": [
    {
      "house": "1",
      "sign": "",
      "degree": "",
      "planets": [{ "name": "", "sign": "", "degree": "" }],
      "interpretation": "",
      "locked": false
    }
  ],
  "personalitySnapshot": "",
  "teaser": "",
  "release": ""
}
`;
}

export function buildPremiumNatalChartPrompt(natalChart: string): string {
  return `Generate a premium natal chart breakdown for the user.

====================================================
NATAL CHART DATA
====================================================
${natalChart}

====================================================
INSTRUCTIONS
====================================================
- Fully interpret ALL 12 houses (5-7 sentences each).
- Include the full "planets" array with all planet interpretations.
- Include the "aspects" array with notable major aspects.
- Include "loveRead", "careerRead", "growthRead", "advice", "warning", "affirmation".
- Include "personalitySnapshot" (5-7 sentences).
- Nothing generic. If it could apply to anyone, rewrite it.
${STYLE}
====================================================
FIELD RULES
====================================================

HOUSES:
- "houses" is an array of 12 objects, one per house. Each MUST contain:
  - "house": house number as a string ("1" through "12")
  - "sign": the sign on the cusp
  - "degree": degree as a string (e.g. "14°")
  - "ruler": planetary ruler of the cusp sign
  - "planets": array of planets in this house:
    - "name": planet name
    - "sign": sign the planet is in
    - "degree": degree as a string (e.g. "22°")
    - "retrograde": boolean
  - "interpretation": MUST BE 5-7 sentences
  - "locked": always false

PLANETS:
- "planets" is an array, one per planet.
- Include: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn,
  Uranus, Neptune, Pluto, North Node, South Node, Chiron, Lilith.
- Each planet object MUST contain:
  - "name", "sign", "degree" (e.g. "22°"), "house", "retrograde": boolean
  - "interpretation": Sun/Moon/Venus/Mars: 5-7 sentences; Mercury: 4-6;
    Jupiter/Saturn/N.Node/S.Node/Chiron/Lilith: 3-5; Uranus/Neptune/Pluto: 3-4.
    Venus MUST reference love life. Mars MUST reference drive and conflict style.

ASPECTS:
- "aspects": notable major aspects (conjunction, opposition, trine, square, sextile).
- Each MUST contain:
  - "planet1", "planet2", "aspect", "orb" (e.g. "2°"), "interpretation" (3-4 sentences)

SUMMARY READS (5-7 sentences each):
- "personalitySnapshot": Big 3 combo — how Sun, Moon, Rising work together.
- "loveRead": Venus, Mars, 5th/7th house, Moon — patterns, what they attract, what to stop tolerating.
- "careerRead": 10th/6th/2nd house, Saturn, Midheaven.
- "growthRead": Pluto, Chiron, 12th/8th house, Nodes.

OTHER:
- "quote": empowerment/relationship/self-respect quote — no metaphors or innuendos
- "advice": 3-5 sentences, personalized, cannot reference astrological placements
- "warning": 2-3 sentences, based on challenging aspects or placements
- "affirmation": single affirmation rooted in the chart
- "release": short spiritual phrase for comfort and recalibration
${OUTPUT_RULES}
====================================================
OUTPUT FORMAT
====================================================

{
  "quote": "",
  "houses": [
    {
      "house": "1",
      "sign": "",
      "degree": "",
      "ruler": "",
      "planets": [{ "name": "", "sign": "", "degree": "", "retrograde": false }],
      "interpretation": "",
      "locked": false
    }
  ],
  "planets": [
    { "name": "", "sign": "", "degree": "", "house": "", "retrograde": false, "interpretation": "" }
  ],
  "aspects": [
    { "planet1": "", "planet2": "", "aspect": "", "orb": "", "interpretation": "" }
  ],
  "personalitySnapshot": "",
  "loveRead": "",
  "careerRead": "",
  "growthRead": "",
  "advice": "",
  "warning": "",
  "affirmation": "",
  "release": ""
}
`;
}
