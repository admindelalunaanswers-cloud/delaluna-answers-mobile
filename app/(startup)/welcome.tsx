import { router } from "expo-router";
import LottieView from "lottie-react-native";
import { useRef } from "react";
import {
  ImageBackground,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";

import PrimaryButton from "@/src/assets/buttons/primary-button-component";
import { scale, verticalScale } from "@/src/utils/responsive";
import { LinearGradient } from "expo-linear-gradient";

export default function Welcome() {
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.72, scale(360));
  const galaxyRef = useRef<LottieView>(null);

  const handleGetStarted = () => {
    galaxyRef.current?.pause();
    setTimeout(() => router.replace("/sign-up"), 120);
  };

  return (
    <ImageBackground
      source={require("@/src/assets/start-up/welcome-background.jpg")}
      style={styles.container}
      resizeMode="cover"
    >
      <View pointerEvents="none" style={styles.topContainer}>
        <LottieView
          ref={galaxyRef}
          source={require("@/src/assets/animations/galaxy.json")}
          autoPlay
          loop
          style={styles.topAnimation}
        />
        <View pointerEvents="none" style={styles.logoWrap}>
          <LottieView
            source={require("@/src/assets/animations/logo.json")}
            autoPlay
            loop={false}
            style={{ width: "100%", height: "100%" }}
          />
        </View>
      </View>

      <LinearGradient
        pointerEvents="none"
        colors={["transparent", "rgba(10,9,24,0.55)", "rgba(10,9,24,0.85)"]}
        locations={[0, 0.35, 1]}
        style={styles.scrim}
      />

      <View style={styles.bottomContainer}>
        <View style={styles.card}>
          <PrimaryButton title="Get Started" onPress={handleGetStarted} />
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topContainer: {
    flex: 3.5,
    position: "relative",
    paddingBottom: verticalScale(75),
  },
  bottomContainer: {
    flex: 2,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: verticalScale(75),
    paddingBottom: verticalScale(30),
    gap: verticalScale(15),
    paddingHorizontal: scale(24),
    marginTop: -verticalScale(90),
  },
  topAnimation: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  logoWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
  },
  divider: {
    width: "80%",
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#D4D6DD",
    marginVertical: verticalScale(15),
  },
  card: {
    width: "100%",
    backgroundColor: "#0A0918",
    borderRadius: scale(12),
    paddingVertical: verticalScale(20),
    paddingHorizontal: scale(24),
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
  },
});
