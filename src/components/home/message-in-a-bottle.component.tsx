import React, { useState } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
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
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayMessage, setOverlayMessage] = useState<string | null>(null);

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
      return;
    }

    // -----------------------
    // SAFE → SEND + OVERLAY
    // -----------------------
    const msg = message.trim();
    setMessage("");
    onSend?.(msg);

    const randomIndex = Math.floor(Math.random() * MESSAGE_IN_A_BOTTLE_RESPONSES.length);
    setOverlayMessage(MESSAGE_IN_A_BOTTLE_RESPONSES[randomIndex]);
    setOverlayVisible(true);
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

      <Modal
        visible={overlayVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOverlayVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOverlayVisible(false)}
        >
          <View style={styles.card}>
            <Text style={styles.messageText}>{overlayMessage}</Text>
            <Text style={styles.dismissHint}>tap anywhere to close</Text>
          </View>
        </TouchableOpacity>
      </Modal>
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
  overlay: {
    flex: 1,
    backgroundColor: "rgba(8, 2, 18, 0.88)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: scale(36),
  },
  card: {
    backgroundColor: "rgba(30, 10, 50, 0.96)",
    borderWidth: 1,
    borderColor: "rgba(142, 68, 173, 0.5)",
    borderRadius: scale(20),
    paddingVertical: verticalScale(40),
    paddingHorizontal: scale(28),
    alignItems: "center",
    width: "100%",
    gap: verticalScale(28),
  },
  messageText: {
    color: "#E8D5FF",
    fontSize: moderateScale(20),
    textAlign: "center",
    lineHeight: moderateScale(30),
    fontStyle: "italic",
  },
  dismissHint: {
    color: "rgba(180, 150, 220, 0.4)",
    fontSize: moderateScale(11),
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
