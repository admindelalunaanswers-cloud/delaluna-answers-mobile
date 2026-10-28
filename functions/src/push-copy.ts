/**
 * Push notification body copy.
 *
 * Every recurring push draws its body from one of these pools instead of
 * shipping a single fixed line, so a user who gets the same notification every
 * day doesn't read the same sentence every day. The pools are marketing copy —
 * edit them freely; nothing here is load-bearing except the arrays staying
 * non-empty.
 *
 * Titles are deliberately NOT randomised. `dailyHoroscopeNotifications`
 * de-duplicates its outbound batch on `${token}|${title}`, so a rotating title
 * would stop collapsing the duplicate sends that a stale second user doc
 * produces. Keep the variation in the body.
 */

/** Sunday connection update and Thursday weekend romance report. */
export const COMPATIBILITY_BODIES: readonly string[] = [
  "True love or just delulu? Your compatibility scores got updated.",
  "The compatibility scores just dropped.",
  "The compatibility scores for the week are OUT.",
  "Check these new scores before you reply to that text.",
  "Don't sleep on these compatibility scores.",
  "The scores between you two are fresh out the oven.",
  "Quit playin'! Come look at this compatibility.",
  "High chemistry, low compatibility this week.",
  "New scores just hit. Don't get caught slipping!",
  "Don't trust this week. Check these scores.",
  "These scores are a hot mess.",
  "RED FLAG ALERT! Check these scores.",
  "High attraction, zero peace. Check your new scores.",
  "The numbers do NOT lie. See where you two stand.",
  "Block them or date them? This score will decide.",
  "The compatibility score between you two is… unexpected.",
  "Your weekend compatibility reveals a massive blind spot.",
  "The stars just exposed the real reason they haven't texted.",
  "The numbers between you two just dropped, and YIKES.",
  "Want to know your biggest green flag this weekend? Tap in.",
  "The truth on your scores this week is kind of harsh.",
  "You won't believe who is getting savage this week.",
  "Your week's scores dropped and honestly? Mm..",
  "Nobody gonna live rent free in your head with these scores.",
  "Y'all are either endgame or a total dumpster fire. Tap in.",
  "The chemistry doesn't lie. Look at this compatibility.",
  "Is it actual love or are you just down bad? The scores are OUT.",
  "The new scores said let them fumble you.",
  "These scores done said someone moving shady.",
  'These numbers said "RUN!"',
  "A real simp this week. Look at these fresh numbers.",
  "These numbers said it's time to bounce.",
  "The scores hit different this time.",
  "The scores. It is what it is.",
  "The scores. It's giving…",
  "These scores give thirsty vibes.",
  "Who is getting CANCELED with these scores?",
  "Are these stats cringe? What do you think?",
  "These scores aren't the cutest in my book.",
  "Lowkey kinda liking these scores. Look…",
  "Time to deep dive on these compatibility scores.",
];

/** `notifyBreakdownReady` — the natal chart breakdown finished generating. */
export const BIRTH_CHART_BODIES: readonly string[] = [
  "Your cosmic blueprint is ready to view.",
  "That rising sign is carrying your whole rep. Your chart is ready.",
  "Your birth chart just dropped the actual receipts.",
  "It all makes sense now- come look at this natal chart!",
  "Your birth chart just got decoded.",
  "Your birth chart just dropped the deets.",
  "Sun, Moon and Rising revealed. Tap in.",
  "This placement is causing 90% of your problems. Open up.",
  "Self Aware ALERT. Your birth chart is OUT!",
  "Time to be enlightened! Your natal chart is here.",
  "Them chart receipts just dropped.",
  "Your chart just called you out directly.",
  "The universe exposed you. View your chart.",
  "Why you act like that? Your chart has the answer.",
  "Your birth chart receipts have gone LIVE.",
  "Stop blaming your parents—your chart is ready.",
  "Chart decoded. Prepare to feel attacked.",
  "Your chart said you're the problem. Come look.",
  "It's not a curse, it's just your chart. Open up.",
  "Your natal chart is out here exposing your toxic traits.",
  "Unpack this emotional baggage! Your birth chart is ready.",
  "The chart just proved you're extra. Come see why.",
  "The birth chart is calling out your worst habits.",
  "This ONE hidden placement is sabotaging your love life.",
  "Your Sun, Moon, and Rising match a very specific pattern…",
  "This placement explains why you can never just chill.",
  "This is you- tap and see.",
];

/** The morning horoscope-and-cards reminder. */
export const DAILY_HOROSCOPE_BODIES: readonly string[] = [
  "Come look at these cards!",
  "This moon will have you messed up today.",
  "These Tarot cards aren't going to read themselves!",
  "You need to be ahead of the game and see this warning rn.",
  "Your horoscope is giving Main Character energy today.",
  "Here is your daily survival guide.",
  "Today's forecast: mind your business and lock in.",
  "Today's energy is testing your patience. Let's see who we're ignoring.",
  "You asked for a sign—the daily Tarot pull is waiting.",
  "One of your Tarot cards came out reversed. Come read this horoscope.",
  "Today's horoscope: lock in and lay low.",
  "Today's card callout is unlocked.",
  "Stop scrolling—your card pull is here.",
  "Let's get petty. Tap in.",
  "This horoscope is so unhinged today.",
  "Don't crash out before noon. Read your horoscope first.",
  'Today is giving major "stay in the house" vibes.',
  "Don't get triggered. Check your forecast.",
  "Hold down your boundaries. Read this forecast.",
  "Your wake up call is READY.",
  "Zero filter today.",
  "Update- Just put them on MUTE.",
  "Don't say I didn't warn you! Read today's forecast.",
  "The cards said just Block their @$$",
  "The Moon is in a messy position for your sign today.",
  "Today's forecast has a very specific warning for your sign.",
  "PLOT TWIST!",
  "TRUTH BOMB!",
  "You asked for a sign and the cards came out swinging.",
  "The moon said NOT TODAY!",
  "The daily update basically said keep it moving.",
  "Today is gonna be LIT!",
  "This moon phase will have you triggered.",
  "We on vibes today. Check this out.",
  "Look who wants to circle back today.",
  'Check out "New Love." Love that for you.',
  "The update said don't get catfished.",
  "Check in. We need to touch base.",
  "We are winging it today!",
  "The Warning. OMG.",
  "Update- don't let them move the goal post!",
  "Let's stay on the same page. Check in.",
  "YOLO! Today is the day. Come look.",
];

/** `notifyChatReply` — the AI advisor answered a chat question. */
export const CHAT_REPLY_BODIES: readonly string[] = [
  "Don't leave the chat hanging.",
  "Get back on this chat.",
  "Check back on this tea!",
  "Are we reading or are we sleeping?",
  "Your cosmic advisor read them to filth.",
  "Your cosmic advisor did not hold back.",
  "Do you want this tea or not?",
  "Don't leave me on read.",
  "No BS replied.",
  "Read this before you crash out.",
  "Oof! Your advisor responded.",
  "Brace yourself! Your advisor sent the response.",
  "This tea is boiling hot, baby!",
  "Your spiritual advisor did not come to play.",
  "100% FACTS, right here.",
  "Your advisor said NAH!",
  "Your cosmic advisor keeping it a stack.",
  "The reply, No cap.",
  "Your advisor is so seriousss rn.",
  "Your chat reply is so for real.",
  "Real talk. Look at this.",
];

/** The Sunday weekly transits reminder and `notifyTransitsReady`. */
export const TRANSIT_BODIES: readonly string[] = [
  "The planets are doing the absolute most today.",
  "Tap to see which transit is messing with your head.",
  "Mars is out here causing problems. Check these transits.",
  "Cosmic shift alert: The transits just changed up.",
  "Mercury is making things weird again. Here's how it's hitting your house today.",
  "Here are new transits to put the blame on!",
  "Transit alert: high chance of bad decisions.",
  "Major planetary shift today. Check the damage.",
  "Transit update: Lock the F in!",
  "Planetary shift unlocked! See what's going down.",
  "The transits are testing your sanity today. Read up.",
  "The universe is trying you. See which planet it is.",
  "Something shifts in your chart at 3 PM today. Be ready.",
  "Today's transits shows a major trap. Here's how to dodge it.",
  "A subtle planetary shift is about to flip your whole mood.",
  "These planets will have you on the EDGE.",
  "You're not fighting demons. It's just the planets.",
  "Mercury is back on its BS! Check this out.",
  "Tame that Mars energy ASAP or we swinging hands. Open up!",
  'The planets said "WE OUTSIDE!!!"',
  "Venus said GET A BAG instead. Here's why",
  "Jupiter is keeping it boujee. Check the transits.",
  "The planets give the green light to GLOW UP.",
  "Check the transits. That Sun is so extra.",
  "Transits said it's time to ghost. Come look.",
  "Venus said it's cuffing season!",
  "Sun energy will have you on fleek. Check it!",
  "Transits are giving hook up energy.",
];

/**
 * Picks one line out of a pool.
 *
 * `seed` is an already-hashed number — callers pass `hashUid(uid, salt)` so the
 * choice is stable for a given user and window (re-running the scheduled job,
 * or a Cloud Function retry, picks the same line rather than a second one) and
 * varies as the salt moves with the date.
 */
export function pickPushBody(lines: readonly string[], seed: number): string {
  return lines[seed % lines.length];
}
