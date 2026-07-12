export type HarmType = "self-harm" | "violence" | "crime";

const SELF_HARM_PHRASES = [
  "kill myself",
  "end my life",
  "don't want to live",
  "can't do this anymore",
  "want to die",
  "wish i was dead",
  "better off dead",
  "suicide",
  "suicidal",
  "hurt myself",
  "harm myself",
  "self harm",
  "cut myself",
  "cutting myself",
  "unalive myself",
  "unalive me",
  "not worth living",
  "no point in living",
  "everyone would be better without me",
  "want to disappear forever",
  "planning to end it",
];

const VIOLENCE_PHRASES = [
  "kill him",
  "kill her",
  "kill them",
  "murder him",
  "murder her",
  "going to hurt him",
  "going to hurt her",
  "going to hurt them",
  "want to hurt him",
  "want to hurt her",
  "shoot him",
  "shoot her",
  "stab him",
  "stab her",
  "make him suffer",
  "make her suffer",
  "beat him up",
  "beat her up",
];

const CRIME_PHRASES = [
  "rob him",
  "rob her",
  "rob them",
  "steal from",
  "break into his",
  "break into her",
  "burn down his",
  "burn down her",
  "slash his tires",
  "slash her tires",
  "key his car",
  "key her car",
  "vandalize his",
  "vandalize her",
  "poison his",
  "poison her",
];

export function checkForHarm(text: string): HarmType | null {
  const value = text.toLowerCase();
  if (SELF_HARM_PHRASES.some((p) => value.includes(p))) return "self-harm";
  if (VIOLENCE_PHRASES.some((p) => value.includes(p))) return "violence";
  if (CRIME_PHRASES.some((p) => value.includes(p))) return "crime";
  return null;
}

export const HARM_ALERTS: Record<HarmType, { title: string; message: string }> = {
  "self-harm": {
    title: "We're Here For You",
    message:
      "It sounds like you're going through something really difficult right now.\n\n" +
      "Please reach out to someone who can help:\n\n" +
      "🆘 988 Suicide & Crisis Lifeline\n" +
      "📱 Text 'HELLO' to 741741 (Crisis Text Line)\n\n" +
      "You matter. Your life has value. You don't have to face this alone.",
  },
  violence: {
    title: "Take a Breath",
    message:
      "It sounds like you're feeling really angry or hurt right now.\n\n" +
      "Delaluna can't help with situations involving violence or harm to others. " +
      "If someone is in immediate danger, please call 911.\n\n" +
      "Consider talking to someone you trust or contacting a crisis counselor at 988.",
  },
  crime: {
    title: "Not The Move",
    message:
      "Look, we get it—emotions are high and you're frustrated. " +
      "But Delaluna can't support anything illegal or destructive.\n\n" +
      "Let's find a healthier way to process what you're feeling.",
  },
};
