// src/constants/strings.ts

export const HOME_STRINGS = {
  newLove: {
    definition: "These zodiacs have a higher likelihood of vibing with you or feeling attraction toward you today.",
    questionFunnel: "How does a new love interest affect my current relationship?"
  },
  returns: {
    definition: "These zodiacs have a higher likelihood of seeking you for closure, clarification or continuation.",
    questionFunnel1: "How does an interference affect my current situation?",
    questionFunnel2: "How does a return of a past love interest affect my current relationship?"
  }
}

export const MESSAGE_IN_A_BOTTLE_RESPONSES: readonly string[] = [
  "You’ve sent it out. You don’t need to hold it anymore.",
  "You can close this now. Let go.",
  "Received.",
  "Pause here for a moment. When you’re ready, move on.",
  "Take one slow breath. Then continue.",
  "What’s meant to stay will stay. What’s meant to go, can go.",
  "Thank you for expressing that. You don’t need to carry it alone anymore.",
  "It has been released.",
  "You are free to rest now.",
  "You’ve given it over. Trust what comes next.",
  "The Universe has received this.",
  "What you needed to say has been said.",
  "Breathe.",
  "The weight has shifted.",
  "Released.",
  "You may let go."
] as const;

export const BIRTH_CHART_STRINGS = {
  natalChart: {
    title: "Natal Chart",
    definition: "You are much more than your sun sign. Consider this as something to an astrological blueprint.",
    description:
      "Your birth chart, also known as a natal chart, is a snapshot of the sky at the exact moment and location of your birth. It maps the positions of the planets, sun, and moon across the twelve astrological houses and signs. This chart serves as a cosmic blueprint that reveals insights into your personality, strengths, challenges, and life path. By analyzing the relationships between these celestial bodies, astrologers can provide a deeper understanding of your character and potential.",
  },
  synastryAnalysis: {
    title: "Synastry Analysis",
    questionFunnel: "How does your chart correlate with your partner?",
    description:
      "Synastry analysis is the comparison of two individuals' birth charts to assess their astrological compatibility. By examining the interactions between the planets, houses, and aspects in each chart, astrologers can identify areas of harmony and potential challenges in the relationship. This analysis provides insights into how two people relate to each other emotionally, intellectually, and physically, helping to understand the dynamics of their connection and guiding them toward a more fulfilling relationship.",
  }
};

export const COMPATIBILITY_STRINGS = {
  title: "Compatibility",
  description:
    "Your compatibility metrics are calculated using both individuals’ astrological placements and current planetary transits. These indicators reflect emotional, mental, physical, and behavioral dynamics between two people.",

  metrics: {
    interest: {
      label: "Interest",
      definition:
        "Enthusiasm, curiosity, and concern toward one another."
    },
    communication: {
      label: "Communication",
      definition:
        "Clarity in language and expression of ideas. Probability of executing efficient conversation."
    },
    resonation: {
      label: "Resonation",
      definition:
        "Ability to understand, vibe, and find mutual meaning with one another."
    },
    loyalty: {
      label: "Loyalty",
      definition:
        "Genuine, internally driven obligation and devotion toward one another."
    },
    attraction: {
      label: "Attraction",
      definition:
        "Physical and psychological enticement."
    },
    sexualSynergy: {
      label: "Sexual Synergy",
      definition:
        "Likelihood of sexual cooperation, harmony, and mutual intimacy with one another."
    },
    empathy: {
      label: "Empathy",
      definition:
        "Sensitivity, understanding, and compassion toward one another."
    },
    reasoning: {
      label: "Reasoning",
      definition:
        "Forming logical and sensible thoughts to solve problems with one another."
    },
    persuasion: {
      label: "Persuasion",
      definition:
        "Likelihood of adjusting one’s beliefs, perspective, and opinions."
    },
    stubbornness: {
      label: "Stubbornness",
      definition:
        "Likelihood of resistance, especially over difficult choices associated with one another."
    },
    sacrifice: {
      label: "Sacrifice",
      definition:
        "Likelihood of rearranging or discarding certain conveniences and priorities for one another."
    },
    ego: {
      label: "Ego",
      definition:
        "Likelihood of placing self-importance over the connection."
    },
    desire: {
      label: "Desire",
      definition:
        "Strong internal demand, attraction, and longing for the other individual."
    },
    adaptability: {
      label: "Adaptability",
      definition:
        "Strength of ongoing adjustments in values or moral compass for long-term unity."
    },
    responsibility: {
      label: "Responsibility",
      definition:
        "Feeling obligation toward the other individual."
    },
    accountability: {
      label: "Accountability",
      definition:
        "Willingness to accept responsibility or blame over issues within the connection."
    },
    guilt: {
      label: "Guilt",
      definition:
        "Shame related to current, premeditated, or past errors within the connection."
    },
    hostility: {
      label: "Hostility",
      definition:
        "Possibility of opposition, rebellious behavior, or contradiction toward the other."
    },
    irritability: {
      label: "Irritability",
      definition:
        "Likelihood of agitation or stress triggered by the other individual."
    },
    honesty: {
      label: "Honesty",
      definition:
        "Integrity in adhering to facts, intentions, and transparent thoughts."
    }
  }
};