import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "@/firebaseConfig";
import HeaderNav from "@/src/components/shared/header-nav";
import SkeletonLines from "@/src/components/shared/skeleton-lines";
import { ThemedText } from "@/src/components/themed-text";
import { COMPATIBILITY_DEFINITIONS } from "@/src/constants/definitions";
import { useRevenueCat } from "@/src/context/revenuecat-context";
import { useUser } from "@/src/context/user-context";
import { calculateNatalChart } from "@/src/services/astroEngine";
import { subscribeToSynastryReading } from "@/src/services/synastry-reading.service";
import { ChatStore } from "@/src/stores/chat-store";
import { NavigationStore } from "@/src/stores/navigation-store";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { renderRichText } from "@/src/utils/rich-text";
import { ThemedView } from "@/src/components/themed-view";
import { logger } from "@/src/utils/logger";

const NAV_BAR_HEIGHT = 44;
const BAR_MAX_WIDTH = Dimensions.get("window").width - scale(18) * 2;

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusState = "pending" | "processing" | "complete" | "error" | string;

interface ConnectionStatus {
  state: StatusState;
  type?: string;
  message?: string;
}

interface PersonInfo {
  firstName?: string;
  lastName?: string;
  sun?: string;
  moon?: string;
  rising?: string;
  pronouns?: string;
  birthday?: string;
  timeOfBirth?: string;
  placeOfBirth?: string;
  birthLat?: number;
  birthLon?: number;
  birthTimezone?: number;
  isBirthTimeUnknown?: boolean;
  isPlaceOfBirthUnknown?: boolean;
}

interface CompatibilityScores {
  accountability?: number;
  adaptability?: number;
  attraction?: number;
  communication?: number;
  desire?: number;
  ego: number;
  empathy?: number;
  hostility?: number;
  interest?: number;
  loyalty?: number;
  persuasion?: number;
  reasoning?: number;
  resonation?: number;
  responsibility?: number;
  sacrifice?: number;
  stubbornness?: number;  
  [key: string]: number | undefined;
}

interface CompatibilityReport {
  advice: string;
  scores: CompatibilityScores;
}

interface ConnectionDoc {
  connectionId: string;
  relationshipType?: string;
  status?: ConnectionStatus;
  firstPerson?: PersonInfo;
  secondPerson?: PersonInfo;
  compatibility?: CompatibilityReport;
  synastryUnlocked?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LOADING_SAYINGS = [
  "Calculating cosmic alignment...",
  "Reading the stars...",
  "Consulting the planets...",
  "Aligning your birth charts...",
  "Channeling celestial energy...",
  "Mapping planetary positions...",
  "Decoding your connection...",
  "Syncing with the universe...",
];

const KEYWORD_DEFINITIONS: Record<string, string> = {
  interest: COMPATIBILITY_DEFINITIONS.INTEREST,
  communication: COMPATIBILITY_DEFINITIONS.COMMUNICATION,
  resonation: COMPATIBILITY_DEFINITIONS.RESONATION,
  reasoning: COMPATIBILITY_DEFINITIONS.REASONING,
  loyalty: COMPATIBILITY_DEFINITIONS.LOYALTY,
  attraction: COMPATIBILITY_DEFINITIONS.ATTRACTION,
  stubbornness: COMPATIBILITY_DEFINITIONS.STUBBORNNESS,
  sacrifice: COMPATIBILITY_DEFINITIONS.SACRIFICE,
  accountability: COMPATIBILITY_DEFINITIONS.ACCOUNTABILITY,
  adaptability: COMPATIBILITY_DEFINITIONS.ADAPTABILITY,
  desire: COMPATIBILITY_DEFINITIONS.DESIRE,
  ego: COMPATIBILITY_DEFINITIONS.EGO,
  empathy: COMPATIBILITY_DEFINITIONS.EMPATHY,
  hostility: COMPATIBILITY_DEFINITIONS.HOSTILITY,
  persuasion: COMPATIBILITY_DEFINITIONS.PERSUASION,
  responsibility: COMPATIBILITY_DEFINITIONS.RESPONSIBILITY,
};

const getBarColor = (value: number) => {
  if (value >= 75) return "#41FF88";
  if (value >= 50) return "#FFDD00";
  return "#FF3B3B";
};

// ─── Sub-components ───────────────────────────────────────────────────────────

// Tracks which score bars have already animated this session, so returning
// to a connection doesn't replay the animation.
const ANIMATED_BARS = new Set<string>();

function ScoreBar({
  value,
  color,
  delay,
  id,
}: {
  value: number;
  color: string;
  delay: number;
  id: string;
}) {
  const target = (value / 100) * BAR_MAX_WIDTH;
  const alreadyAnimated = ANIMATED_BARS.has(id);
  const progress = useSharedValue(alreadyAnimated ? target : 0);

  useEffect(() => {
    if (alreadyAnimated) {
      progress.value = target;
      return;
    }
    progress.value = withDelay(delay, withTiming(target, { duration: 900 }));
    ANIMATED_BARS.add(id);
  }, [target]);

  const animStyle = useAnimatedStyle(() => ({
    width: progress.value,
  }));

  return (
    <View style={styles.barBackground}>
      <Animated.View style={[styles.barFill, { backgroundColor: color }, animStyle]} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ConnectionViewScreen() {
  const {
    id: connectionId,
    firstFirst,
    firstLast,
    secondFirst,
    secondLast,
  } = useLocalSearchParams<{
    id: string;
    firstFirst?: string;
    firstLast?: string;
    secondFirst?: string;
    secondLast?: string;
  }>();
  const { authUser } = useUser();
  const {
    hasFullAccess,
    loading: rcLoading,
    presentPaywall,
  } = useRevenueCat();
  // `hasFullAccess` already folds in the admin carve-out. Display/UX only —
  // no server-side gate reads it.
  const hasPremiumAccess = rcLoading || hasFullAccess;
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const [connection, setConnection] = useState<ConnectionDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_SAYINGS[0]);
  const [hasSynastryReading, setHasSynastryReading] = useState(false);

  const synastryUnlocked = connection?.synastryUnlocked === true;

  // The report can take a while, and arrives by snapshot with nothing focused on
  // it. Announce it only if this screen saw it missing — not on a later visit.
  const sawReportMissing = useRef(false);
  const hasReport = !!connection?.compatibility;
  const reportFailed = connection?.status?.state === "error" && !hasReport;
  useEffect(() => {
    if (!connection) return;
    if (!hasReport && !reportFailed) {
      sawReportMissing.current = true;
    } else if (sawReportMissing.current) {
      sawReportMissing.current = false;
      AccessibilityInfo.announceForAccessibility(
        reportFailed
          ? "Something went wrong generating the report."
          : "Compatibility reading ready.",
      );
    }
  }, [connection, hasReport, reportFailed]);

  // Rotate loading messages while waiting for report
  useEffect(() => {
    if (connection?.compatibility) return;
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % LOADING_SAYINGS.length;
      setLoadingMessage(LOADING_SAYINGS[index]);
    }, 2500);
    return () => clearInterval(interval);
  }, [connection?.compatibility]);

  // Real-time listener
  useEffect(() => {
    if (!authUser?.uid || !connectionId) return;

    const ref = doc(db, "users", authUser.uid, "connections", connectionId);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setError("Connection not found.");
          setLoading(false);
          return;
        }
        const data = snap.data() as any;
        setConnection({
          connectionId: data.connectionId ?? connectionId,
          relationshipType: data.relationshipType,
          status: data.status,
          firstPerson: data.firstPerson,
          secondPerson: data.secondPerson,
          compatibility: data.compatibility,
          synastryUnlocked: data.synastryUnlocked === true,
        });
        setLoading(false);
      },
      (err) => {
        logger.error("[connection] Firestore listener failed", err, "connection_listener");
        setError("Something went wrong loading this connection.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authUser?.uid, connectionId]);

  // Track whether a completed synastry reading exists
  useEffect(() => {
    if (!authUser?.uid || !connectionId) return;
    const unsub = subscribeToSynastryReading(authUser.uid, connectionId, () => {
      setHasSynastryReading(true);
    });
    return () => unsub();
  }, [authUser?.uid, connectionId]);

  const handleToggleKeyword = (keyword: string) => {
    setExpandedKeyword((prev) => (prev === keyword ? null : keyword));
  };

  const statusLabel = (() => {
    const state = connection?.status?.state;
    switch (state) {
      case "pending": return "Preparing your compatibility reading...";
      case "processing": return "Channeling the stars... almost there";
      case "error": return "We ran into an issue generating this reading.";
      default: return loadingMessage;
    }
  })();

  const [computingSynastry, setComputingSynastry] = useState(false);

  const parseBirthParams = (p: PersonInfo) => {
    const raw = (p.birthday ?? '').trim();
    let year: number, month: number, day: number;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
      [year, month, day] = raw.split('-').map(Number);
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
      [month, day, year] = raw.split('/').map(Number);
    } else {
      throw new Error(`Invalid birthday format: "${raw}"`);
    }

    let hour = 0, min = 0;
    const timeRaw = (p.timeOfBirth ?? '').trim();
    const ampm = timeRaw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = Number(ampm[1]);
      min = Number(ampm[2]);
      const period = ampm[3].toUpperCase();
      if (period === 'PM' && h !== 12) h += 12;
      if (period === 'AM' && h === 12) h = 0;
      hour = h;
    } else if (/^\d{1,2}:\d{2}$/.test(timeRaw)) {
      const [h, m] = timeRaw.split(':').map(Number);
      hour = h;
      min = m;
    }

    const params = {
      year, month, day, hour, minute: min,
      lat: p.birthLat ?? 0,
      lon: p.birthLon ?? 0,
      timezone: p.birthTimezone ?? 0,
    };
    if (
      !Number.isFinite(params.year) ||
      !Number.isFinite(params.month) ||
      !Number.isFinite(params.day)
    ) {
      throw new Error(`Invalid birth params: ${JSON.stringify(params)}`);
    }
    return params;
  };

  const runSynastryCompare = async () => {
    const fp = connection?.firstPerson;
    const sp = connection?.secondPerson;

    if (!fp?.birthday || !sp?.birthday) {
      logger.warn("[connection] missing birthday info for one or both persons");
      // Returned silently before — the button just did nothing
      Alert.alert("Can't open synastry", "This connection is missing a birthday. Edit the connection to add it.");
      return;
    }

    setComputingSynastry(true);
    try {
      const chartA = await calculateNatalChart(parseBirthParams(fp));
      const chartB = await calculateNatalChart(parseBirthParams(sp));

      NavigationStore.setSynastryAnalysis({
        chartA,
        chartB,
        nameA: `${fp.firstName ?? ''} ${fp.lastName ?? ''}`.trim(),
        nameB: `${sp.firstName ?? ''} ${sp.lastName ?? ''}`.trim(),
      });

      router.push(`/connection/${connectionId}/synastry`);
    } catch (e) {
      // Swallowed before, so a failure looked like nothing happening
      logger.error("[connection] synastry compare failed", e, "connection_synastry_compare");
      Alert.alert("Can't open synastry", "Something went wrong calculating the charts. Please try again.");
      setComputingSynastry(false);
    }
  };

  const handleCompareBirthChart = async () => {
    if (!hasPremiumAccess && !hasSynastryReading && !synastryUnlocked) {
      presentPaywall();
      return;
    }
    await runSynastryCompare();
  };

  const handleTalkToDelaluna = () => {
    if (!connectionId) return;
    const sp = connection?.secondPerson;
    const name = sp?.firstName?.trim() || "this connection";
    ChatStore.setPendingConnection({ id: String(connectionId), name });
    router.push("/(main)/chat");
  };

  const handleCompareBirthCharts = async () => {
    const fp = connection?.firstPerson;
    const sp = connection?.secondPerson;
    if (!fp?.birthday || !sp?.birthday) return;

    setComputingSynastry(true);
    try {
      const chartA = await calculateNatalChart(parseBirthParams(fp));
      const chartB = await calculateNatalChart(parseBirthParams(sp));

      
      router.push(`/connection/${connectionId}/synastry`);
    } catch (e) {
      logger.error("[connection] synastry calculation failed", e, "connection_synastry_calc");
    } finally {
      setComputingSynastry(false);
    }
  };

  const report = connection?.compatibility;

  const capitalize = (s?: string) => {
    const trimmed = s?.trim();
    if (!trimmed) return "";
    return trimmed
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };

  const buildName = (first?: string, last?: string, fallback = "Person") => {
    const joined = [capitalize(first), capitalize(last)].filter(Boolean).join(" ");
    return joined || fallback;
  };

  const firstName = buildName(firstFirst, firstLast, "Person 1");
  const secondName = buildName(secondFirst, secondLast, "Person 2");

  // ─── Loading / Error states ─────────────────────────────────────────────────

  if (error) {
    return (
      <ThemedView style={styles.wrapper}>
        <HeaderNav
          title="Compatibility"
          leftIconName="arrow-back"
          onLeftPress={() => router.replace("/(main)/connections")}
        />
        <ThemedView style={[styles.centered, { marginTop: headerHeight }]}>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
        </ThemedView>
      </ThemedView>
    );
  }

  // ─── Main view ──────────────────────────────────────────────────────────────

  return (
    <View style={styles.wrapper}>
      <HeaderNav
        title="Compatibility"
        leftIconName="arrow-back"
        onLeftPress={() => router.replace("/(main)/connections")}
        rightIconName={report ? "create-outline" : undefined}
        onRightPress={report ? () =>
          router.push({ pathname: "/connection/[id]/edit", params: { id: connectionId } })
        : undefined}
        rightAccessibilityLabel="Edit connection"
      />

      <View style={[styles.mainContent, { marginTop: headerHeight }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Names + relationship type */}
          <Text style={styles.namesText} accessibilityRole="header">{firstName} & {secondName}</Text>
          {connection?.relationshipType && (
            <Text style={styles.relationshipBadge}> STATUS: {connection.relationshipType.toUpperCase()}
            </Text>
          )}

          {/* Score bars — only render once the report exists */}
          {connection?.status?.state === "error" && !report ? (
            <Text style={styles.errorText}>Something went wrong generating the report.</Text>
          ) : !report ? (
            <>
              {/* Skeletons are blank to a screen reader; say what's coming */}
              <View style={styles.loadingCard} accessible accessibilityLabel="Weekly advice, loading">
                <Text style={styles.loadingCardLabel}>WEEKLY ADVICE</Text>
                <SkeletonLines lines={4} />
              </View>
              <View style={styles.loadingCard} accessible accessibilityLabel="Weekly forecast, loading">
                <Text style={styles.loadingCardLabel}>WEEKLY FORECAST</Text>
                <SkeletonLines lines={6} lineHeight={moderateScale(8)} />
              </View>
              <Text style={styles.pendingText}>{statusLabel}</Text>
            </>
          ) : report ? (
            <>
              {/* Compare / View Birth Charts */}
              <TouchableOpacity
                style={styles.compareBirthChartsBtn}
                onPress={handleCompareBirthChart}
                activeOpacity={0.75}
                disabled={computingSynastry}
                accessibilityRole="button"
                // It disables itself while the charts compute, which wasn't said
                accessibilityState={{ disabled: computingSynastry, busy: computingSynastry }}
              >
                <Text style={styles.compareBirthChartsBtnText}>
                  { "View Synastry Analysis"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.talkToDelalunaBtn}
                onPress={handleTalkToDelaluna}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={moderateScale(14)}
                  color="#FFFFFF"
                  style={{ marginRight: scale(6) }}
                />
                <Text style={styles.talkToDelalunaBtnText}>Talk to Delaluna About It</Text>
              </TouchableOpacity>

              <Text style={styles.sectionLabel} accessibilityRole="header">Weekly Advice</Text>
              <Text style={styles.reportSummary}>{renderRichText(report.advice)}</Text>

              <Text style={styles.sectionLabel} accessibilityRole="header">Weekly Forecast</Text>
              <ThemedText style={styles.reportSummary}>
                Metrics are based on birth chart placements, aspects and planetary transits. Statistics are updated weekly.
              </ThemedText>
              {Object.entries(report.scores || {})
                .filter(([, value]) => typeof value === "number")
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([keyword, value], index) => {
                  const numericValue = value as number;
                  const barColor = getBarColor(numericValue);
                  const defKey = keyword.toLowerCase().replace(/\s+/g, "");
                  const definition = KEYWORD_DEFINITIONS[defKey];
                  const label = keyword.charAt(0).toUpperCase() + keyword.slice(1);

                  return (
                    <View key={keyword} style={styles.keywordContainer}>
                      <TouchableOpacity
                        onPress={() => definition && handleToggleKeyword(keyword)}
                        activeOpacity={definition ? 0.7 : 1}
                        // One stop for name and score; the ⓘ icon and expand/collapse
                        // were only visual
                        accessible
                        accessibilityRole={definition ? "button" : "text"}
                        accessibilityLabel={`${label}, ${Math.round(numericValue)} percent`}
                        accessibilityState={definition ? { expanded: expandedKeyword === keyword } : undefined}
                        accessibilityHint={definition ? "Shows what this means" : undefined}
                      >
                        <View style={styles.row}>
                          <View style={styles.keywordLabelRow}>
                            <Text style={styles.keyword}>{label}</Text>
                            {definition && (
                              <Ionicons
                                name="information-circle-outline"
                                size={moderateScale(14)}
                                color="rgba(184,163,255,0.8)"
                                style={styles.infoIcon}
                              />
                            )}
                          </View>
                          <Text style={styles.valueText}>{Math.round(numericValue)}%</Text>
                        </View>
                      </TouchableOpacity>
                      {expandedKeyword === keyword && definition && (
                        <Text style={styles.definition}>{definition}</Text>
                      )}
                      <ScoreBar
                        value={numericValue}
                        color={barColor}
                        delay={index * 80}
                        id={`${connectionId}-${keyword}`}
                      />
                    </View>
                  );
                })}
            </>
          ) : null}
        </ScrollView>
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
    overflow: "hidden",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: scale(40),
  },
  content: {
    paddingHorizontal: scale(18),
    paddingTop: verticalScale(20),
    paddingBottom: verticalScale(48),
  },
  centerContent: {
    alignItems: 'center',
    width: '80%',
    gap: verticalScale(12),
  },
  namesText: {
    color: "#B8A3FF",
    fontSize: moderateScale(18),
    fontWeight: "600",
    textAlign: "center",
    marginBottom: verticalScale(4),
  },
  relationshipBadge: {
    color: "rgba(255,255,255,0.7)", // was 0.45
    fontSize: moderateScale(10),
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: verticalScale(8),
  },
  overallScore: {
    color: "#FFFFFF",
    fontSize: moderateScale(52),
    fontWeight: "700",
    textAlign: "center",
    marginBottom: verticalScale(4),
  },
  reportTitle: {
    color: "#FFFFFF",
    fontSize: moderateScale(16),
    fontWeight: "600",
    textAlign: "center",
    marginBottom: verticalScale(8),
  },
  reportSummary: {
    color: "rgba(255,255,255,0.75)",
    fontSize: moderateScale(13),
    lineHeight: 22,
    textAlign: "center",
    marginBottom: verticalScale(20),
    includeFontPadding: false,
  },
  sectionLabel: {
    color: "#FFFFFF",
    fontSize: moderateScale(15),
    fontWeight: "600",
    letterSpacing: 1.5,
    marginBottom: verticalScale(10),
    textAlign: "center",
  },
  pendingCard: {
    alignItems: "center",
    gap: verticalScale(10),
    paddingVertical: verticalScale(24),
  },
  loadingCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(16),
    marginBottom: verticalScale(14),
  },
  loadingCardLabel: {
    color: "#ffffff",
    fontSize: moderateScale(12),
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: verticalScale(10),
  },
  namesSkeleton: {
    alignItems: "center",
    marginBottom: verticalScale(4),
  },
  pendingFullScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingFullScreenAnimation: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingAnimation: {
     width: moderateScale(550),
    height: moderateScale(550),
  },
  animation: {
     width: "100%",
    height: "100%",
  },
  animationStack: {
    width: moderateScale(550),
    height: moderateScale(550),
    alignItems: "center",
    justifyContent: "center",
  },
  pendingAnimationOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  pendingText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: moderateScale(14),
    textAlign: "center",
  },
  keywordContainer: {
    marginBottom: verticalScale(14),
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  keyword: {
    color: "#FFFFFF",
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  keywordLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoIcon: {
    marginLeft: scale(6),
  },
  valueText: {
    color: "#FFFFFF",
    fontSize: moderateScale(13),
    fontWeight: "500",
  },
  barBackground: {
    height: 7,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 6,
    marginTop: verticalScale(4),
    overflow: "hidden",
  },
  barFill: {
    height: 7,
    borderRadius: 6,
  },
  definition: {
    color: "#D3CFFF",
    fontSize: moderateScale(12),
    lineHeight: 20,
    fontStyle: "italic",
    marginTop: verticalScale(5),
    paddingLeft: 2,
  },
  closing: {
    color: "rgba(255,255,255,0.8)",
    fontSize: moderateScale(13),
    lineHeight: 22,
    textAlign: "center",
    marginTop: verticalScale(24),
  },
  compareBirthChartsBtn: {
    borderWidth: 1,
    borderColor: "rgba(184,163,255,0.4)",
    borderRadius: scale(10),
    paddingVertical: verticalScale(10),
    alignItems: "center",
    marginBottom: verticalScale(10),
  },
  compareBirthChartsBtnText: {
    color: "#B8A3FF",
    fontSize: moderateScale(13),
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  talkToDelalunaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#B8A3FF",
    borderRadius: scale(10),
    paddingVertical: verticalScale(10),
    marginBottom: verticalScale(20),
  },
  talkToDelalunaBtnText: {
    color: "#FFFFFF",
    fontSize: moderateScale(13),
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: moderateScale(14),
    textAlign: "center",
  },
});
