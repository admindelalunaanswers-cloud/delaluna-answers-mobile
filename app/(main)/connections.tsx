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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { db, functions } from "../../firebaseConfig";
import { scale, verticalScale, moderateScale } from "@/src/utils/responsive";
import { useUser } from "@/src/context/user-context";
import HeaderNav from "@/src/components/shared/header-nav";
import DelalunaContainer from "@/src/components/shared/delaluna-container.component";
import { ThemedView } from "@/src/components/themed-view";

const NAV_BAR_HEIGHT = 44;

const AnimatedConnectionItem = memo(
  ({ index, connection, onOpen, onDelete }: any) => {
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
          <TouchableOpacity onPress={() => onOpen(connection.id)} style={styles.connectionItem}>
            <Text style={styles.connectionName}>{connection.name ?? connection.id}</Text>
          </TouchableOpacity>
        </ReanimatedSwipeable>
      </Animated.View>
    );
  }
);

export default function ConnectionsScreen() {
  const { authUser } = useUser();
  const insets = useSafeAreaInsets();

  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const headerHeight = insets.top + verticalScale(NAV_BAR_HEIGHT);

  const handleOpenConnection = (connectionId: string) => {
    router.push({ pathname: "/connection/[id]", params: { id: connectionId } });
  };

  const goToNewConnectionScreen = () =>
    router.push("/connection/new");

  useEffect(() => {
    fade.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
  }, []);


  useEffect(() => {
    if (!authUser?.uid) return;
    const ref = collection(db, "users", authUser.uid, "connections");
    const q = query(ref, orderBy("createTime", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setConnections(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        console.log("Connections snapshot received:", snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoading(false);
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

        {hasConnections ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={[
              styles.listContainer,
              { marginTop: headerHeight, paddingBottom: insets.bottom + verticalScale(60) },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {connections.map((c, index) => (
              <AnimatedConnectionItem
                key={c.id}
                index={index}
                connection={c}
                onOpen={handleOpenConnection}
                onDelete={handleDeleteConnection}
              />
            ))}
          </ScrollView>
        ) : (
          <ThemedView style={[styles.centered, { marginTop: headerHeight }]}>
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
  listContainer: { flexGrow: 1, paddingHorizontal: scale(15), paddingTop: verticalScale(20) },
  connectionItem: { padding: scale(16) },
  connectionName: { color: "#fff", fontSize: moderateScale(16) },
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
});
