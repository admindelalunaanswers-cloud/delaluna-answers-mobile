import React, { useEffect, useRef } from "react";

import { Animated, View, StyleSheet, ViewStyle } from "react-native";
import { Text } from "@/src/components/app-text";


import { useReducedMotion } from "@/src/context/accessibility-context";
import { DrawnTarotCard } from "@/src/types/tarot-cards.type";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { renderRichText } from "@/src/utils/rich-text";

import DelalunaContainer from "../shared/delaluna-container.component";
import MessageInABottleComponent from "./message-in-a-bottle.component";
import MoonView from "./moon-view.component";
import TarotCardImageFrame from "./tarot-card-image-view.component";
import { BulletList } from "../typography/bullet-list-text";

export type SectionName =
  | "quote"
  | "advice"
  | "dos"
  | "donts"
  | "affirmation"
  | "tarot"
  | "message"
  | "moon"
  | "retrograde"
  | "newLove"
  | "returns"
  | "warning"
  | "luckyNumbers";


// ─── Skeleton shimmer ─────────────────────────────────────────────────────────

function SkeletonLine({ width = '100%', height = 14 }: { width?: number | string; height?: number }) {
  const opacity = useRef(new Animated.Value(0.25)).current;
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(0.4); // a steady placeholder, midway through the pulse
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 850, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.25, duration: 850, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, reduceMotion]);

  // Wrap in a plain View so width (string | number) doesn't conflict with
  // Animated.View's narrower DimensionValue requirement.
  return (
    <View style={{ width: width as any, height }}>
      <Animated.View
        style={{
          flex: 1,
          borderRadius: 6,
          backgroundColor: 'rgba(111, 255, 233, 0.18)',
          opacity,
        }}
      />
    </View>
  );
}

// Skeletons are blank shapes to a screen reader, which would skip the section
// entirely and leave the user unsure whether anything is coming.
const LOADING_A11Y = { accessible: true, accessibilityLabel: 'Loading' } as const;

function SkeletonTextBlock() {
  return (
    <View style={{ width: '100%', gap: 10, paddingVertical: 4 }} {...LOADING_A11Y}>
      <SkeletonLine width="92%" height={13} />
      <SkeletonLine width="100%" height={13} />
      <SkeletonLine width="76%" height={13} />
    </View>
  );
}

function SkeletonListBlock() {
  return (
    <View style={{ width: '100%', gap: 10, paddingVertical: 4 }} {...LOADING_A11Y}>
      <SkeletonLine width="80%" height={13} />
      <SkeletonLine width="88%" height={13} />
      <SkeletonLine width="72%" height={13} />
    </View>
  );
}

function SkeletonHorizontalBlock() {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 4, justifyContent: 'center', width: '100%' }} {...LOADING_A11Y}>
      <SkeletonLine width={72} height={28} />
      <SkeletonLine width={72} height={28} />
      <SkeletonLine width={72} height={28} />
    </View>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface HomeTextBoxProps {
  sectionName: SectionName;
  content?: string | string[];
  contentTwo?: string;
  style?: ViewStyle;
  cards?: DrawnTarotCard[];
  reversed?: boolean;
  firstView?: boolean;
  onReveal?: () => void;
  moonData?: { phaseName?: string; illumination?: number; moonSign?: string } | null;
  /** Show skeleton shimmer while horoscope is being generated */
  generating?: boolean;
}

export default function HomeTextBox({
  sectionName,
  content = "",
  contentTwo = "",
  style,
  cards,
  firstView,
  onReveal,
  moonData,
  generating = false,
}: HomeTextBoxProps) {

  const isBottleSection = sectionName === "message";
  const isTarotSection = sectionName === "tarot";
  const isListStyleSection = Array.isArray(content);
  const isHoriListSection = sectionName === "newLove" || sectionName === "luckyNumbers" || sectionName === "returns" || sectionName === "retrograde";
  const isMoonSection = sectionName === "moon";

  // True when we have no real content yet and are actively waiting for it
  const isEmpty = isListStyleSection ? (content as string[]).length === 0 : !content;
  const showSkeleton = generating && isEmpty;

  const renderTextContent = () => {
    if (!content || Array.isArray(content)) return null;
    return <Text style={styles.text}>{renderRichText(content)}</Text>;
  };

  const renderListContent = () => {
    if (!Array.isArray(content) || content.length === 0) return null;
    return <BulletList items={content} />;
  };

  return (
    <View style={[styles.container, style]}>
      {isTarotSection ? (
        <>
          {/* TAROT IMAGE */}
          {cards && cards.length > 0 ? (
            <TarotCardImageFrame
              cardNumber={cards.map(c => c.id)}
              reversed={cards.map(c => c.reversed)}
              names={cards.map(c => c.name)}
              firstView={firstView}
              onReveal={onReveal}
            />
          ) : (
            <Text style={{ color: "#fff" }}>Loading card...</Text>
          )}

          {/* TAROT MEANING BOX */}
          <DelalunaContainer style={styles.box}>
            {showSkeleton ? <SkeletonTextBlock /> : isListStyleSection ? renderListContent() : renderTextContent()}
          </DelalunaContainer>
        </>
      ) : isBottleSection ? (
        <MessageInABottleComponent placeholder="Message to the universe" />
      ) : isHoriListSection ? (
        showSkeleton ? (
          <DelalunaContainer>
            <SkeletonHorizontalBlock />
          </DelalunaContainer>
        ) : (
          <View style={styles.newLoveRow}>
            {Array.isArray(content) ? content.map((item, index) => (
              <React.Fragment key={index}>
                <Text style={styles.newLoveText}>{item}</Text>
                {/* Decorative — otherwise read aloud as "bullet" between every number */}
                {index < content.length - 1 && (
                  <Text
                    style={styles.separator}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  >
                    •
                  </Text>
                )}
              </React.Fragment>
            )) : <Text style={styles.newLoveText}>{content}</Text>}
          </View>
        )
      ) : isListStyleSection ? (
        <DelalunaContainer>
          {showSkeleton ? <SkeletonListBlock /> : renderListContent()}
        </DelalunaContainer>
      ) : isMoonSection ? (
        showSkeleton ? (
          <DelalunaContainer>
            <SkeletonTextBlock />
          </DelalunaContainer>
        ) : (
          <MoonView
            phaseName={moonData?.phaseName}
            illumination={moonData?.illumination}
            sign={moonData?.moonSign}
            horoscopeMoon={contentTwo || `The ${moonData?.moonSign} Moon is currently in its ${moonData?.phaseName} phase with an illumination of ${moonData?.illumination}%.`}
          />
        )
      ) : (
        <DelalunaContainer>
          {showSkeleton ? <SkeletonTextBlock /> : renderTextContent()}
        </DelalunaContainer>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    display: "flex",
    width: "100%",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: scale(10),
    marginBottom: verticalScale(25),
  },
  box: {
    width: "100%",
    minHeight: verticalScale(75),
    borderWidth: 1,
    borderColor: "rgba(142, 68, 173, 0.4)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(5),
  },
  text: {
    fontSize: moderateScale(14),
    color: "#FFFFFF",
    textAlign: "center",
  },
  newLoveRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    width: "100%",
    padding: scale(20),
  },
  newLoveText: {
    fontSize: moderateScale(20),
    fontWeight: 'bold',
    color: "#FFFFFF",
    alignItems: "center",
  },
  separator: {
    fontSize: moderateScale(16),
    color: "#FFFFFF",
    marginHorizontal: scale(6),
    alignSelf: "center",
  },
});