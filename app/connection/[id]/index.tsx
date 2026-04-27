import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import LottieView from "lottie-react-native";
import React, { useEffect, useState } from "react";
import {
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
import ConsumablePlaceholder from "@/src/components/shared/consumable-placeholder.component";
import HeaderNav from "@/src/components/shared/header-nav";
import { ThemedText } from "@/src/components/themed-text";
import { COMPATIBILITY_DEFINITIONS } from "@/src/constants/definitions";
import { useRevenueCat } from "@/src/context/revenuecat-context";
import { useUser } from "@/src/context/user-context";
import { calculateNatalChart } from "@/src/services/astroEngine";
import { subscribeToSynastryReading } from "@/src/services/synastry-reading.service";
import { NavigationStore } from "@/src/stores/navigation-store";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

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
  const { id: connectionId } = useLocalSearchParams<{ id: string }>();
  const { authUser } = useUser();
  const { isPro } = useRevenueCat();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const [connection, setConnection] = useState<ConnectionDoc | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeyword, setExpandedKeyword] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(LOADING_SAYINGS[0]);
  const [hasSynastryReading, setHasSynastryReading] = useState(false);
  const [synastryConsumablePurchased, setSynastryConsumablePurchased] = useState(false);
  const [showSynastryConsumable, setShowSynastryConsumable] = useState(false);

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
        });
        setLoading(false);
      },
      (err) => {
        console.error("Firestore listener error:", err);
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
      console.warn("Missing birthday info for one or both persons");
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
      setComputingSynastry(false);
    }
  };

  const handleCompareBirthChart = async () => {
    // Gate behind premium / consumable purchase (skip if already viewed)
    if (!isPro && !hasSynastryReading && !synastryConsumablePurchased) {
      setShowSynastryConsumable(true);
      return;
    }
    await runSynastryCompare();
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
      console.error("Error calculating synastry:", e);
    } finally {
      setComputingSynastry(false);
    }
  };

  const report = connection?.compatibility;
  const firstName = connection?.firstPerson?.firstName + " " + connection?.firstPerson?.lastName || "Person 1";
  const secondName = connection?.secondPerson?.firstName + " " + connection?.secondPerson?.lastName || "Person 2";

  // ─── Loading / Error states ─────────────────────────────────────────────────

  

  if (error) {
    return (
      <View style={styles.wrapper}>
        <HeaderNav
          title="Compatibility"
          leftIconName="arrow-back"
          onLeftPress={() => router.replace("/(main)/connections")}
        />
        <View style={[styles.centered, { marginTop: headerHeight }]}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
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
      />

      <View style={[styles.mainContent, { marginTop: headerHeight }]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Names + relationship type */}
          <Text style={styles.namesText}>{firstName} & {secondName}</Text>
          {connection?.relationshipType && (
            <Text style={styles.relationshipBadge}> STATUS: {connection.relationshipType.toUpperCase()}
            </Text>
          )}

          

          

          {/* Score bars — only render once the report exists */}
          {connection?.status?.state === "error" && !report ? (
            <Text style={styles.errorText}>Something went wrong generating the report.</Text>
          ) : report ? (
            <>
              {/* Compare / View Birth Charts */}
              <TouchableOpacity
                style={styles.compareBirthChartsBtn}
                onPress={handleCompareBirthChart}
                activeOpacity={0.75}
                disabled={computingSynastry}
              >
                <Text style={styles.compareBirthChartsBtnText}>
                  { "View Synastry Analysis"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>Weekly Advice</Text>
              <Text style={styles.reportSummary}>{report.advice}</Text>

              <Text style={styles.sectionLabel}>Weekly Forecast</Text>
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

      <ConsumablePlaceholder
        visible={showSynastryConsumable}
        kind="synastry"
        onClose={() => setShowSynastryConsumable(false)}
        onPurchased={() => {
          setSynastryConsumablePurchased(true);
          runSynastryCompare();
        }}
      />
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
  namesText: {
    color: "#B8A3FF",
    fontSize: moderateScale(18),
    fontWeight: "600",
    textAlign: "center",
    marginBottom: verticalScale(4),
  },
  relationshipBadge: {
    color: "rgba(255,255,255,0.45)",
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
  pendingAnimation: {
    width: moderateScale(220),
    height: moderateScale(220),
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
    marginBottom: verticalScale(20),
  },
  compareBirthChartsBtnText: {
    color: "#B8A3FF",
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
