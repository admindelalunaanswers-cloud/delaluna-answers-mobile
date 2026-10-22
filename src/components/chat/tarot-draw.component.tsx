/**
 * The tarot draw shown on a chat question.
 *
 * Deliberately a visual twin of the daily spread on the home screen
 * (`src/components/home/tarot-card-image-view.component.tsx`) — same slot size,
 * same card art, same shop links — with two differences the chat flow calls
 * for: the button reads **Draw** rather than "Tap to Reveal Cards", and the
 * reveal is the shuffle choreography from `src/assets/animations/TarotShuffle`
 * (gather → mix → spread → flip) instead of a straight flip.
 *
 * The choreography is written against RN's `Animated` rather than Reanimated
 * because it is a promise-sequenced storyboard; the home screen's single flip
 * has no such sequencing and stays on Reanimated.
 *
 * Cards animate relative to their own slot, so the row keeps the home screen's
 * plain flex layout and the same code covers a one-card chat pull and a
 * three-card spread.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  AccessibilityInfo,
  Animated,
  Easing,
  Image,
  ImageSourcePropType,
  Linking,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Text } from "@/src/components/app-text";

import { Ionicons } from "@expo/vector-icons";

import { CARD_LINKS } from "@/src/constants/links";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { isOracleCard, tarotCardImageUrl, tarotCardLabel } from "@/src/utils/tarot-image";

// The home screen's slot size. The transcript column is narrower than the home
// screen, so three of these can overflow it — the cards shrink to fit and keep
// this aspect ratio, matching home exactly wherever there is room for it.
const CARD_WIDTH = scale(120);
const CARD_HEIGHT = scale(190);
const CARD_ASPECT = CARD_HEIGHT / CARD_WIDTH;
const SLOT_GAP = scale(2);

const FLIP_DURATION = 500;
/** Per-card delay on the turn-over, so the spread reads left to right. */
const FLIP_STAGGER_MS = 140;
const MIX_ROUNDS = 4;

/**
 * How long the flip will wait on the card art.
 *
 * The fronts come from Firebase Storage, so turning a card over the instant the
 * shuffle ends showed three empty faces filling in one after another as each
 * download landed. They are prefetched from mount — the shuffle alone buys
 * around four seconds — and the flip waits on that, capped here so a slow
 * network delays the reveal rather than stalling it.
 */
const FRONT_PREFETCH_WAIT_MS = 2_500;

/** Fade for the spread's first appearance, once every back has decoded. */
const INTRO_FADE_MS = 220;

/** Nearby points the stack hops between while mixing, in slot-relative px. */
const MIX_POINTS = [
  { x: -20, y: -10, r: -10 },
  { x: 18, y: 8, r: 9 },
  { x: -3, y: 14, r: -6 },
];

interface ChatTarotDrawProps {
  /** Card ids, exactly as the home screen takes them (`cards.map(c => c.id)`). */
  cardNumber: number[];
  reversed?: boolean[];
  /** Card names, parallel to cardNumber — spoken by screen readers, since the faces are images. */
  names?: string[];
  /**
   * Already drawn on a previous visit. Like the daily spread, cards that have
   * been turned over stay turned over — they come back face up, no button, no
   * animation. Arrives late (it is read from storage), so it is also handled
   * as a change, not only as an initial value.
   */
  alreadyRevealed?: boolean;
  /** Fired once the cards have landed face up. */
  onDrawComplete?: () => void;
}

interface CardAnim {
  translate: Animated.ValueXY;
  rotate: Animated.Value;
  flip: Animated.Value;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const determineCardBack = (num: number): ImageSourcePropType =>
  isOracleCard(num)
    ? require("@/src/assets/card_backs/ORACLE_CARD_BACK.png")
    : require("@/src/assets/card_backs/TAROT_CARD_BACK.png");

// Stable defaults: runDraw's useCallback depends on both, and a fresh `[]`
// each render would rebuild it every time.
const NO_REVERSED: boolean[] = [];
const NO_NAMES: string[] = [];

export default function ChatTarotDraw({
  cardNumber,
  reversed = NO_REVERSED,
  names = NO_NAMES,
  alreadyRevealed = false,
  onDrawComplete,
}: ChatTarotDrawProps) {
  const count = cardNumber.length;

  const cards = useRef<CardAnim[]>(
    Array.from({ length: count }, () => ({
      translate: new Animated.ValueXY({ x: 0, y: 0 }),
      rotate: new Animated.Value(0),
      flip: new Animated.Value(alreadyRevealed ? 1 : 0),
    })),
  ).current;

  const [zOrder, setZOrder] = useState<number[]>(() =>
    Array.from({ length: count }, (_, i) => i),
  );
  const [drawing, setDrawing] = useState(false);
  const [revealed, setRevealed] = useState(alreadyRevealed);
  const [frameWidth, setFrameWidth] = useState(0);
  const [backsLoaded, setBacksLoaded] = useState(0);

  // The backs decode independently, so the spread used to assemble itself card
  // by card — and the row jumps once when onLayout reports the real width and
  // the cards resize to fit. Hold the whole thing transparent until every back
  // is decoded at a known width, then fade it in as one piece. Opacity still
  // lays out, so the measurement this waits on happens underneath it.
  const introOpacity = useRef(new Animated.Value(0)).current;
  const introReady = frameWidth > 0 && backsLoaded >= count;
  useEffect(() => {
    if (!introReady) return;
    Animated.timing(introOpacity, {
      toValue: 1,
      duration: INTRO_FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [introReady, introOpacity]);

  // Counts errors as well as loads: a back that will never decode must not
  // leave the spread invisible.
  const onBackSettled = useCallback(() => setBacksLoaded((n) => n + 1), []);

  // Warm the card art as soon as the draw is on screen, long before the button
  // is pressed. Failures resolve rather than reject: a front that will not load
  // is the Image component's problem, not a reason to hold up the animation.
  const frontUris = cardNumber.map(tarotCardImageUrl);
  const frontUriKey = frontUris.join("|");
  const frontsReady = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    frontsReady.current = Promise.all(
      frontUriKey
        .split("|")
        .map((uri) => Image.prefetch(uri).catch(() => false)),
    );
  }, [frontUriKey]);

  const cardWidth =
    frameWidth > 0
      ? Math.min(CARD_WIDTH, (frameWidth - SLOT_GAP * (count - 1)) / count)
      : CARD_WIDTH;
  const cardHeight = cardWidth * CARD_ASPECT;
  const slotPitch = cardWidth + SLOT_GAP;

  // Storage answers after the first render, so a draw that was already turned
  // over snaps face up rather than sitting there asking to be drawn again.
  useEffect(() => {
    if (!alreadyRevealed || revealed) return;
    cards.forEach((c) => c.flip.setValue(1));
    setRevealed(true);
  }, [alreadyRevealed, cards, revealed]);

  // Animation callbacks outlive the screen when a user navigates away
  // mid-shuffle; without this they set state on an unmounted component.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** How far card `i` has to travel to sit on the middle of the stack. */
  const gatherX = useCallback(
    (i: number) => ((count - 1) / 2 - i) * slotPitch,
    [count, slotPitch],
  );

  const animateXY = (
    value: Animated.ValueXY,
    toValue: { x: number; y: number },
    duration: number,
    easing: (t: number) => number = Easing.out(Easing.cubic),
  ): Promise<void> =>
    new Promise((resolve) => {
      Animated.timing(value, {
        toValue,
        duration,
        easing,
        useNativeDriver: true,
      }).start(() => resolve());
    });

  const animate = (
    value: Animated.Value,
    toValue: number,
    duration: number,
    easing: (t: number) => number = Easing.out(Easing.cubic),
    delay = 0,
  ): Promise<void> =>
    new Promise((resolve) => {
      Animated.timing(value, {
        toValue,
        duration,
        delay,
        easing,
        useNativeDriver: true,
      }).start(() => resolve());
    });

  const runDraw = useCallback(async () => {
    if (drawing || revealed) return;
    setDrawing(true);
    // The Draw button that had focus is gone, and the shuffle runs ~3s in silence.
    AccessibilityInfo.announceForAccessibility("Shuffling");

    const shuffledOrder = () =>
      Array.from({ length: count }, (_, i) => i).sort(
        () => Math.random() - 0.5,
      );

    // phase 1: gather — every card slides onto the middle slot
    await Promise.all(
      cards.flatMap((c, i) => [
        animateXY(c.translate, { x: gatherX(i), y: i * 1.5 }, 500),
        animate(c.rotate, i % 2 === 0 ? -3 : 3, 500),
      ]),
    );

    // phase 2: mixing — hop between nearby points, crossing over each other
    for (let round = 0; round < MIX_ROUNDS; round++) {
      const points = [...MIX_POINTS].sort(() => Math.random() - 0.5);
      setZOrder(shuffledOrder());
      await Promise.all(
        cards.flatMap((c, i) => {
          const p = points[i % points.length];
          return [
            animateXY(
              c.translate,
              { x: gatherX(i) + p.x, y: p.y },
              300,
              Easing.inOut(Easing.quad),
            ),
            animate(c.rotate, p.r, 300, Easing.inOut(Easing.quad)),
          ];
        }),
      );
    }

    // square the stack back up
    setZOrder(Array.from({ length: count }, (_, i) => i));
    await Promise.all(
      cards.flatMap((c, i) => [
        animateXY(
          c.translate,
          { x: gatherX(i), y: i * 1.5 },
          280,
          Easing.out(Easing.back(1.1)),
        ),
        animate(c.rotate, 0, 280),
      ]),
    );

    // phase 3: deal back out to the slots, still face down
    await Promise.all(
      cards.map((c) => animateXY(c.translate, { x: 0, y: 0 }, 600)),
    );
    await wait(80);

    // phase 4: turn them over, one after the next. The art is already warm by
    // here, so the stagger is the animation and not three downloads landing.
    await Promise.race([frontsReady.current, wait(FRONT_PREFETCH_WAIT_MS)]);
    if (mounted.current) setRevealed(true);
    await Promise.all(
      cards.map((c, i) =>
        animate(
          c.flip,
          1,
          FLIP_DURATION,
          Easing.inOut(Easing.cubic),
          i * FLIP_STAGGER_MS,
        ),
      ),
    );

    if (!mounted.current) return;
    setDrawing(false);
    if (names.length > 0) {
      AccessibilityInfo.announceForAccessibility(
        `Your cards: ${cardNumber.map((_, i) => tarotCardLabel(names[i], !!reversed[i], true, i)).join("; ")}`,
      );
    }
    onDrawComplete?.();
  }, [cards, cardNumber, count, drawing, gatherX, names, onDrawComplete, reversed, revealed]);

  const handleOracleLinkPress = () => {
    Linking.openURL(CARD_LINKS.amazon.ORACLE_CARDS);
  };

  const handleTarotLinkPress = () => {
    Linking.openURL(CARD_LINKS.amazon.TAROT_CARDS);
  };

  return (
    <Animated.View style={[styles.container, { opacity: introOpacity }]}>
      <View
        style={styles.frame}
        onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}
      >
        {cardNumber.map((num, idx) => {
          const c = cards[idx];
          const backRotate = c.flip.interpolate({
            inputRange: [0, 1],
            outputRange: ["0deg", "180deg"],
          });
          const frontRotate = c.flip.interpolate({
            inputRange: [0, 1],
            outputRange: ["180deg", "360deg"],
          });
          const wobble = c.rotate.interpolate({
            inputRange: [-15, 15],
            outputRange: ["-15deg", "15deg"],
          });

          return (
            <Animated.View
              key={`${num}-${idx}`}
              accessible
              accessibilityRole="image"
              accessibilityLabel={tarotCardLabel(names[idx], !!reversed[idx], revealed, idx)}
              style={[
                {
                  width: cardWidth,
                  height: cardHeight,
                  zIndex: zOrder[idx],
                  transform: [
                    { translateX: c.translate.x },
                    { translateY: c.translate.y },
                    { rotate: wobble },
                  ],
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.face,
                  {
                    transform: [{ perspective: 1000 }, { rotateY: backRotate }],
                  },
                ]}
              >
                <Image
                  source={determineCardBack(num)}
                  style={styles.cardImage}
                  onLoad={onBackSettled}
                  onError={onBackSettled}
                />
              </Animated.View>

              <Animated.View
                style={[
                  styles.face,
                  {
                    transform: [
                      { perspective: 1000 },
                      { rotateY: frontRotate },
                      { rotateZ: reversed[idx] ? "180deg" : "0deg" },
                    ],
                  },
                ]}
              >
                <Image
                  source={{ uri: tarotCardImageUrl(num) }}
                  style={styles.cardImage}
                />
              </Animated.View>
            </Animated.View>
          );
        })}
      </View>

      {drawing ? (
        <Text style={styles.shufflingText}>shuffling…</Text>
      ) : revealed ? null : (
        <TouchableOpacity
          style={styles.drawButton}
          onPress={runDraw}
          accessibilityRole="button"
          accessibilityLabel="Draw cards"
        >
          <Text style={styles.drawButtonText}>Draw</Text>
        </TouchableOpacity>
      )}

      <View style={styles.linksWrapper}>
        <TouchableOpacity
          style={styles.linkContainer}
          onPress={handleOracleLinkPress}
          accessibilityRole="link"
          accessibilityHint="Opens Amazon in your browser"
        >
          <Ionicons name="cart-outline" size={14} color="#8eeceaff" />
          <Text style={styles.linkText}>Oracle Cards</Text>
          <Ionicons
            name="open-outline"
            size={12}
            color="rgba(255,255,255,0.91)"
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkContainer}
          onPress={handleTarotLinkPress}
          accessibilityRole="link"
          accessibilityHint="Opens Amazon in your browser"
        >
          <Ionicons name="cart-outline" size={14} color="#8eeceaff" />
          <Text style={styles.linkText}>Tarot Cards</Text>
          <Ionicons
            name="open-outline"
            size={12}
            color="rgba(255, 255, 255, 0.91)"
          />
        </TouchableOpacity>
      </View>
    </Animated.View>
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
    gap: SLOT_GAP,
    width: "100%",
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
  drawButton: {
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(8),
    paddingHorizontal: scale(16),
    backgroundColor: "rgb(12, 228, 224)",
    borderRadius: scale(4),
  },
  drawButtonText: {
    color: "#fff",
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  // Occupies the button's place while the shuffle runs, so the row of cards
  // doesn't jump when the button goes away.
  shufflingText: {
    marginTop: verticalScale(12),
    paddingVertical: verticalScale(8),
    color: "#e6cd8f",
    fontStyle: "italic",
    fontSize: moderateScale(13),
  },
});
