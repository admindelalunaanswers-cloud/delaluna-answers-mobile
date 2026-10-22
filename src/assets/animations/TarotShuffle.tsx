import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  ImageSourcePropType,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Text } from '@/src/components/app-text';

type CardFront = ImageSourcePropType | null;

export interface TarotShuffleProps {
  /** Image source for the card back, e.g. require('./assets/card-back.png') */
  cardBackSource: ImageSourcePropType;
  /**
   * Called right before the flip. Hook your Firebase Storage / card-picking
   * logic up here and resolve with 3 image sources.
   */
  drawCards?: () => Promise<[CardFront, CardFront, CardFront]>;
  /** Fired after the flip animation finishes. */
  onDrawComplete?: (fronts: [CardFront, CardFront, CardFront]) => void;
  cardWidth?: number;
  cardHeight?: number;
  style?: StyleProp<ViewStyle>;
}

interface CardAnim {
  translate: Animated.ValueXY;
  rotate: Animated.Value;
  flip: Animated.Value;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export default function TarotShuffle({
  cardBackSource,
  drawCards,
  onDrawComplete,
  cardWidth = 92,
  cardHeight = 140,
  style,
}: TarotShuffleProps) {
  const SLOT_OFFSET = cardWidth + 12;

  const cards = useRef<CardAnim[]>(
    [0, 1, 2].map(() => ({
      translate: new Animated.ValueXY({ x: 0, y: 0 }),
      rotate: new Animated.Value(0), // in-plane wobble, degrees
      flip: new Animated.Value(0), // 0 -> 180, the turn-over
    }))
  ).current;

  const slotX = (i: number) => (i === 0 ? -SLOT_OFFSET : i === 2 ? SLOT_OFFSET : 0);

  const [zOrder, setZOrder] = useState<number[]>([1, 2, 3]);
  const [fronts, setFronts] = useState<[CardFront, CardFront, CardFront]>([null, null, null]);
  const [drawing, setDrawing] = useState(false);
  const [label, setLabel] = useState('the spread');

  const animateXY = (
    value: Animated.ValueXY,
    toValue: { x: number; y: number },
    duration: number,
    easing: (t: number) => number = Easing.out(Easing.cubic)
  ): Promise<void> =>
    new Promise((resolve) => {
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true }).start(() =>
        resolve()
      );
    });

  const animate = (
    value: Animated.Value,
    toValue: number,
    duration: number,
    easing: (t: number) => number = Easing.out(Easing.cubic)
  ): Promise<void> =>
    new Promise((resolve) => {
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true }).start(() =>
        resolve()
      );
    });

  const randomZOrder = (): number[] => [1, 2, 3].sort(() => Math.random() - 0.5);

  const runShuffle = useCallback(async () => {
    if (drawing) return;
    setDrawing(true);
    setLabel('');
    setFronts([null, null, null]);

    // reset to the three resting slots, face down
    cards.forEach((c, i) => {
      c.translate.setValue({ x: slotX(i), y: 0 });
      c.rotate.setValue(0);
      c.flip.setValue(0);
    });
    setZOrder([1, 2, 3]);
    await wait(20);

    // phase 1: gather — outer two slide in and under the middle card
    setLabel('gathering the deck…');
    setZOrder([1, 3, 2]); // index 1 (middle) stays on top
    await Promise.all([
      animateXY(cards[0].translate, { x: 0, y: -2 }, 500),
      animateXY(cards[2].translate, { x: 0, y: 2 }, 500),
      animate(cards[0].rotate, -3, 500),
      animate(cards[2].rotate, 3, 500),
    ]);

    // phase 2: mixing — hop between a few nearby points, crossing over each other
    setLabel('shuffling…');
    const points = [
      { x: -20, y: -10, r: -10 },
      { x: 18, y: 8, r: 9 },
      { x: -3, y: 14, r: -6 },
    ];
    const shuffledPoints = () => {
      const p = [...points];
      for (let i = p.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
      }
      return p;
    };

    for (let round = 0; round < 4; round++) {
      const assign = shuffledPoints();
      setZOrder(randomZOrder());
      await Promise.all(
        cards.flatMap((c, i) => [
          animateXY(c.translate, { x: assign[i].x, y: assign[i].y }, 300),
          animate(c.rotate, assign[i].r, 300),
        ])
      );
    }

    // gather back into one squared stack
    setZOrder([1, 2, 3]);
    await Promise.all(
      cards.flatMap((c, i) => [
        animateXY(c.translate, { x: 0, y: i * 1.5 }, 280, Easing.out(Easing.back(1.1))),
        animate(c.rotate, 0, 280),
      ])
    );

    // phase 3: spread back out to the three slots, still face down
    setLabel('');
    await Promise.all(cards.map((c, i) => animateXY(c.translate, { x: slotX(i), y: 0 }, 600)));

    // phase 4: resolve the fronts (Firebase pick) and turn every card over
    let drawnFronts: [CardFront, CardFront, CardFront] = [null, null, null];
    try {
      if (drawCards) drawnFronts = await drawCards();
    } catch (e) {
      // if the pick fails, cards simply stay on their placeholder front
    }
    setFronts(drawnFronts);
    await wait(80);
    await Promise.all(
      cards.map((c) => animate(c.flip, 180, 500, Easing.inOut(Easing.cubic)))
    );

    setDrawing(false);
    onDrawComplete?.(drawnFronts);
  }, [drawing, cards, drawCards, onDrawComplete]);

  const deg = (value: Animated.Value, range = 30) =>
    value.interpolate({ inputRange: [-range, range], outputRange: [`-${range}deg`, `${range}deg`] });

  return (
    <View style={[styles.stage, style]}>
      <Text style={styles.label}>{label}</Text>

      <View
        style={[
          styles.cardsWrap,
          { width: SLOT_OFFSET * 2 + cardWidth, height: cardHeight + 24 },
        ]}
      >
        {cards.map((c, i) => {
          const flipDeg = c.flip.interpolate({
            inputRange: [0, 180],
            outputRange: ['0deg', '180deg'],
          });

          return (
            <Animated.View
              key={i}
              style={[
                styles.card,
                {
                  width: cardWidth,
                  height: cardHeight,
                  zIndex: zOrder[i],
                  transform: [
                    { translateX: c.translate.x },
                    { translateY: c.translate.y },
                    { rotate: deg(c.rotate, 15) },
                  ],
                },
              ]}
            >
              {/* this inner view is the thing that actually flips, like .card-inner */}
              <Animated.View
                style={[
                  styles.cardInner,
                  { transform: [{ perspective: 800 }, { rotateY: flipDeg }] },
                ]}
              >
                {/* back face */}
                <View style={[styles.face, styles.backfaceHidden]}>
                  <Image source={cardBackSource} style={styles.faceImage} resizeMode="cover" />
                </View>

                {/* front face — baked-in 180deg so it only appears once the parent has rotated past halfway */}
                <View
                  style={[
                    styles.face,
                    styles.backfaceHidden,
                    { transform: [{ rotateY: '180deg' }] },
                  ]}
                >
                  {fronts[i] ? (
                    <Image source={fronts[i] as ImageSourcePropType} style={styles.faceImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.faceImage, styles.facePlaceholder]} />
                  )}
                </View>
              </Animated.View>
            </Animated.View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.button, drawing && styles.buttonDisabled]}
        onPress={runShuffle}
        disabled={drawing}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>Draw</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', paddingVertical: 24 },
  label: { color: '#e6cd8f', fontStyle: 'italic', fontSize: 13, marginBottom: 16, height: 16 },
  cardsWrap: { alignItems: 'center', justifyContent: 'center' },
  card: { position: 'absolute' },
  cardInner: { flex: 1 },
  face: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#c9a24b',
  },
  backfaceHidden: { backfaceVisibility: 'hidden' },
  faceImage: { width: '100%', height: '100%' },
  facePlaceholder: { backgroundColor: '#2c1c48' },
  button: {
    marginTop: 20,
    borderWidth: 1.5,
    borderColor: '#c9a24b',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#e6cd8f', fontSize: 15, letterSpacing: 0.5 },
});
