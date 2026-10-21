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
import { checkForHarm, HARM_ALERTS } from "@/src/utils/harm-filter";

interface MessageInABottleComponentProps {
  placeholder?: string;
  onSend?: (message: string) => void;
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
      const { title, message: alertMsg } = HARM_ALERTS[harmType];
      Alert.alert(title, alertMsg, [{ text: "OK" }]);
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
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor="#1F2024"
          value={message}
          onChangeText={setMessage}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!message.trim()}
          style={[styles.sendButton, !message.trim() && { opacity: 0.5 }]}
          // Icon-only — it had no name, so VoiceOver read nothing useful
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !message.trim() }}
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
        {/* One element to a screen reader: the reply, as a button that closes it.
            "Tap anywhere" means nothing without sight of the screen. */}
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setOverlayVisible(false)}
          accessibilityRole="button"
          accessibilityLabel={overlayMessage ?? ""}
          accessibilityHint="Closes the message"
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
    color: "rgba(180, 150, 220, 0.75)", // was 0.4
    fontSize: moderateScale(11),
    textAlign: "center",
    letterSpacing: 0.5,
  },
});
