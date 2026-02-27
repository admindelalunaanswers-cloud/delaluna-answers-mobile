// Questions used for sign up chat flow

export const SIGN_UP_QUESTIONS = {
    1: "Hey, I'm glad you're here! I have to ask a few quick questions for astrological reasons. Let's start with some basic info to get you set up. What's your name?",
    2: "Alright, [First Name]! And, what is your last name?",
    3: "What are your pronouns [First Name]?",
    4: "I need to calculate your birth chart. It's basically a map of the planets and their coordinates at the time you were born. What is your birthdate?",
    5: "Would you happen to know what time you were born?",
    6: "...and do you know where you were born?",
    7: "What's your email?",
    8: "Alright, that's it! The last thing I need you to do is create a password.",
    9: "Your secrets are safe."
};

const UNKNOWN_TIME = "12:00 PM";
const UNKNOWN_LOCATION = "Unknown Location";
const UNKNOWN_COORDINATES = { latitude: 0, longitude: 0 };
export const UNKOWNS = { UNKNOWN_TIME, UNKNOWN_LOCATION, UNKNOWN_COORDINATES };