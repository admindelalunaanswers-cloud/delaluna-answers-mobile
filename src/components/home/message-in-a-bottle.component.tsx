import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ToastAndroid,
  Animated,
  Text,
  Alert,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { scale, verticalScale } from "@/src/utils/responsive";
import { MESSAGE_IN_A_BOTTLE_RESPONSES } from "@/src/constants/strings";

interface MessageInABottleComponentProps {
  placeholder?: string;
  onSend?: (message: string) => void;
}

// -----------------------
// 🔒 Harm Filter Utility
// -----------------------
function checkForHarm(text: string) {
  const value = text.toLowerCase();

  // Self-harm indicators - includes modern slang & coded language
  const selfHarm = [
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
    "unalive myself", // TikTok/social media censorship avoidance
    "unalive me",
    "not worth living",
    "no point in living",
    "everyone would be better without me",
    "want to disappear forever",
    "planning to end it",
  ];

  // Violence toward others - requires context to avoid false positives
  const violence = [
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

  // Criminal intent
  const crime = [
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

  if (selfHarm.some((p) => value.includes(p))) return "self-harm";
  if (violence.some((p) => value.includes(p))) return "violence";
  if (crime.some((p) => value.includes(p))) return "crime";

  return null;
}

export default function MessageInABottleComponent({
  placeholder = "Message",
  onSend,
}: MessageInABottleComponentProps) {
  const [message, setMessage] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));

  const handleSend = () => {
    if (!message.trim()) return;

    // -----------------------
    // Run Safety Check
    // -----------------------
    const harmType = checkForHarm(message);

    if (harmType) {
      let alertTitle = "";
      let alertMsg = "";

      if (harmType === "self-harm") {
        alertTitle = "We're Here For You";
        alertMsg =
          "It sounds like you're going through something really difficult right now.\n\n" +
          "Please reach out to someone who can help:\n\n" +
          "🆘 988 Suicide & Crisis Lifeline\n" +
          "📱 Text 'HELLO' to 741741 (Crisis Text Line)\n\n" +
          "You matter. Your life has value. You don't have to face this alone.";
      } else if (harmType === "violence") {
        alertTitle = "Take a Breath";
        alertMsg =
          "It sounds like you're feeling really angry or hurt right now.\n\n" +
          "Delaluna can't help with situations involving violence or harm to others. " +
          "If someone is in immediate danger, please call 911.\n\n" +
          "Consider talking to someone you trust or contacting a crisis counselor at 988.";
      } else {
        alertTitle = "Not The Move";
        alertMsg =
          "Look, we get it—emotions are high and you're frustrated. " +
          "But Delaluna can't support anything illegal or destructive.\n\n" +
          "Let's find a healthier way to process what you're feeling.";
      }

      Alert.alert(alertTitle, alertMsg, [{ text: "OK" }]);
      setMessage("");
      return; // DO NOT SEND — NO TOAST
    }

    // -----------------------
    // SAFE → SEND + TOAST
    // -----------------------
    const msg = message.trim();
    setMessage("");
    onSend?.(msg);

    // Pick a random approved message
    const randomIndex = Math.floor(Math.random() * MESSAGE_IN_A_BOTTLE_RESPONSES.length);
    const approvedMessage = MESSAGE_IN_A_BOTTLE_RESPONSES[randomIndex];

    if (Platform.OS === "android") {
      ToastAndroid.show(approvedMessage, ToastAndroid.LONG);
    } else {
      setToastMessage(approvedMessage);

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();

      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => setToastMessage(null));
      }, 5000);
    }
  };

  return (
    <>
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor="#1F2024"
          value={message}
          onChangeText={setMessage}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!message.trim()}
          style={[styles.sendButton, !message.trim() && { opacity: 0.5 }]}
        >
          <Ionicons name="send" size={scale(18)} color="#FFF" />
        </TouchableOpacity>
      </View>

      {Platform.OS === "ios" && toastMessage && (
        <Animated.View style={[styles.toast, { opacity: fadeAnim }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: verticalScale(40),
    backgroundColor: "#F8F9FE",
    borderRadius: scale(71),
    paddingLeft: scale(16),
    paddingRight: scale(6),
    gap: scale(6),
  },
  input: {
    flex: 1,
    color: "#1F2024",
    fontSize: scale(14),
    paddingVertical: verticalScale(8),
  },
  sendButton: {
    width: verticalScale(32),
    height: verticalScale(32),
    borderRadius: scale(38),
    backgroundColor: "#513877",
    alignItems: "center",
    justifyContent: "center",
  },
  toast: {
    position: "absolute",
    bottom: verticalScale(80), // Fixed to bottom of screen
    left: scale(20),
    right: scale(20),
    alignItems: "center",
    zIndex: 9999,
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(20),
    borderRadius: scale(12),
    alignSelf: "center",
  },

  toastText: {
    color: "#fff",
    fontSize: scale(14),
  },
});
