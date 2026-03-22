import React, { useState } from "react";

import { Image, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { CARD_LINKS } from "@/src/constants/links";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

interface TarotCardProps {
  cardNumber: number[];
  reversed?: boolean[];
  firstView?: boolean;
  onReveal?: () => void;
}

export default function TarotCardImageFrame({
  cardNumber,
  reversed = [],
  firstView = false,
  onReveal,
}: TarotCardProps) {
  const [revealed, setRevealed] = useState(firstView);

  // Sync local state when the prop changes (e.g. switching dates)
  React.useEffect(() => {
    setRevealed(firstView);
  }, [firstView]);

  const getTarotCardImageUrl = (num: number) =>
    `https://firebasestorage.googleapis.com/v0/b/delaluna-answers.firebasestorage.app/o/tarot-card-front%2F${num}.png?alt=media`;

  // Prefetch card front images while showing backs so reveal is instant
  React.useEffect(() => {
    if (!revealed) {
      cardNumber.forEach((num) => {
        Image.prefetch(getTarotCardImageUrl(num));
      });
    }
  }, [cardNumber, revealed]);

  const handleOracleLinkPress = () => {
    Linking.openURL(CARD_LINKS.amazon.ORACLE_CARDS);
  };

  const handleTarotLinkPress = () => {
    Linking.openURL(CARD_LINKS.amazon.TAROT_CARDS);
  };

  const handleRevealCards = () => {
    setRevealed(true);
    onReveal?.();
  };

  const determineCardBack = (cardNumber: number) => {
    if (cardNumber <= 53) {
      return require('@/src/assets/card_backs/ORACLE_CARD_BACK.png');
    } else if (cardNumber >= 54) {
      return require('@/src/assets/card_backs/TAROT_CARD_BACK.png');
    } else {
      return "Unknown Card";
    }
  };

  return (
    <View style={styles.container}>
      {revealed ? (
        <View style={styles.frame}>
          {cardNumber.map((num, idx) => (
            <Image
              key={`${num}-${idx}`}
              style={[
                styles.image,
                reversed[idx] && { transform: [{ rotate: "180deg" }] },
              ]}
              source={{ uri: getTarotCardImageUrl(num) }}
            />
          ))}
        </View>
      ) : (
        <>
          <View style={styles.frame}>
            {cardNumber.map((num, idx) => (
              <Image
                key={`${num}-${idx}`}
                style={styles.image}
                source={determineCardBack(num)}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.revealButton} onPress={handleRevealCards}>
            <Text style={styles.revealButtonText}>
              Tap to Reveal Cards
            </Text>
          </TouchableOpacity>
        </>
      )}

      <View style={styles.linksWrapper}>
        <TouchableOpacity style={styles.linkContainer} onPress={handleOracleLinkPress}>
          <Ionicons name="cart-outline" size={14} color="#8eeceaff" />
          <Text style={styles.linkText}>Oracle Cards</Text>
          <Ionicons name="open-outline" size={12} color="rgba(255,255,255,0.91)" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkContainer} onPress={handleTarotLinkPress}>
          <Ionicons name="cart-outline" size={14} color="#8eeceaff" />
          <Text style={styles.linkText}>Tarot Cards</Text>
          <Ionicons name="open-outline" size={12} color="rgba(255, 255, 255, 0.91)" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
  },
  frame: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: scale(2),
    width: "100%",
  },
  image: {
    width: scale(120),
    height: scale(190),
    resizeMode: "contain",
    justifyContent: "center",
    alignItems: "center",
  },
  linksWrapper: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: scale(16),
    marginTop: verticalScale(12),
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    paddingVertical: verticalScale(6),
    paddingHorizontal: scale(12),
  },
  linkText: {
    fontSize: moderateScale(12),
    color: "#8eeceaff",
    fontWeight: "500",
  },
  revealButton: {
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    backgroundColor: "rgb(12, 228, 224)",
    borderRadius: scale(4),
  },
  revealButtonText: {
    color: "#fff",
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
});
