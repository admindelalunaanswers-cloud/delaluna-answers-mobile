import React, { useEffect, useState } from "react";

import {
  Image,
  ImageSourcePropType,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import { Ionicons } from "@expo/vector-icons";

import { CARD_LINKS } from "@/src/constants/links";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { isOracleCard, tarotCardImageUrl } from "@/src/utils/tarot-image";

const FLIP_DURATION = 650;
const STAGGER_MS = 140;

interface TarotCardProps {
  cardNumber: number[];
  reversed?: boolean[];
  firstView?: boolean;
  onReveal?: () => void;
}

interface FlipCardProps {
  backSource: ImageSourcePropType;
  frontUri: string;
  reversed: boolean;
  shouldReveal: boolean;
  animate: boolean;
  delay: number;
}

function FlipCard({
  backSource,
  frontUri,
  reversed,
  shouldReveal,
  animate,
  delay,
}: FlipCardProps) {
  const progress = useSharedValue(shouldReveal ? 1 : 0);

  useEffect(() => {
    if (shouldReveal) {
      if (animate) {
        progress.value = withDelay(
          delay,
          withTiming(1, {
            duration: FLIP_DURATION,
            easing: Easing.out(Easing.cubic),
          }),
        );
      } else {
        progress.value = 1;
      }
    } else {
      progress.value = 0;
    }
  }, [shouldReveal, animate, delay, progress]);

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(progress.value, [0, 1], [0, 180])}deg` },
    ],
  }));

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { rotateY: `${interpolate(progress.value, [0, 1], [180, 360])}deg` },
      { rotateZ: reversed ? "180deg" : "0deg" },
    ],
  }));

  return (
    <View style={styles.cardSlot}>
      <Animated.View style={[styles.face, backStyle]}>
        <Image source={backSource} style={styles.cardImage} />
      </Animated.View>
      <Animated.View style={[styles.face, frontStyle]}>
        <Image source={{ uri: frontUri }} style={styles.cardImage} />
      </Animated.View>
    </View>
  );
}

export default function TarotCardImageFrame({
  cardNumber,
  reversed = [],
  firstView = false,
  onReveal,
}: TarotCardProps) {
  const [revealed, setRevealed] = useState(firstView);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    setRevealed(firstView);
    setAnimate(false);
  }, [firstView]);

  const handleOracleLinkPress = () => {
    Linking.openURL(CARD_LINKS.amazon.ORACLE_CARDS);
  };

  const handleTarotLinkPress = () => {
    Linking.openURL(CARD_LINKS.amazon.TAROT_CARDS);
  };

  const handleRevealCards = () => {
    setAnimate(true);
    setRevealed(true);
    onReveal?.();
  };

  const determineCardBack = (num: number): ImageSourcePropType =>
    isOracleCard(num)
      ? require("@/src/assets/card_backs/ORACLE_CARD_BACK.png")
      : require("@/src/assets/card_backs/TAROT_CARD_BACK.png");

  return (
    <View style={styles.container}>
      <View style={styles.frame}>
        {cardNumber.map((num, idx) => (
          <FlipCard
            key={`${num}-${idx}`}
            backSource={determineCardBack(num)}
            frontUri={tarotCardImageUrl(num)}
            reversed={!!reversed[idx]}
            shouldReveal={revealed}
            animate={animate}
            delay={idx * STAGGER_MS}
          />
        ))}
      </View>

      {!revealed && (
        <TouchableOpacity style={styles.revealButton} onPress={handleRevealCards}>
          <Text style={styles.revealButtonText}>Tap to Reveal Cards</Text>
        </TouchableOpacity>
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
  cardSlot: {
    width: scale(120),
    height: scale(190),
  },
  face: {
    position: "absolute",
    width: "100%",
    height: "100%",
    backfaceVisibility: "hidden",
  },
  cardImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
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
