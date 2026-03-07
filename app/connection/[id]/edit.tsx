import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db, functions } from "@/firebaseConfig";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";
import { useUser } from "@/src/context/user-context";
import HeaderNav from "@/src/components/shared/header-nav";
import { GlassButton } from "@/src/assets/buttons/glass-button";

const NAV_BAR_HEIGHT = 44;

const RELATIONSHIP_OPTIONS = [
  {
    value: "consistent",
    icon: require("@/src/assets/connections/satisfied_icon.png"),
  },
  {
    value: "it's complicated",
    icon: require("@/src/assets/connections/neutral_icon.png"),
  },
  {
    value: "toxic",
    icon: require("@/src/assets/connections/dissatisfied_icon.png"),
  },
];

export default function EditConnectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { authUser } = useUser();
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connectionData, setConnectionData] = useState<any>(null);
  const [relationshipType, setRelationshipType] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser?.uid || !id) return;

    const ref = doc(db, "users", authUser.uid, "connections", id);
    getDoc(ref).then((snap) => {
      if (!snap.exists()) {
        Alert.alert("Error", "Connection not found.");
        router.back();
        return;
      }
      const data = snap.data();
      setConnectionData(data);
      setRelationshipType(data.relationshipType ?? null);
      setLoading(false);
    }).catch(() => {
      Alert.alert("Error", "Failed to load connection.");
      router.back();
    });
  }, [authUser?.uid, id]);

  const handleSave = async () => {
    if (!relationshipType) {
      Alert.alert("Missing Relationship Type", "Please select a relationship type.");
      return;
    }

    setSaving(true);
    try {
      const updateFn = httpsCallable(functions, "updateConnection");
      await updateFn({ userId: authUser?.uid, connectionId: id, relationshipType });
      router.replace({ pathname: "/connection/[id]", params: { id: id! } });
    } catch (err) {
      console.error("Error updating connection:", err);
      Alert.alert("Error", "Failed to save changes.");
      setSaving(false);
    }
  };

  const handleCancel = () => router.back();

  const firstName = connectionData?.firstPerson?.firstName || "Person 1";
  const secondName = connectionData?.secondPerson?.firstName || "Person 2";

  if (loading) {
    return (
      <View style={styles.wrapper}>
        <HeaderNav
          title="Edit Connection"
          rightLabel="Cancel"
          onRightPress={handleCancel}
        />
        <View style={[styles.centered, { marginTop: headerHeight }]}>
          <ActivityIndicator size="large" color="#C77DFF" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <HeaderNav
        title="Edit Connection"
        rightLabel="Cancel"
        onRightPress={handleCancel}
      />

      <View style={[styles.content, { marginTop: headerHeight }]}>
        {/* Names summary */}
        <View style={styles.namesCard}>
          <Text style={styles.namesText}>{firstName} & {secondName}</Text>
        </View>

        {/* Relationship type */}
        <Text style={styles.sectionLabel}>RELATIONSHIP TYPE</Text>
        <View style={styles.divider} />

        <View style={styles.relationshipRow}>
          {RELATIONSHIP_OPTIONS.map(({ value, icon }) => (
            <TouchableOpacity
              key={value}
              style={[
                styles.relationshipButton,
                relationshipType === value && styles.relationshipSelected,
              ]}
              onPress={() => setRelationshipType(value)}
              activeOpacity={0.8}
            >
              <Image
                source={icon}
                style={[
                  styles.relationshipIcon,
                  relationshipType === value && styles.relationshipIconSelected,
                ]}
                resizeMode="contain"
              />
              <Text style={[
                styles.optionLabel,
                relationshipType === value && styles.optionLabelSelected,
              ]}>
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <GlassButton title={saving ? "Saving..." : "Save"} onPress={handleSave} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(24),
  },
  namesCard: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: scale(12),
    paddingVertical: verticalScale(16),
    alignItems: "center",
    marginBottom: verticalScale(28),
  },
  namesText: {
    color: "#B8A3FF",
    fontSize: moderateScale(18),
    fontWeight: "600",
  },
  sectionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: moderateScale(11),
    letterSpacing: 1,
    marginBottom: verticalScale(8),
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: verticalScale(20),
  },
  relationshipRow: {
    flexDirection: "row",
    gap: scale(10),
    height: verticalScale(100),
  },
  relationshipButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
    gap: verticalScale(6),
  },
  relationshipSelected: {
    backgroundColor: "rgba(142,68,173,0.7)",
    borderColor: "#FFFFFF",
  },
  relationshipIcon: {
    width: scale(48),
    height: scale(48),
    opacity: 0.8,
    tintColor: "rgba(255,255,255,0.85)",
  },
  relationshipIconSelected: {
    opacity: 1,
    tintColor: "#FFFFFF",
  },
  optionLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: moderateScale(10),
    textAlign: "center",
  },
  optionLabelSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    marginTop: verticalScale(36),
    alignItems: "center",
  },
});
