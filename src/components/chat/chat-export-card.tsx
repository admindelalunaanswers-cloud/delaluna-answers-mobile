/**
 * The "Image" export: the latest reading on a story-sized card (9:16). It is
 * laid out at 360×640 and captured at 3× by react-native-view-shot, so it comes
 * out at 1080×1920 whatever the device.
 *
 * Unlike the PDF this keeps the app's dark look — it is made to be posted, not
 * printed.
 */

import React, { forwardRef } from 'react';
// react-native's Text on purpose: this card is captured as a fixed-size image,
// so neither the device's nor the in-app text size may change it.
// eslint-disable-next-line no-restricted-imports
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { C, R, S } from '@/src/constants/theme';
import {
  chatModeLabel,
  excerptForCard,
  type ChatExportTurn,
} from '@/src/utils/chat-export-format';

export const CARD_WIDTH = 360;
export const CARD_HEIGHT = 640;

interface Props {
  turn: ChatExportTurn;
  includeQuestion: boolean;
  birthDetails?: string | null;
}

const ChatExportCard = forwardRef<View, Props>(function ChatExportCard(
  { turn, includeQuestion, birthDetails },
  ref,
) {
  return (
    // collapsable={false}: Android drops views it thinks are layout-only, and
    // view-shot needs a real native view to capture.
    <View ref={ref} collapsable={false} style={styles.card}>
      <LinearGradient
        colors={[C.void, '#1a0b33', C.nebula]}
        style={StyleSheet.absoluteFill}
      />
      <Image
        source={require('@/src/assets/dlla-branded/delaluna_logo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.kicker} allowFontScaling={false}>
        {chatModeLabel([turn]).toUpperCase()} READING
      </Text>

      {includeQuestion ? (
        <Text style={styles.question} numberOfLines={3} allowFontScaling={false}>
          “{turn.question}”
        </Text>
      ) : null}

      {turn.cards?.length ? (
        <Text style={styles.cards} numberOfLines={2} allowFontScaling={false}>
          {turn.cards.join(' · ')}
        </Text>
      ) : null}

      <View style={styles.answerBox}>
        <Text style={styles.answer} allowFontScaling={false}>
          {excerptForCard(turn.answer, includeQuestion ? 460 : 560)}
        </Text>
      </View>

      <View style={styles.footer}>
        {birthDetails ? (
          <Text style={styles.birth} numberOfLines={1} allowFontScaling={false}>
            {birthDetails}
          </Text>
        ) : null}
        <Text style={styles.brand} allowFontScaling={false}>
          Delaluna Answers
        </Text>
      </View>
    </View>
  );
});

export default ChatExportCard;

// Font scaling is off throughout on purpose: this is a picture with a fixed
// canvas, never read on screen, and scaled text would overflow the frame.
const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    paddingHorizontal: S.lg,
    paddingTop: S.xl,
    paddingBottom: S.lg,
    overflow: 'hidden',
    backgroundColor: C.void,
  },
  logo: {
    width: 150,
    height: 58,
    alignSelf: 'center',
    marginBottom: S.md,
  },
  kicker: {
    color: C.turquoise,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textAlign: 'center',
    marginBottom: S.md,
  },
  question: {
    color: C.white,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: S.sm,
  },
  cards: {
    color: C.purpleLight,
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: S.sm,
  },
  answerBox: {
    flex: 1,
    marginTop: S.sm,
    padding: S.md,
    borderRadius: R.lg,
    backgroundColor: C.white + '12',
    borderWidth: 1,
    borderColor: C.white + '1A',
    overflow: 'hidden',
  },
  answer: {
    color: C.white,
    fontSize: 14,
    lineHeight: 21,
  },
  footer: {
    alignItems: 'center',
    gap: 2,
    marginTop: S.md,
  },
  birth: {
    color: C.muted,
    fontSize: 11,
  },
  brand: {
    color: C.muted,
    fontSize: 11,
    letterSpacing: 1.2,
  },
});
