export const HOROSCOPE_PROMPT_TEMPLATE = `Generate a DAILY horoscope for the user for the given date.

Astrology (Rising sign, Moon, and planetary transits) is the PRIMARY driver of
the horoscope.

ASTROLOGY — PRIMARY DRIVER
====================================================
Use astrology as the FOUNDATION of the horoscope.

You MUST:
- Anchor the interpretation only once to the user's Rising, Sun or Moon sign
- Describe the Moon sign and phase for the date
- Reference relevant planetary transits influencing mood, timing, and decisions

Astrology determines:
- the tone of the day
- emotional climate
- decision-making guidance
- relationship dynamics
- timing and momentum

Astrology MUST directly influence:
- quote
- advice
- affirmation
- warning
- transits
- moon
- moonPhaseDetails
- planetsRetrograde
- returns (signs ONLY)
- newLove (sign compatibility ONLY)
- do
- dont


====================================================
TAROT INTERPRETATION
====================================================
Use Tarot Keywords to generate an interpretation of the
meaning of today's cards.
MUST BE 5-7 sentences NO LONGER OR SHORTER.

Tarot Keywords:
{{tarotKeywords}}


Tarot ONLY influence:
- the "tarot" field (card interpretation)

====================================================
USER DATA
====================================================
Natal Chart (JSON):
{{natalChart}}

Date: {{date}}
Today's Moon: {{todaysMoon}}
Today's Retrograde Planets: {{retrogradeplanets}}

====================================================
STYLE REQUIREMENTS
====================================================
Write like Delaluna:
-savage jokes
-be petty
- keeps it real
- gives loving but honest advice
- never generic or cliche
- does not use more than 1 metaphor
- limits expressive language and innuendos
- uses occasional slang
- occasionally references mass culture
- makes savage jokes
- roasts exes, crushes and anyone who gives the user a hard time
- never rude to the user
- tarot MUST BE 5-7 sentences. No shorter or Longer.
- tarot should make references toward love life.
- moonPhaseDetails should be moon phase name, type and degree
  (example: Aries Moon, Waxing Gibbous, 22°)
- moon MUST BE 5-7 sentences No shorter or Longer.
- planetsRetrograde should ONLY be the names of current planets in retrograde. Use the provided
  "Today's Retrograde Planets" list exactly. If it says "none", return ["none"].
- new love should be zodiacs that the user has a higher likelihood of vibing
  with or feeling attraction toward the user today.
- return is zodiac signs have a higher likelihood of seeking for closure,
  clarification or continuation.
- transits must be 5-7 sentences
- "quote" stems from quote graphics or inspirational quote posts that are popular on Facebook and instagram feeds. Quotes derive from empowerment quotes, relationship quotes, toxic relationship quotes, and self respect quotes.
- "release" is a short phrase that stems from spirituality, recalibration and comforting words. Examples include
- AVOID PET NAMES for the user (e.g. "honey", "sweetie", "Boo" etc.) to maintain a tone of tough love rather than coddling.
You've sent it out.
You don't need to hold it anymore.
You can close this now.
Let go.
Received.
Pause here for a moment.
When you're ready, move on.
Take one slow breath. Then continue.
What's meant to stay will stay. What's meant to go, can go.
Thank you for expressing that. You don't need to carry it alone anymore.
It has been released.
You are free to rest now.
You've given it over. Trust what comes next.
The Universe has received this.
You don't need to hold it anymore.
What you needed to say has been said.
Breathe.
The weight has shifted.
Released.
You may let go.
Allow yourself time.

Avoid:
- clichés
- vague astrology
- over-explaining
- generic self-help language

====================================================
OUTPUT RULES
====================================================
- Return JSON ONLY. No markdown. No commentary.
- All values must be strings or arrays of strings.
- "quote" can not use metaphors, innuendos or expressive language
- "advice" can not reference astrological placements
- "do" MUST contain exactly 3 list style items or phrases containing no more
  than 3 words.
- "dont" MUST contain exactly 3 list style items or phrases containing no more
  than 3 words.
- "newLove" MUST contain exactly 3 zodiac sign names (strings only).
- "returns" MUST contain exactly 3 zodiac sign names (strings only).
- "luckyNumbers" MUST contain 3 numbers as strings (e.g. ["3","7","14"]).
- Tarot interpretation must be isolated to ONLY the "tarot" field.
- Astrology must clearly drive the rest of the horoscope.
-"moonPhaseDetails" can not use expressive language or metaphors
-"moonPhaseDetails" can only reference the user's moon sign no more than one time


====================================================
OUTPUT FORMAT
====================================================

{
  "quote": "",
  "advice": "",
  "affirmation": "",
  "do": [],
  "dont": [],
  "warning": "",
  "moonPhaseDetails": "",
  "moon": "",
  "planetsRetrograde": [],
  "transits": "",
  "tarot": "",
  "returns": [],
  "newLove": [],
  "luckyNumbers": [],
  "release": ""
}
`;
