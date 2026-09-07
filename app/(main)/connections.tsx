import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import React, { memo, useEffect, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DelalunaContainer from "@/src/components/shared/delaluna-container.component";
import HeaderNav from "@/src/components/shared/header-nav";
import PaygateOverlay from "@/src/components/shared/paygate-overlay.component";
import { ThemedText } from "@/src/components/themed-text";
import { ThemedView } from "@/src/components/themed-view";
import { CONNECTIONS_DEFINITION } from "@/src/constants/definitions";
import { useRevenueCat } from "@/src/context/revenuecat-context";
import { useUser } from "@/src/context/user-context";
import { useAdmin } from "@/src/context/admin-context";
import { ConnectionsCache } from "@/src/services/connections-cache.service";
import { Events } from "@/src/services/analytics.service";
import { recordError } from "@/src/services/crashlytics.service";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { getContentPadding } from "@/src/utils/layout";
import { db, functions } from "../../firebaseConfig";
import { logger } from "@/src/utils/logger";

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
      <Animated.View style={[animStyle, styles.itemWrapper]}>
        <ReanimatedSwipeable
          renderRightActions={renderRightActions}
          overshootRight={false}
          containerStyle={styles.swipeable}
        >
          <ThemedView style={[styles.connectionItem, isLocked && styles.connectionItemLocked]}>
            <TouchableOpacity
              onPress={() => (isLocked ? onLockedPress(connection.id) : onOpen(connection.id))}
              style={styles.connectionItemInner}
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

export default function ConnectionsScreen() {
  const { authUser, userDoc } = useUser();
  const { isPro } = useRevenueCat();
  const {
    premiumConnectionLimit: PREMIUM_CONNECTION_LIMIT,
  } = useAdmin();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  // Admins are unmetered, same carve-out as chat. The `admin` claim is the real
  // authority and `users/{uid}.isAdmin` is a mirror of it, but nothing is gated on
  // this server-side — the rules already let any verified owner write their own
  // connections — so a stale mirror only changes what this screen offers.
  const unmetered = !!userDoc?.isAdmin;

  // Connection allowance: Premium subscribers get PREMIUM_CONNECTION_LIMIT; free users get 0.
  const accessLimit = unmetered
    ? Number.POSITIVE_INFINITY
    : isPro
      ? PREMIUM_CONNECTION_LIMIT
      : 0;
  const canAddNew = connections.length < accessLimit;

  const presentUpgradePaywall = () => {
    router.push('/(settings)/paywall');
  };

  const handleOpenConnection = (connectionId: string) => {
    const conn = connections.find(c => c.connectionId === connectionId);
    router.push({
      pathname: "/connection/[id]",
      params: {
        id: connectionId,
        firstFirst: conn?.firstPerson?.firstName ?? "",
        firstLast: conn?.firstPerson?.lastName ?? "",
        secondFirst: conn?.secondPerson?.firstName ?? "",
        secondLast: conn?.secondPerson?.lastName ?? "",
      },
    });
  };

  const goToNewConnectionScreen = () => {
    if (!canAddNew) {
      if (isPro) {
        Alert.alert(
          'Connection limit reached',
          `You can save up to ${accessLimit} connections. Remove one to add a new one.`,
          [{ text: 'OK', style: 'cancel' }],
        );
      } else {
        Alert.alert(
          'Connections are a Premium feature',
          `Upgrade to Premium to save up to ${PREMIUM_CONNECTION_LIMIT} connections.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Upgrade', onPress: presentUpgradePaywall },
          ],
        );
      }
      return;
    }
    router.push("/connection/new");
  };

  const handleLockedPress = (connectionId?: string) => {
    const message = 'Connections are a Premium feature. Upgrade to read this connection, or delete it to clean up your list.';
    Alert.alert(
      'Connection locked',
      message,
      [
        { text: 'Cancel', style: 'cancel' },
        ...(connectionId
          ? [{ text: 'Delete', style: 'destructive' as const, onPress: () => handleDeleteConnection(connectionId) }]
          : []),
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
        logger.error("[connections] Firestore listener failed", err, "connections_listener");
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
          onPress: () => {
            const uid = authUser?.uid;
            if (!uid) return;
            const previous = connections;
            setConnections((prev) => prev.filter((c) => c.id !== connectionId));
            ConnectionsCache.remove(uid, connectionId);
            const deleteFn = httpsCallable(functions, "deleteConnection");
            deleteFn({ userId: uid, connectionId })
              .then(() => Events.connectionDeleted())
              .catch((err) => {
                logger.error("[connections] delete failed", err, "connection_delete");
                recordError(err, 'connection_delete');
                setConnections(previous);
                ConnectionsCache.save(uid, previous);
                Alert.alert("Error", "Failed to delete connection.");
              });
          },
        },
      ]
    );
  };

  

  const hasConnections = connections.length > 0;
  const isPaygated = accessLimit === 0;

  return (
    <Animated.View style={[styles.container, fadeStyle]}>
      <ThemedView style={styles.container}>
        <HeaderNav
          title="Connections"
          rightIconName={hasConnections && !isPaygated ? "add" : undefined}
          onRightPress={hasConnections && !isPaygated ? goToNewConnectionScreen : undefined}
        />
         <ThemedText type="definition" style={{ marginTop: headerHeight, paddingHorizontal: scale(10), paddingVertical: scale(25), textAlign: "center" }}>
            {CONNECTIONS_DEFINITION}
          </ThemedText>
        <PaygateOverlay
          locked={isPaygated}
          style={styles.paygateContainer}
          unlockTitle="Unlock Connections"
          unlockMessage="Upgrade to Premium to save and read compatibility connections."
          onUnlock={presentUpgradePaywall}
        >
        {hasConnections ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.listContainer,
              { paddingBottom: insets.bottom + verticalScale(60), paddingHorizontal: getContentPadding(screenWidth) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {connections.map((c, index) => (
              <AnimatedConnectionItem
                key={c.id}
                index={index}
                connection={c}
                isLocked={index < connections.length - accessLimit}
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
              {accessLimit === 0
                ? `${connections.length} connection${connections.length === 1 ? '' : 's'} locked — upgrade to unlock`
                : unmetered
                  ? `${connections.length} connection${connections.length === 1 ? '' : 's'} — unlimited`
                  : `${connections.length} of ${accessLimit} connections`}
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
        </PaygateOverlay>

      </ThemedView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: "100%" },
  paygateContainer: { flex: 1 },
  centered: { flex: 1, justifyContent: "space-around", alignItems: "center", padding: scale(15) },
  listContainer: { flexGrow: 1 }, // paddingHorizontal applied dynamically via getContentPadding(screenWidth)
  itemWrapper: {
    marginVertical: verticalScale(6),
    borderRadius: moderateScale(14),
    overflow: "hidden",
  },
  swipeable: {
    borderRadius: moderateScale(14),
    overflow: "hidden",
  },
  connectionItem: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  connectionItemInner: {
    padding: scale(16),
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flex: 1,
  },
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
