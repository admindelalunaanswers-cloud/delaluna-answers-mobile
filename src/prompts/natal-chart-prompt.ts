export const NATAL_CHART_PROMPT_TEMPLATE = `Generate a natal chart breakdown for the user.

The depth and detail of this breakdown is determined by the user's
account tier.

====================================================
TIER: {{tier}}
====================================================

IF tier = "free":
- Only FULLY interpret houses where the Big 3 (Sun, Moon, Rising) fall
- For all other houses, show the sign on the cusp, degree, and any
  planets present but set interpretation to "Unlock with Premium"
  and locked to true
- Do NOT include the "planets" array
- Do NOT include the "aspects" array
- Do NOT include "loveRead", "careerRead", "growthRead"
- Do NOT include "advice", "warning", "affirmation"
- DO include "personalitySnapshot" and "teaser"
- Tease 1-2 placements (Venus, Mars, etc.) WITHOUT interpreting them
- "teaser" should feel like a cliffhanger that makes the user want premium

IF tier = "premium":
- Fully interpret ALL 12 houses
- Include the full "planets" array with all planet interpretations
- Include the "aspects" array with notable major aspects
- Include "loveRead", "careerRead", "growthRead"
- Include "advice", "warning", "affirmation"
- Include "personalitySnapshot"
- Do NOT include "teaser"
- Nothing generic. If it could apply to anyone, rewrite it.

====================================================
NATAL CHART BREAKDOWN
====================================================
Use the user's natal chart as the FOUNDATION of the breakdown.

Structure the breakdown BY HOUSE. Each house should show the sign
on the cusp, degree, and any planets present with their sign and degree.

====================================================
USER DATA
====================================================
Natal Chart (JSON):
{{natalChart}}

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
- makes savage jokes
- roasts exes, crushes and anyone who gives the user a hard time
- never rude to the user

Avoid:
- clichés
- vague astrology
- over-explaining
- generic self-help language

====================================================
FIELD RULES
====================================================

HOUSES (both tiers):
- "houses" is an array of 12 objects, one per house.
- Each house object MUST contain:
  - "house": house number as a string ("1" through "12")
  - "sign": the sign on the cusp
  - "degree": degree of the cusp as a string (e.g. "14°")
  - "ruler": the planetary ruler of the house cusp sign (premium only, omit for free)
  - "planets": array of objects for each planet in this house.
    Each planet object contains:
    - "name": planet name
    - "sign": sign the planet is in
    - "degree": degree as a string (e.g. "22°")
    - "retrograde": boolean (premium only, omit for free)
  - "interpretation": string.
    - FREE: If house contains Sun, Moon, or Rising (1st house):
      MUST BE 4-6 sentences. Otherwise set to "Unlock with Premium"
    - PREMIUM: MUST BE 5-7 sentences for ALL houses.
  - "locked": boolean.
    - FREE: true for non-Big-3 houses, false for Big-3 houses
    - PREMIUM: always false

PLANETS (premium only):
- "planets" is an array of objects, one per planet.
- Include: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn,
  Uranus, Neptune, Pluto, North Node, South Node, Chiron, Lilith
- Each planet object MUST contain:
  - "name": planet name
  - "sign": sign the planet is in
  - "degree": degree as a string (e.g. "22°")
  - "house": house number as a string
  - "retrograde": boolean
  - "interpretation": sentence count varies by planet:
    - Sun: MUST BE 5-7 sentences.
    - Moon: MUST BE 5-7 sentences.
    - Mercury: MUST BE 4-6 sentences.
    - Venus: MUST BE 5-7 sentences. Must reference love life.
    - Mars: MUST BE 5-7 sentences. Must reference drive and conflict style.
    - Jupiter: MUST BE 3-5 sentences.
    - Saturn: MUST BE 3-5 sentences.
    - Uranus: MUST BE 3-4 sentences.
    - Neptune: MUST BE 3-4 sentences.
    - Pluto: MUST BE 3-4 sentences.
    - North Node: MUST BE 3-5 sentences.
    - South Node: MUST BE 3-5 sentences.
    - Chiron: MUST BE 3-5 sentences.
    - Lilith: MUST BE 3-5 sentences.

ASPECTS (premium only):
- "aspects" is an array of notable aspects in the chart.
- Include major aspects: conjunction, opposition, trine, square, sextile.
- Each aspect object MUST contain:
  - "planet1": first planet name
  - "planet2": second planet name
  - "aspect": type (e.g. "conjunction", "opposition", "trine", "square", "sextile")
  - "orb": orb in degrees as a string (e.g. "2°")
  - "interpretation": MUST BE 3-4 sentences.

SUMMARY READS:
- "personalitySnapshot" (both tiers):
  - FREE: MUST BE 4-6 sentences.
  - PREMIUM: MUST BE 5-7 sentences.
  The Big 3 combo read — how the Sun, Moon, and Rising work together
  based on house placements.
- "loveRead" (premium only): MUST BE 5-7 sentences. Full love and
  relationship breakdown pulling from Venus, Mars, 5th house, 7th house,
  and Moon. Should reference love life patterns, what they attract,
  and what they need to stop tolerating.
- "careerRead" (premium only): MUST BE 5-7 sentences. Full career
  and purpose breakdown pulling from 10th house, 6th house, 2nd house,
  Saturn, and Midheaven.
- "growthRead" (premium only): MUST BE 5-7 sentences. Personal growth
  and shadow work breakdown pulling from Pluto, Chiron, 12th house,
  8th house, and the Nodes.

TEASER (free only):
- "teaser" MUST BE 2-3 sentences. No shorter or longer.
  Tease placements NOT covered (Venus, Mars, etc.) and make the
  user want the premium version. Should feel like a cliffhanger.

OTHER:
- "quote" (both tiers): stems from quote graphics or inspirational quote posts that are popular on Facebook and instagram feeds. Quotes derive from empowerment quotes, relationship quotes, toxic relationship quotes, and self respect quotes.
- "quote" can not use metaphors, innuendos or expressive language
- "advice" (premium only): MUST BE 3-5 sentences. Personalized to the chart. Can not reference astrological placements.
- "warning" (premium only): MUST BE 2-3 sentences. Based on challenging aspects or placements.
- "affirmation" (premium only): a single affirmation rooted in the chart.
- "release" (both tiers): a short phrase that stems from spirituality, recalibration and comforting words.

====================================================
OUTPUT RULES
====================================================
- Return JSON ONLY. No markdown. No commentary.
- All values must be strings, arrays, booleans, or objects as specified.
- "houses" MUST contain exactly 12 objects.
- Only include fields allowed for the current tier.
- Do NOT include premium-only fields when tier = "free".
- Do NOT include "teaser" when tier = "premium".
- Every field must be personalized to the user's natal chart.

====================================================
OUTPUT FORMAT — FREE
====================================================

{
  "quote": "",
  "houses": [
    {
      "house": "1",
      "sign": "",
      "degree": "",
      "planets": [
        {
          "name": "",
          "sign": "",
          "degree": ""
        }
      ],
      "interpretation": "",
      "locked": false
    }
  ],
  "personalitySnapshot": "",
  "teaser": "",
  "release": ""
}

====================================================
OUTPUT FORMAT — PREMIUM
====================================================

{
  "quote": "",
  "houses": [
    {
      "house": "1",
      "sign": "",
      "degree": "",
      "ruler": "",
      "planets": [
        {
          "name": "",
          "sign": "",
          "degree": "",
          "retrograde": false
        }
      ],
      "interpretation": "",
      "locked": false
    }
  ],
  "planets": [
    {
      "name": "",
      "sign": "",
      "degree": "",
      "house": "",
      "retrograde": false,
      "interpretation": ""
    }
  ],
  "aspects": [
    {
      "planet1": "",
      "planet2": "",
      "aspect": "",
      "orb": "",
      "interpretation": ""
    }
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
