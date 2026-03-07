// Questions used for sign up chat flow

export const SIGN_UP_QUESTIONS = {
  firstName: "Hey, I'm glad you're here! I have to ask a few quick questions for astrological reasons.\n\nWhat's your first name?",
  lastName: (firstName: string) => `Alright, ${firstName}! And your last name?`,
  pronouns: (firstName: string) => `What are your pronouns, ${firstName}?`,
  birthday: "I need to calculate your birth chart — it's basically a map of the planets and their exact coordinates at the moment you were born.\n\nWhat is your birthdate?",
  birthtime: "Would you happen to know what time you were born?",
  placeOfBirth: "...and do you know where you were born?",
  email: "What's your email address?",
  password: "Almost there! Create a password to secure your account.",
  final: "Your secrets are safe with us 🔐",
};

// Defaults used when the user skips optional birth data
export const BIRTH_DEFAULTS = {
  UNKNOWN_BIRTHTIME: '12:00',          // midday in local time
  FALLBACK_LAT: 51.4779,               // Greenwich
  FALLBACK_LON: 0.0015,
  FALLBACK_TIMEZONE: 0,                // UTC
};
