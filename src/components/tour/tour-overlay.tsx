import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  findNodeHandle,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { Text } from '@/src/components/app-text';
import ConstellationProgress from '@/src/components/tour/constellation-progress';
import { TourTargetContext } from '@/src/components/tour/tour-target';
import { TOUR_FINISH_LINKS, TOUR_STEPS } from '@/src/constants/tour';
import { C, R, S } from '@/src/constants/theme';
import { useReducedMotion } from '@/src/context/accessibility-context';
import { useTour } from '@/src/context/tour-context';
import { useUser } from '@/src/context/user-context';
import { cardTop, type Hole, overlayPath, spotlightHole } from '@/src/utils/tour-policy';

const DIM = 'rgba(2,1,5,0.78)';
const CARD_GAP = 16;
const CARD_MAX_W = 420;
/** Polling for a target that hasn't mounted yet (a tab opened for the first time). */
const FIND_INTERVAL_MS = 100;
const FIND_ATTEMPTS = 30;
/** Time for a scroll or a tab switch to settle before measuring. */
const SETTLE_MS = 380;
const SETTLE_REDUCED_MS = 120;

/** True while the tour covers the screen — the caller hides what's under it from TalkBack. */
export function useTourCoversScreen(): boolean {
  const { status } = useTour();
  const pathname = usePathname();
  return status === 'running' || status === 'finished' || (status === 'offer' && pathname === '/');
}

/**
 * Mounted once, over the tab navigator in app/(main)/_layout.tsx. Draws the
 * offer, each step's spotlight and card, and the finish card. Touches on the
 * dimmed app are swallowed on purpose: the tour moves only by its own buttons.
 */
export default function TourOverlay() {
  const tour = useTour();
  const { status, stepIndex } = tour;
  const covers = useTourCoversScreen();
  const registry = useContext(TourTargetContext);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const { userDoc } = useUser();

  const rootRef = useRef<View>(null);
  const titleRef = useRef<React.ElementRef<typeof Text>>(null);
  const pathnameRef = useRef(pathname);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cardHeight, setCardHeight] = useState(0);
  const [measured, setMeasured] = useState<{ key: string; hole: Hole | null } | null>(null);
  const [fade] = useState(() => new Animated.Value(1));

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const step = status === 'running' ? TOUR_STEPS[stepIndex] : undefined;
  const stepKey = step ? `${step.id}:${size.width}x${size.height}` : null;
  const ready = !!stepKey && measured?.key === stepKey;
  const hole = ready ? measured.hole : null;
  // What the screen reader lands on — one key per card shown.
  const screenKey = !covers ? null : status === 'running' ? (ready ? stepKey : null) : status;

  // ── Find, reveal and measure the step's target ─────────────────────────
  useEffect(() => {
    if (!step || !stepKey || size.width === 0) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
    const settle = reduceMotion ? SETTLE_REDUCED_MS : SETTLE_MS;
    const done = (h: Hole | null) => {
      if (!cancelled) setMeasured({ key: stepKey, hole: h });
    };

    const needsNav = pathnameRef.current !== step.route;
    if (needsNav) router.navigate(step.route);

    let tries = 0;
    const attempt = () => {
      if (cancelled) return;
      const entry = registry?.get(step.target);
      if (!entry?.ref.current) {
        // Not mounted (yet). Show the card without a spotlight rather than stall.
        if (++tries < FIND_ATTEMPTS) later(attempt, FIND_INTERVAL_MS);
        else done(null);
        return;
      }
      entry.activate();
      later(() => {
        const node = entry.ref.current;
        const root = rootRef.current;
        if (cancelled || !node || !root) return done(null);
        root.measureInWindow((ox, oy) => {
          node.measureInWindow((x, y, width, height) => {
            if (width <= 0 || height <= 0) return done(null);
            done(
              spotlightHole(
                { x, y, width, height },
                { x: ox, y: oy },
                step.shape,
                size,
                step.padding ?? (step.shape === 'circle' ? 6 : 8),
              ),
            );
          });
        });
      }, settle);
    };
    later(attempt, needsNav ? settle : 0);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [step, stepKey, size, registry, reduceMotion]);


  // ── Motion: a cross-fade per card. The spotlight ring is static. ───────
  useEffect(() => {
    if (!screenKey) return;
    if (reduceMotion) {
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [screenKey, reduceMotion, fade]);

  // ── Screen reader: start each card on its title ────────────────────────
  useEffect(() => {
    if (!screenKey) return;
    const t = setTimeout(() => {
      const tag = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (tag) AccessibilityInfo.setAccessibilityFocus(tag);
    }, 150);
    return () => clearTimeout(t);
  }, [screenKey]);

  // ── Android back: one step back, or out ────────────────────────────────
  const { decline, back, skip, complete } = tour;
  useEffect(() => {
    if (!covers) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (status === 'offer') decline();
      else if (status === 'finished') complete('home');
      else if (stepIndex > 0) back();
      else skip();
      return true;
    });
    return () => sub.remove();
  }, [covers, status, stepIndex, decline, back, skip, complete]);

  const onRootLayout = useCallback((e: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  }, []);

  if (!covers) return null;

  const firstName = (userDoc as { firstName?: string } | null)?.firstName?.trim();
  const cardWidth = Math.min(Math.max(size.width - S.md * 2, 0), CARD_MAX_W);
  const cardLeft = (size.width - cardWidth) / 2;

  return (
    <View ref={rootRef} testID="tour-root" style={styles.root} onLayout={onRootLayout} accessibilityViewIsModal>
      {status === 'offer' ? (
        <Animated.View style={[styles.full, { opacity: fade }]}>
          <ScrollView contentContainerStyle={[styles.fullContent, { paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl }]}>
            <MoonMark />
            <View style={styles.centerText}>
              <Text ref={titleRef} style={styles.heroTitle} accessibilityRole="header">
                {firstName ? `Welcome to Delaluna, ${firstName}` : 'Welcome to Delaluna'}
              </Text>
              <Text style={styles.heroBody}>Want a one-minute tour of everything the stars can tell you here?</Text>
            </View>
            <View style={styles.stack}>
              <PrimaryButton label="Show me around" onPress={tour.accept} />
              <OutlineButton label="I'll explore on my own" onPress={decline} />
            </View>
            <Text style={styles.footnote}>You can replay the tour anytime from Profile.</Text>
          </ScrollView>
        </Animated.View>
      ) : null}

      {status === 'finished' ? (
        <Animated.View style={[styles.full, { opacity: fade }]}>
          <ScrollView contentContainerStyle={[styles.fullContent, { paddingTop: insets.top + S.xl, paddingBottom: insets.bottom + S.xl }]}>
            <ConstellationProgress total={TOUR_STEPS.length} current={0} complete width={Math.min(cardWidth, 300)} />
            <View style={styles.centerText}>
              <Text style={styles.eyebrow}>Constellation complete</Text>
              <Text ref={titleRef} style={styles.heroTitle} accessibilityRole="header">
                {firstName ? `You're all set, ${firstName}` : "You're all set"}
              </Text>
              <Text style={styles.heroBody}>Your stars are mapped. Where would you like to begin?</Text>
            </View>
            <View style={styles.stack}>
              {TOUR_FINISH_LINKS.map((link) => (
                <TouchableOpacity
                  key={link.cta}
                  style={styles.linkRow}
                  accessibilityRole="button"
                  activeOpacity={0.8}
                  onPress={() => {
                    complete(link.cta);
                    router.navigate(link.route);
                  }}
                >
                  <Text style={styles.linkText}>{link.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={C.goldBright} />
                </TouchableOpacity>
              ))}
            </View>
            <PrimaryButton label="Take me Home" onPress={() => complete('home')} />
            <Text style={styles.footnote}>Replay anytime from Profile › Replay app tour</Text>
          </ScrollView>
        </Animated.View>
      ) : null}

      {status === 'running' && step ? (
        <>
          {size.width > 0 ? (
            <Svg
              width={size.width}
              height={size.height}
              style={StyleSheet.absoluteFill}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Path d={overlayPath(size.width, size.height, hole)} fill={DIM} fillRule="evenodd" />
            </Svg>
          ) : null}

          {hole ? (
            <View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.ring,
                { left: hole.x, top: hole.y, width: hole.width, height: hole.height, borderRadius: hole.radius },
              ]}
            />
          ) : null}

          {ready ? (
            <Animated.View
              onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
              style={[
                styles.card,
                {
                  left: cardLeft,
                  width: cardWidth,
                  maxHeight: Math.max(0, size.height - insets.top - insets.bottom - S.md),
                  top: cardTop({
                    hole,
                    cardHeight,
                    screenHeight: size.height,
                    insetTop: insets.top + S.sm,
                    insetBottom: insets.bottom + S.sm,
                    gap: CARD_GAP,
                  }),
                  opacity: fade,
                },
              ]}
            >
              <ScrollView style={styles.cardScroll} contentContainerStyle={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <ConstellationProgress total={TOUR_STEPS.length} current={stepIndex} />
                  <Text style={styles.counter} importantForAccessibility="no" accessibilityElementsHidden>
                    {stepIndex + 1} of {TOUR_STEPS.length}
                  </Text>
                </View>
                <Text
                  ref={titleRef}
                  style={styles.cardTitle}
                  accessibilityRole="header"
                  accessibilityLabel={`Step ${stepIndex + 1} of ${TOUR_STEPS.length}. ${step.title}`}
                >
                  {step.title}
                </Text>
                <Text style={styles.cardText}>{step.body}</Text>
                {step.chips ? (
                  <View style={styles.chips}>
                    {step.chips.map((chip) => (
                      <View key={chip.label} style={styles.chip}>
                        <Text style={[styles.chipText, chip.premium && styles.chipPremium]}>
                          {chip.premium ? `${chip.label} · Premium` : chip.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {step.note ? <Text style={styles.cardNote}>{step.note}</Text> : null}
              </ScrollView>

              <View style={styles.cardButtons}>
                <TouchableOpacity
                  onPress={skip}
                  style={styles.skip}
                  accessibilityRole="button"
                  accessibilityLabel="Skip tour"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.skipText}>Skip tour</Text>
                </TouchableOpacity>
                <View style={styles.navButtons}>
                  {stepIndex > 0 ? <OutlineButton label="Back" onPress={back} compact /> : null}
                  <PrimaryButton
                    label={stepIndex === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
                    onPress={tour.next}
                    compact
                  />
                </View>
              </View>
            </Animated.View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function PrimaryButton({ label, onPress, compact }: { label: string; onPress: () => void; compact?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.primary, compact && styles.compact]}
      accessibilityRole="button"
      activeOpacity={0.85}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </TouchableOpacity>
  );
}

function OutlineButton({ label, onPress, compact }: { label: string; onPress: () => void; compact?: boolean }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.outline, compact && styles.compact]}
      accessibilityRole="button"
      activeOpacity={0.85}
    >
      <Text style={styles.outlineText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A crescent with two orbits — decorative. */
function MoonMark() {
  return (
    <View style={styles.moon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.orbit, { top: 0, left: 0, right: 0, bottom: 0, opacity: 0.35 }]} />
      <View style={[styles.orbit, { top: 22, left: 22, right: 22, bottom: 22, opacity: 0.6 }]} />
      <View style={styles.moonLit} />
      <View style={styles.moonShadow} />
      <View style={styles.moonStar} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  full: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.void,
  },
  fullContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: S.lg + 4,
    gap: S.lg + 4,
  },
  centerText: {
    alignItems: 'center',
    gap: S.md - 4,
    maxWidth: CARD_MAX_W,
  },
  eyebrow: {
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: C.turquoise,
    fontWeight: '500',
    textAlign: 'center',
  },
  heroTitle: {
    fontFamily: 'Futura-Generic',
    fontSize: 30,
    lineHeight: 36,
    color: '#ffffff',
    textAlign: 'center',
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 24,
    color: C.moonSilver,
    textAlign: 'center',
  },
  stack: {
    width: '100%',
    maxWidth: CARD_MAX_W,
    gap: S.md - 4,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
    color: C.muted,
    textAlign: 'center',
  },
  linkRow: {
    minHeight: 56,
    paddingHorizontal: S.md + 2,
    paddingVertical: S.sm,
    borderRadius: R.md + 4,
    borderWidth: 1,
    borderColor: C.purpleDim,
    backgroundColor: C.starfield,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
  },
  linkText: {
    flexShrink: 1,
    fontSize: 15,
    color: '#ffffff',
  },
  primary: {
    alignSelf: 'stretch',
    maxWidth: CARD_MAX_W,
    minHeight: 54,
    paddingHorizontal: S.lg + 4,
    paddingVertical: S.sm,
    borderRadius: R.pill,
    backgroundColor: C.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '600',
    color: C.void,
    textAlign: 'center',
  },
  outline: {
    alignSelf: 'stretch',
    minHeight: 54,
    paddingHorizontal: S.lg,
    paddingVertical: S.sm,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: 'rgba(188,168,244,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
  },
  compact: {
    alignSelf: 'auto',
    minHeight: 48,
    paddingHorizontal: S.lg - 2,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: C.gold,
    shadowColor: C.goldBright,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  card: {
    position: 'absolute',
    borderRadius: R.xl - 2,
    borderWidth: 1,
    borderColor: 'rgba(212,168,83,0.45)',
    backgroundColor: C.starfield,
    overflow: 'hidden',
  },
  cardScroll: {
    flexGrow: 0,
  },
  cardBody: {
    paddingHorizontal: S.md + 4,
    paddingTop: S.md + 4,
    gap: S.md - 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
  },
  counter: {
    fontSize: 13,
    color: C.muted,
  },
  cardTitle: {
    fontFamily: 'Futura-Generic',
    fontSize: 22,
    lineHeight: 28,
    color: '#ffffff',
  },
  cardText: {
    fontSize: 15,
    lineHeight: 23,
    color: C.moonSilver,
  },
  cardNote: {
    fontSize: 13,
    lineHeight: 19,
    color: C.muted,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: S.sm,
  },
  chip: {
    paddingHorizontal: S.md - 4,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.purpleDim,
  },
  chipText: {
    fontSize: 13,
    color: C.purpleLight,
  },
  chipPremium: {
    color: C.goldBright,
  },
  cardButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: S.sm,
    paddingHorizontal: S.md + 4,
    paddingTop: S.md,
    paddingBottom: S.md + 4,
  },
  skip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: S.xs,
  },
  skipText: {
    fontSize: 15,
    color: C.inactiveTabs,
  },
  navButtons: {
    flexDirection: 'row',
    gap: S.sm + 2,
    marginLeft: 'auto',
  },
  moon: {
    width: 168,
    height: 168,
  },
  orbit: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.gold,
  },
  moonLit: {
    position: 'absolute',
    left: 44,
    top: 44,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.goldBright,
    shadowColor: C.goldBright,
    shadowOpacity: 0.45,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  moonShadow: {
    position: 'absolute',
    left: 66,
    top: 36,
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: C.void,
  },
  moonStar: {
    position: 'absolute',
    left: 150,
    top: 30,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.turquoise,
  },
});
