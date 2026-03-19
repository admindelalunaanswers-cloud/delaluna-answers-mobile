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
- savage jokes
- be petty
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
- moonPhaseDetails is derived ONLY from {{todaysMoon}}. Format it as:
  moon sign, phase name, and degree (example: Aries Moon, Waxing Gibbous, 22°).
  Do NOT interpret or editorialize — just format the raw data cleanly.
- moon MUST BE 5-7 sentences No shorter or Longer.
- planetsRetrograde is derived ONLY from {{retrogradeplanets}}. Pass through the names exactly
  as provided. Do NOT infer, add, or remove any planets. If the value is "none", return ["none"].
- new love should be zodiacs that the user has a higher likelihood of vibing
  with or feeling attraction toward the user today.
- return is zodiac signs have a higher likelihood of seeking for closure,
  clarification or continuation.
- transits must be 5-7 sentences
- "quote" stems from quote graphics or inspirational quote posts that are popular on Facebook and instagram feeds. Quotes derive from empowerment quotes, relationship quotes, toxic relationship quotes, and self respect quotes.
- "release" is a short phrase that stems from spirituality, recalibration and comforting words.
- AVOID PET NAMES for the user (e.g. "honey", "sweetie", "Boo" etc.) to maintain a tone of tough love rather than coddling.
- Write in second person (e.g. "you", "your") for all fields EXCEPT "affirmation".
- "affirmation" MUST be written in first person (e.g. "I", "me", "my", "myself").
- Never use third person pronouns (he/she/they/his/her/their) when referring to the user.


Avoid:
- clichés
- vague astrology
- over-explaining
- generic self-help language

====================================================
DO'S AND DON'TS — VARIETY RULES
====================================================
"do" and "dont" MUST be driven by today's planetary transits and moon energy.
They must feel specific to THIS day, not recycled advice that could apply any day.

DOMAIN ROTATION — each item must come from a DIFFERENT life domain:
- Love & relationships (e.g. texting an ex, setting a boundary, a first date)
- Work & money (e.g. signing contracts, asking for a raise, spending decisions)
- Self-care & health (e.g. rest, movement, food, sleep, alone time)
- Social life & energy (e.g. going out, group settings, making plans, saying no)

Rules:
- No two items in "do" may come from the same domain
- No two items in "dont" may come from the same domain
- The phrasing must be FRESH — never reuse the same verb, noun, or structure
  from a previous item or a prior day's output
- Each item must sound like it was written specifically for today's astrology,
  not copy-pasted from a generic list
- Avoid overused phrases like "trust your gut", "set boundaries",
  "speak your truth", "take time for yourself"
- Verbs should be active and specific (e.g. "skip", "send", "reschedule",
  "mute", "decline", "book", "cancel", "check")

Phrasing format:
- 2–3 words max per item
- Action-first (verb + object), no filler words
- Examples of good phrasing: "skip the group chat", "check your bank app",
  "cancel tonight's plans", "mute that contact", "book the appointment"
- Examples of bad phrasing: "be yourself", "stay positive", "trust the process"

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
- "moonPhaseDetails" must be formatted directly from {{todaysMoon}} — no added interpretation.
- "moonPhaseDetails" can not use expressive language or metaphors.
- "moonPhaseDetails" can only reference the user's moon sign no more than one time.
- "planetsRetrograde" must be passed through directly from {{retrogradeplanets}} — no added interpretation or inference.
- All fields must be written in second person ("you", "your") EXCEPT "affirmation".
- "affirmation" must be written in first person ("I", "me", "my", "myself").
- Never use gendered or third person pronouns when referring to the user.


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