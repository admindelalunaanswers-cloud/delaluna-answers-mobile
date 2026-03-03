export const TRANSITS_PROMPT_TEMPLATE = `Generate a transit breakdown for the user.

Show how CURRENT planetary transits are affecting the user's natal chart,
interpreted house-by-house. Each house gets one transit interpretation
based on what transiting planets are currently moving through it.

The depth and detail of this breakdown is determined by the user's
account tier.

====================================================
TIER: {{tier}}
====================================================

IF tier = "free":
- Only FULLY interpret the 3 most active transit houses
  (houses with the most significant or impactful transits happening now)
- For all other houses, show the transiting planet(s) and sign
  but set interpretation to "Unlock with Premium" and locked to true
- Do NOT include the "transitAspects" array
- Do NOT include "loveTransit", "careerTransit", "growthTransit"
- Do NOT include "advice", "warning", "affirmation"
- DO include "overview" and "teaser"
- "teaser" should tease locked houses and make the user want premium

IF tier = "premium":
- Fully interpret ALL 12 houses
- Include the "transitAspects" array with current transit-to-natal aspects
- Include "loveTransit", "careerTransit", "growthTransit"
- Include "advice", "warning", "affirmation"
- Include "overview"
- Do NOT include "teaser"
- Nothing generic. If it could apply to anyone, rewrite it.

====================================================
TRANSIT BREAKDOWN
====================================================
Use the user's natal chart AND current transits as the FOUNDATION.

For each house, show which transiting planets are currently moving
through that natal house and interpret how they are affecting the
user RIGHT NOW. The natal house cusp sign provides context.
The transiting planet's sign, degree, and motion determine the effect.

====================================================
USER DATA
====================================================
Natal Chart (JSON):
{{natalChart}}

Current Transits (JSON):
{{currentTransits}}

Date: {{date}}

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
  - "natalSign": the natal sign on the cusp
  - "natalDegree": degree of the natal cusp as a string (e.g. "14°")
  - "transits": array of objects for each transiting planet currently
    in this house. Each transit object contains:
    - "name": transiting planet name
    - "sign": sign the transiting planet is currently in
    - "degree": current degree as a string (e.g. "8°")
    - "retrograde": boolean (premium only, omit for free)
  - "interpretation": string.
    - FREE: If this is one of the 3 most active transit houses:
      MUST BE 4-6 sentences. Otherwise set to "Unlock with Premium"
    - PREMIUM: MUST BE 5-7 sentences for ALL houses.
      If no transiting planets are in the house, interpret the
      energy of the empty house based on its natal sign and ruler
      in 2-3 sentences.
  - "locked": boolean.
    - FREE: true for non-active houses, false for the 3 active houses
    - PREMIUM: always false

TRANSIT-TO-NATAL ASPECTS (premium only):
- "transitAspects" is an array of current transiting planets forming
  aspects to the user's natal planets.
- Include major aspects: conjunction, opposition, trine, square, sextile.
- Each aspect object MUST contain:
  - "transitPlanet": name of the transiting planet
  - "transitSign": sign the transiting planet is in
  - "transitDegree": current degree as a string
  - "natalPlanet": name of the natal planet being aspected
  - "natalSign": sign the natal planet is in
  - "natalDegree": degree of the natal planet as a string
  - "aspect": type (e.g. "conjunction", "opposition", "trine", "square", "sextile")
  - "orb": orb in degrees as a string (e.g. "2°")
  - "interpretation": MUST BE 3-4 sentences.

OVERVIEW:
- "overview" (both tiers):
  - FREE: MUST BE 4-6 sentences.
  - PREMIUM: MUST BE 5-7 sentences.
  A summary of the overall transit climate for the user right now.
  What is the general energy? What areas of life are most activated?

SUMMARY READS (premium only):
- "loveTransit" MUST BE 5-7 sentences. How current transits are
  affecting the user's love life. Pull from transits through the
  5th house, 7th house, and aspects to natal Venus and Mars.
  Should reference what is shifting in relationships right now.
- "careerTransit" MUST BE 5-7 sentences. How current transits are
  affecting the user's career and finances. Pull from transits through
  the 2nd house, 6th house, 10th house, and aspects to natal Saturn.
- "growthTransit" MUST BE 5-7 sentences. How current transits are
  pushing personal growth. Pull from transits through the 8th house,
  12th house, and aspects to natal Pluto, Chiron, and the Nodes.

TEASER (free only):
- "teaser" MUST BE 2-3 sentences. No shorter or longer.
  Tease the locked houses and what the user is missing.
  Should feel like a cliffhanger.

OTHER:
- "quote" (both tiers): stems from quote graphics or inspirational quote posts that are popular on Facebook and instagram feeds. Quotes derive from empowerment quotes, relationship quotes, toxic relationship quotes, and self respect quotes.
- "quote" can not use metaphors, innuendos or expressive language
- "advice" (premium only): MUST BE 3-5 sentences. Personalized to current transits. Can not reference astrological placements.
- "warning" (premium only): MUST BE 2-3 sentences. Based on challenging transit aspects.
- "affirmation" (premium only): a single affirmation rooted in the current transits.
- "release" (both tiers): a short phrase that stems from spirituality, recalibration and comforting words.
- "retrogradesActive" (both tiers): array of planet names currently in retrograde. If none, set to ["none"].

====================================================
OUTPUT RULES
====================================================
- Return JSON ONLY. No markdown. No commentary.
- All values must be strings, arrays, booleans, or objects as specified.
- "houses" MUST contain exactly 12 objects.
- Only include fields allowed for the current tier.
- Do NOT include premium-only fields when tier = "free".
- Do NOT include "teaser" when tier = "premium".
- Every field must be personalized to the user's natal chart and current transits.

====================================================
OUTPUT FORMAT — FREE
====================================================

{
  "quote": "",
  "houses": [
    {
      "house": "1",
      "natalSign": "",
      "natalDegree": "",
      "transits": [
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
  "overview": "",
  "retrogradesActive": [],
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
      "natalSign": "",
      "natalDegree": "",
      "transits": [
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
  "transitAspects": [
    {
      "transitPlanet": "",
      "transitSign": "",
      "transitDegree": "",
      "natalPlanet": "",
      "natalSign": "",
      "natalDegree": "",
      "aspect": "",
      "orb": "",
      "interpretation": ""
    }
  ],
  "overview": "",
  "loveTransit": "",
  "careerTransit": "",
  "growthTransit": "",
  "retrogradesActive": [],
  "advice": "",
  "warning": "",
  "affirmation": "",
  "release": ""
}
`;
