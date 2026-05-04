import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db } from "@/firebaseConfig";
import HeaderNav from "@/src/components/shared/header-nav";
import { ThemedText } from "@/src/components/themed-text";
import { ThemedView } from "@/src/components/themed-view";
import { useUser } from "@/src/context/user-context";
import { calculateNatalChart } from "@/src/services/astroEngine";
import { NavigationStore } from "@/src/stores/navigation-store";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";

const NAV_BAR_HEIGHT = 44;

interface PersonInfo {
  firstName?: string;
  lastName?: string;
  birthday?: string;
  timeOfBirth?: string;
  birthLat?: number;
  birthLon?: number;
  birthTimezone?: number;
}

interface ConnectionDoc {
  id: string;
  firstPerson?: PersonInfo;
  secondPerson?: PersonInfo;
  relationshipType?: string;
  synastryUnlocked?: boolean;
}

// ─── Birth-param parsing (shared shape with connection/[id]/index.tsx) ──────

function parseBirthParams(p: PersonInfo) {
  const raw = (p.birthday ?? "").trim();
  let year: number, month: number, day: number;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) {
    [year, month, day] = raw.split("-").map(Number);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
    [month, day, year] = raw.split("/").map(Number);
  } else {
    throw new Error(`Invalid birthday format: "${raw}"`);
  }

  let hour = 0, minute = 0;
  const timeRaw = (p.timeOfBirth ?? "").trim();
  const ampm = timeRaw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number(ampm[1]);
    minute = Number(ampm[2]);
    if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    hour = h;
  } else if (/^\d{1,2}:\d{2}$/.test(timeRaw)) {
    const [h, m] = timeRaw.split(":").map(Number);
    hour = h;
    minute = m;
  }

  return {
    year, month, day, hour, minute,
    lat: p.birthLat ?? 0,
    lon: p.birthLon ?? 0,
    timezone: p.birthTimezone ?? 0,
  };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ReportItem({
  connection,
  index,
  onOpen,
  busy,
}: {
  connection: ConnectionDoc;
  index: number;
  onOpen: (c: ConnectionDoc) => void;
  busy: boolean;
}) {
  const fade = useSharedValue(0);
  const slide = useSharedValue(verticalScale(10));

  useEffect(() => {
    const delay = index * 70;
    fade.value = withDelay(delay, withTiming(1, { duration: 300 }));
    slide.value = withDelay(
      delay,
      withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: slide.value }],
  }));

  const fp = connection.firstPerson;
  const sp = connection.secondPerson;
  const firstName = `${fp?.firstName ?? ""} ${fp?.lastName ?? ""}`.trim() || "Person 1";
  const secondName = `${sp?.firstName ?? ""} ${sp?.lastName ?? ""}`.trim() || "Person 2";

  return (
    <Animated.View style={[animStyle, styles.itemWrapper]}>
      <ThemedView style={styles.item}>
        <TouchableOpacity
          onPress={() => onOpen(connection)}
          style={styles.itemInner}
          activeOpacity={0.75}
          disabled={busy}
        >
          <View style={styles.namesBlock}>
            <Text style={styles.name} numberOfLines={1}>{firstName}</Text>
            <Ionicons
              name="heart"
              size={moderateScale(14)}
              color="#fff"
              style={styles.heartIcon}
            />
            <Text style={styles.name} numberOfLines={1}>{secondName}</Text>
          </View>
          {connection.relationshipType ? (
            <Text style={styles.relType}>
              {connection.relationshipType.toUpperCase()}
            </Text>
          ) : null}
          {busy ? (
            <ActivityIndicator size="small" color="#B8A3FF" style={styles.chevron} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={moderateScale(18)}
              color="rgba(255,255,255,0.6)"
              style={styles.chevron}
            />
          )}
        </TouchableOpacity>
      </ThemedView>
    </Animated.View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function PurchasedReportsScreen() {
  const { authUser } = useUser();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const [reports, setReports] = useState<ConnectionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser?.uid) return;
    const ref = collection(db, "users", authUser.uid, "connections");
    const q = query(ref, orderBy("createTime", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const all: ConnectionDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ConnectionDoc, "id">),
        }));
        setReports(all.filter((c) => c.synastryUnlocked === true));
        setLoading(false);
      },
      (err) => {
        console.error("[purchased-reports] listener error:", err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [authUser?.uid]);

  const handleOpen = async (c: ConnectionDoc) => {
    const fp = c.firstPerson;
    const sp = c.secondPerson;
    if (!fp?.birthday || !sp?.birthday) {
      console.warn("[purchased-reports] missing birthday on connection", c.id);
      return;
    }

    setOpeningId(c.id);
    try {
      const chartA = await calculateNatalChart(parseBirthParams(fp));
      const chartB = await calculateNatalChart(parseBirthParams(sp));
      NavigationStore.setSynastryAnalysis({
        chartA,
        chartB,
        nameA: `${fp.firstName ?? ""} ${fp.lastName ?? ""}`.trim(),
        nameB: `${sp.firstName ?? ""} ${sp.lastName ?? ""}`.trim(),
      });
      router.push(`/connection/${c.id}/synastry`);
    } catch (err) {
      console.error("[purchased-reports] failed to open synastry", err);
    } finally {
      setOpeningId(null);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Purchased Reports"
        leftIconName="arrow-back"
        onLeftPress={() => router.back()}
      />

      <View style={[styles.body, { marginTop: headerHeight }]}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" color="#B8A3FF" />
          </View>
        ) : reports.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons
              name="sparkles-outline"
              size={moderateScale(36)}
              color="rgba(184,163,255,0.55)"
              style={{ marginBottom: verticalScale(12) }}
            />
            <ThemedText type="definition" style={styles.emptyTitle}>
              No purchased reports yet
            </ThemedText>
            <Text style={styles.emptySub}>
              Synastry reports you unlock will appear here.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + verticalScale(60) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {reports.map((c, i) => (
              <ReportItem
                key={c.id}
                connection={c}
                index={i}
                onOpen={handleOpen}
                busy={openingId === c.id}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </ThemedView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  body: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(40),
  },
  emptyTitle: {
    textAlign: "center",
    marginBottom: verticalScale(6),
  },
  emptySub: {
    color: "rgba(255,255,255,0.55)",
    fontSize: moderateScale(13),
    textAlign: "center",
    lineHeight: moderateScale(20),
  },
  list: {
    paddingHorizontal: scale(15),
    paddingTop: verticalScale(10),
  },
  itemWrapper: {
    marginVertical: verticalScale(6),
    borderRadius: moderateScale(14),
    overflow: "hidden",
  },
  item: {
    borderRadius: moderateScale(14),
  },
  itemInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(16),
  },
  namesBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  name: {
    color: "#fff",
    fontSize: moderateScale(15),
    fontWeight: "600",
    flexShrink: 1,
  },
  heartIcon: {
    marginHorizontal: scale(8),
  },
  relType: {
    color: "rgba(255,255,255,0.45)",
    fontSize: moderateScale(10),
    letterSpacing: 1.2,
    marginRight: scale(8),
  },
  chevron: {
    marginLeft: scale(4),
  },
});
