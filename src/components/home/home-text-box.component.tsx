import React from "react";

import { View, Text, StyleSheet, ViewStyle } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { DrawnTarotCard } from "@/src/types/tarot-cards.type";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

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

// Icon mapping for each section
const SECTION_ICONS: Record<SectionName, { name: keyof typeof Ionicons.glyphMap; color?: string }> = {
  quote: { name: "chatbubble-outline", color: "#5BC0BE" },
  advice: { name: "bulb-outline", color: "#F4A261" },
  dos: { name: "checkmark-circle-outline", color: "#2A9D8F" },
  donts: { name: "close-circle-outline", color: "#E76F51" },
  affirmation: { name: "sparkles-outline", color: "#E63946" },
  tarot: { name: "sparkles-outline", color: "#9D4EDD" },
  message: { name: "send-outline", color: "#06FFA5" },
  moon: { name: "moon-outline", color: "#F1FAEE" },
  retrograde: { name: "planet-outline", color: "#8E44AD" },
  newLove: { name: "heart-outline", color: "#FF69B4" },
  returns: { name: "repeat-outline", color: "#FCA311" },
  warning: { name: "warning-outline", color: "#FF9F40" },
  luckyNumbers: { name: "dice-outline", color: "#FFD60A" },
};

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
}: HomeTextBoxProps) {

  const isBottleSection = sectionName === "message";
  const isTarotSection = sectionName === "tarot";
  const isListStyleSection = Array.isArray(content);
  const isHoriListSection = sectionName === "newLove" || sectionName === "luckyNumbers" || sectionName === "returns" || sectionName == "retrograde";
  const isMoonSection = sectionName === "moon";

  // Get icon config for this section
  const iconConfig = SECTION_ICONS[sectionName];

  const renderTextContent = () => {
    if (!content || Array.isArray(content)) return null;
    return <Text style={styles.text}>{content}</Text>;
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
              firstView={firstView}
              onReveal={onReveal}
            />
          ) : (
            <Text style={{ color: "#fff" }}>Loading card...</Text>
          )}

          {/* TAROT MEANING BOX */}
          <DelalunaContainer style={styles.box}>
            {isListStyleSection ? renderListContent() : renderTextContent()}
          </DelalunaContainer>
        </>
      ) : isBottleSection ? (
        <MessageInABottleComponent placeholder="Message to the universe" />
      ) : isHoriListSection ? (
        <View style={styles.newLoveRow}>
          {Array.isArray(content) ? content.map((item, index) => (
            <React.Fragment key={index}>
              <Text style={styles.newLoveText}>{item}</Text>
              {index < content.length - 1 && <Text style={styles.separator}>•</Text>}
            </React.Fragment>
          )) : <Text style={styles.newLoveText}>{content}</Text>}
        </View>
      ) : isListStyleSection ? (
        <DelalunaContainer>
          {renderListContent()}
        </DelalunaContainer>
      ) : isMoonSection ? (
        <MoonView
          phaseName={moonData?.phaseName}
          illumination={moonData?.illumination}
          sign={moonData?.moonSign}
          horoscopeMoon={contentTwo || undefined}
        />
      ) : (
        <DelalunaContainer>
          {renderTextContent()}
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
    lineHeight: moderateScale(25),
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