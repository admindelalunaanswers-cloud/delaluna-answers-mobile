import React, { useEffect, useState, memo } from "react";
import { router } from "expo-router";
import {
  Image,
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  TouchableOpacity,
  Alert,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { httpsCallable } from "firebase/functions";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { initialWindowSafeAreaInsets, useSafeAreaInsets } from "react-native-safe-area-context";

import { db, functions } from "../../firebaseConfig";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";
import { useUser } from "@/src/context/user-context";
import { useRevenueCat } from "@/src/context/revenuecat-context";
import HeaderNav from "@/src/components/shared/header-nav";
import DelalunaContainer from "@/src/components/shared/delaluna-container.component";
import { ThemedView } from "@/src/components/themed-view";
import { ConnectionsCache, connectionDisplayName } from "@/src/services/connections-cache.service";
import { ThemedText } from "@/src/components/themed-text";
import { CONNECTIONS_DEFINITION } from "@/src/constants/definitions";

const NAV_BAR_HEIGHT = 44;

const AnimatedConnectionItem = memo(
  ({ index, connection, isLocked, onOpen, onDelete, onLockedPress }: any) => {
    const itemFade = useSharedValue(0);
    const itemSlide = useSharedValue(verticalScale(10));

    useEffect(() => {
      const delay = index * 70;
      itemFade.value = withDelay(delay, withTiming(1, { duration: 300 }));
      itemSlide.value = withDelay(
        delay,
        withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) })
      );
    }, []);

    const animStyle = useAnimatedStyle(() => ({
      opacity: itemFade.value,
      transform: [{ translateY: itemSlide.value }],
    }));

    const renderRightActions = () => (
      <View style={styles.deleteActionContainer}>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDelete(connection.id)}
          activeOpacity={0.8}
        >
          <Ionicons name="trash-outline" size={moderateScale(22)} color="#fff" />
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    );

    return (
      <Animated.View style={animStyle}>
        <ReanimatedSwipeable renderRightActions={renderRightActions} overshootRight={false}>
          <ThemedView style={[styles.connectionItem, isLocked && styles.connectionItemLocked]}>
            <TouchableOpacity
              onPress={() => (isLocked ? onLockedPress() : onOpen(connection.id))}
              style={styles.connectionItem}
              activeOpacity={0.75}
            >
              <Text
                style={[styles.connectionName, isLocked && styles.connectionNameLocked]}
                numberOfLines={1}
              >
                {connection.firstPerson?.firstName} {connection.firstPerson?.lastName}{' '}
              </Text>
              <Ionicons
                name={isLocked ? 'lock-closed' : 'heart'}
                size={moderateScale(20)}
                color={isLocked ? 'rgba(255,255,255,0.55)' : '#fff'}
              />
              <Text
                style={[styles.connectionName, isLocked && styles.connectionNameLocked]}
                numberOfLines={1}
              >
                {' '}
                {connection.secondPerson?.firstName} {connection.secondPerson?.lastName}
              </Text>
            </TouchableOpacity>
          </ThemedView>
        </ReanimatedSwipeable>
      </Animated.View>
    );
  }
);

const FREE_CONNECTION_LIMIT = 3;
const PREMIUM_CONNECTION_LIMIT = 10;

export default function ConnectionsScreen() {
  const { authUser } = useUser();
  const { isPro } = useRevenueCat();
  const insets = useSafeAreaInsets();

  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const accessLimit = isPro ? PREMIUM_CONNECTION_LIMIT : FREE_CONNECTION_LIMIT;
  const canAddNew = connections.length < accessLimit;

  const presentUpgradePaywall = () => {
    router.push('/(settings)/paywall');
  };

  const handleOpenConnection = (connectionId: string) => {
    router.push({ pathname: "/connection/[id]", params: { id: connectionId } });
  };

  const goToNewConnectionScreen = () => {
    if (!canAddNew) {
      if (isPro) {
        Alert.alert(
          'Connection limit reached',
          `You can save up to ${PREMIUM_CONNECTION_LIMIT} connections. Remove one to add a new one.`,
        );
      } else {
        Alert.alert(
          'Connection limit reached',
          `Free accounts can save up to ${FREE_CONNECTION_LIMIT} connections. Remove one to free up a slot, or upgrade to Premium for up to ${PREMIUM_CONNECTION_LIMIT}.`,
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Upgrade', onPress: presentUpgradePaywall },
          ],
        );
      }
      return;
    }
    router.push("/connection/new");
  };

  const handleLockedPress = () => {
    Alert.alert(
      'Connection locked',
      `Free accounts can access ${FREE_CONNECTION_LIMIT} connections. Remove a connection to unlock another, or upgrade to Premium.`,
      [
        { text: 'OK', style: 'cancel' },
        { text: 'Upgrade', onPress: presentUpgradePaywall },
      ],
    );
  };

  useEffect(() => {
    fade.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, []);


  useEffect(() => {
    if (!authUser?.uid) return;
    const uid = authUser.uid;

    // Show cached data immediately so the list is never empty on mount
    ConnectionsCache.load(uid).then((cached) => {
      if (cached.length > 0) {
        setConnections(cached);
        setLoading(false);
      }
    });

    const ref = collection(db, "users", uid, "connections");
    const q = query(ref, orderBy("createTime", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fresh = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setConnections(fresh);
        setLoading(false);
        ConnectionsCache.save(uid, fresh);
      },
      (err) => {
        console.error("Firestore listener error:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [authUser?.uid]);

  const handleDeleteConnection = async (connectionId: string) => {
    Alert.alert(
      "Remove Connection",
      "Are you sure you want to remove this connection?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Remove",
          style: "destructive",
          onPress: async () => {
            try {
              const deleteFn = httpsCallable(functions, "deleteConnection");
              await deleteFn({ userId: authUser?.uid, connectionId });
              setConnections((prev) => prev.filter((c) => c.id !== connectionId));
              if (authUser?.uid) ConnectionsCache.remove(authUser.uid, connectionId);
            } catch (err) {
              console.error("Error deleting connection:", err);
              Alert.alert("Error", "Failed to delete connection.");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const hasConnections = connections.length > 0;

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <ThemedView style={styles.container}>
        <HeaderNav
          title="Connections"
          rightIconName={hasConnections ? "add" : undefined}
          onRightPress={hasConnections ? goToNewConnectionScreen : undefined}
        />
         <ThemedText type="definition" style={{ marginTop: headerHeight, paddingHorizontal: scale(10), paddingVertical: scale(25), textAlign: "center" }}>
            {CONNECTIONS_DEFINITION}
          </ThemedText>
        {hasConnections ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.listContainer,
              { paddingBottom: insets.bottom + verticalScale(60) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {connections.map((c, index) => (
              <AnimatedConnectionItem
                key={c.id}
                index={index}
                connection={c}
                isLocked={!isPro && index < connections.length - FREE_CONNECTION_LIMIT}
                onOpen={handleOpenConnection}
                onDelete={handleDeleteConnection}
                onLockedPress={handleLockedPress}
              />
            ))}
            {/* Placeholder slots for remaining capacity */}
            {canAddNew && Array.from({ length: Math.min(accessLimit - connections.length, 3) }).map((_, i) => (
              <TouchableOpacity
                key={`placeholder-${i}`}
                style={styles.placeholderItem}
                onPress={goToNewConnectionScreen}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={moderateScale(20)} color="rgba(255,255,255,0.3)" />
                <Text style={styles.placeholderText}>Add Connection</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.slotCounter}>
              {connections.length} of {accessLimit} connections
            </Text>
          </ScrollView>
        ) : (
          <ThemedView style={[styles.centered]}>
            <DelalunaContainer style={{ padding: scale(10), marginBottom: verticalScale(20) }}>
              <TouchableOpacity
                onPress={goToNewConnectionScreen}
                accessibilityLabel="Add Connection"
                style={styles.addButton}>
                <Image
                  source={require("@/src/assets/actions/add_circle_icon.png")}
                  style={styles.icon}
                />
                <Text style={styles.addText}>Add Connection</Text>
              </TouchableOpacity>
            </DelalunaContainer>
          </ThemedView>
        )}
      </ThemedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  centered: { flex: 1, justifyContent: "space-around", alignItems: "center", padding: scale(15) },
  listContainer: { flexGrow: 1, paddingHorizontal: scale(15),  },
  connectionItem: { padding: scale(16), flexDirection: "row",
    justifyContent: "center", },
  connectionItemLocked: { opacity: 0.55 },
  connectionName: { color: "#fff", fontSize: moderateScale(16) },
  connectionNameLocked: { color: "rgba(255,255,255,0.55)" },
  addConnectionText: { color: "#fff", fontSize: moderateScale(16) },
  deleteActionContainer: { justifyContent: "center" },
  deleteButton: {
    backgroundColor: "rgba(255,0,60,0.85)",
    justifyContent: "center",
    alignItems: "center",
    width: scale(90),
    height: "100%",
    borderTopRightRadius: moderateScale(10),
    borderBottomRightRadius: moderateScale(10),
  },
  deleteText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: moderateScale(15),
    marginTop: verticalScale(5),
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(10),
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(20),
  },
  icon: {
    width: scale(24),
    height: scale(24),
    tintColor: "#fff",
    resizeMode: "contain",
  },
  addText: {
    color: "#fff",
    fontSize: moderateScale(18),
    fontWeight: "600",
  },
  placeholderItem: {
    padding: scale(16),
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: scale(8),
    borderWidth: 1,
    borderStyle: "dashed" as const,
    borderColor: "rgba(255,255,255,0.15)",
    borderRadius: moderateScale(10),
    marginTop: verticalScale(8),
  },
  placeholderText: {
    color: "rgba(255,255,255,0.3)",
    fontSize: moderateScale(14),
  },
  slotCounter: {
    color: "rgba(255,255,255,0.35)",
    fontSize: moderateScale(12),
    textAlign: "center" as const,
    marginTop: verticalScale(12),
  },
});
