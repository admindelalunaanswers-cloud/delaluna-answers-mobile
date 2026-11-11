/**
 * A scripted example exchange for the tour's chat steps.
 *
 * Nothing here touches the chat: no Firestore write, no `sendChatMessage`, so
 * it can never be billed, count against the daily questions, land in the
 * replayed history or the chat archive. The words and cards are fixed in
 * `src/constants/tour.ts`.
 *
 * The tarot example plays a short shuffle and flip once when it mounts — a
 * small cousin of the chat's `ChatTarotDraw`, which is ~4s with a Draw button
 * and shop links. Reduced motion shows the cards face up straight away.
 */

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';

import { Text } from '@/src/components/app-text';
import type { TourExample } from '@/src/constants/tour';
import { C, R, S } from '@/src/constants/theme';
import { isOracleCard, tarotCardImageUrl } from '@/src/utils/tarot-image';

const CARD_W = 58;
const CARD_H = Math.round(CARD_W * (190 / 120)); // the app's card aspect
const CARD_GAP = 8;

const ORACLE_BACK = require('@/src/assets/card_backs/ORACLE_CARD_BACK.png');
const TAROT_BACK = require('@/src/assets/card_backs/TAROT_CARD_BACK.png');

function ExampleSpread({ cards, reduceMotion }: { cards: NonNullable<TourExample['cards']>; reduceMotion: boolean }) {
  const count = cards.length;
  const [anims] = useState(() =>
    cards.map(() => ({ x: new Animated.Value(0), turn: new Animated.Value(reduceMotion ? 1 : 0) })),
  );
  // Which face to draw. Swapped at the edge-on midpoint of each flip.
  const [faceUp, setFaceUp] = useState<boolean[]>(() => cards.map(() => reduceMotion));
  const ran = useRef(false);

  useEffect(() => {
    // Best effort: the faces come from Storage, so warm them while the shuffle
    // plays. A failure (or a platform that returns nothing) just loads on flip.
    cards.forEach((c) => {
      Promise.resolve()
        .then(() => Image.prefetch(tarotCardImageUrl(c.id)))
        .catch(() => {});
    });
  }, [cards]);

  useEffect(() => {
    if (reduceMotion || ran.current) return;
    ran.current = true;

    const step = CARD_W + CARD_GAP;
    const centre = (i: number) => ((count - 1) / 2 - i) * step;
    const timing = (v: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(v, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true });

    // Gather → two quick passes → spread → flip left to right.
    const shuffle = Animated.sequence([
      Animated.parallel(anims.map((a, i) => timing(a.x, centre(i), 220))),
      Animated.parallel(anims.map((a, i) => timing(a.x, centre(i) + (i % 2 ? 14 : -14), 130))),
      Animated.parallel(anims.map((a, i) => timing(a.x, centre(i) + (i % 2 ? -14 : 14), 130))),
      Animated.parallel(anims.map((a, i) => timing(a.x, centre(i), 110))),
      Animated.parallel(anims.map((a) => timing(a.x, 0, 240))),
    ]);
    const flips = Animated.stagger(
      140,
      anims.map((a, i) =>
        Animated.sequence([
          // To edge-on (the listener swaps the face there), then open.
          timing(a.turn, 0.5, 130),
          timing(a.turn, 1, 130),
        ]),
      ),
    );

    const listeners = anims.map((a, i) =>
      a.turn.addListener(({ value }) => {
        if (value >= 0.5) setFaceUp((f) => (f[i] ? f : f.map((v, j) => (j === i ? true : v))));
      }),
    );
    const run = Animated.sequence([Animated.delay(250), shuffle, Animated.delay(120), flips]);
    run.start();
    return () => {
      run.stop();
      anims.forEach((a, i) => a.turn.removeListener(listeners[i]));
    };
  }, [anims, count, reduceMotion]);

  return (
    <View style={styles.spread}>
      {cards.map((card, i) => {
        // 0 → 0.5 squeezes the back to edge-on, 0.5 → 1 opens the face.
        const scaleX = anims[i].turn.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
        const label = card.reversed ? `${card.name}, reversed` : card.name;
        return (
          <Animated.View
            key={card.id}
            accessible
            accessibilityRole="image"
            accessibilityLabel={label}
            style={[styles.cardSlot, { zIndex: count - i, transform: [{ translateX: anims[i].x }, { scaleX }] }]}
          >
            <Image
              source={
                faceUp[i]
                  ? { uri: tarotCardImageUrl(card.id) }
                  : isOracleCard(card.id)
                    ? ORACLE_BACK
                    : TAROT_BACK
              }
              style={[styles.cardImage, faceUp[i] && card.reversed && styles.reversed]}
              resizeMode="cover"
            />
          </Animated.View>
        );
      })}
    </View>
  );
}

export default function TourExampleChat({ example, reduceMotion }: { example: TourExample; reduceMotion: boolean }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.tag} importantForAccessibility="no" accessibilityElementsHidden>
        EXAMPLE
      </Text>
      <View style={styles.userRow}>
        <View style={styles.userBubble} accessible accessibilityLabel={`Example question: ${example.question}`}>
          <Text style={styles.userText}>{example.question}</Text>
        </View>
      </View>
      {example.cards?.length ? <ExampleSpread cards={example.cards} reduceMotion={reduceMotion} /> : null}
      <View style={styles.aiBubble} accessible accessibilityLabel={`Example answer: ${example.answer}`}>
        <Text style={styles.aiText}>{example.answer}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: S.sm,
    paddingTop: S.xs,
  },
  tag: {
    fontSize: 11,
    letterSpacing: 1.2,
    color: C.muted,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  // Same shapes and colours as the real chat bubbles (app/(main)/chat.tsx).
  userBubble: {
    backgroundColor: C.purpleDim,
    borderRadius: R.lg,
    borderBottomRightRadius: R.sm,
    paddingHorizontal: S.md - 4,
    paddingVertical: S.sm - 2,
    maxWidth: '85%',
  },
  userText: {
    color: C.white,
    fontSize: 13,
    lineHeight: 19,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: C.white + '12',
    borderRadius: R.lg,
    borderBottomLeftRadius: R.sm,
    paddingHorizontal: S.md - 4,
    paddingVertical: S.sm - 2,
    maxWidth: '92%',
  },
  aiText: {
    color: C.white,
    fontSize: 13,
    lineHeight: 19,
  },
  spread: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: CARD_GAP,
    paddingVertical: S.xs,
  },
  cardSlot: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: C.purpleDim,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  reversed: {
    transform: [{ rotate: '180deg' }],
  },
});
