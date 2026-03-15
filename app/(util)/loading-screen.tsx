import React, { useContext, useEffect, useRef, useState } from 'react';
import { Animated, ImageBackground, StatusBar, StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

import { ThemeContext } from '@/src/context/theme-context';
import { ThemedText } from '@/src/components/themed-text';
import { moderateScale, verticalScale } from '@/src/utils/responsive';

const CYCLING_MESSAGES = [
  'Reading the stars for you...',
  'Consulting planetary alignments...',
  'Mapping your celestial blueprint...',
  'Decoding cosmic patterns...',
  'Aligning houses and aspects...',
  'Channeling the cosmos...',
  'Calculating your natal placements...',
  'The universe has a message for you...',
  'Tracing the path of the planets...',
  'Interpreting celestial wisdom...',
];

const MESSAGE_INTERVAL_MS = 3000;
const FADE_DURATION_MS = 400;

type LoadingScreenProps = {
  progress?: number; // 0 to 1
  message?: string;
};

const LoadingScreen: React.FC<LoadingScreenProps> = ({ progress, message }) => {
  const { theme } = useContext(ThemeContext);
  const [msgIndex, setMsgIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (message) return; // static message — no cycling needed

    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_DURATION_MS,
        useNativeDriver: true,
      }).start(() => {
        setMsgIndex(i => (i + 1) % CYCLING_MESSAGES.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_DURATION_MS,
          useNativeDriver: true,
        }).start();
      });
    }, MESSAGE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [message, fadeAnim]);

  const displayMessage = message ?? CYCLING_MESSAGES[msgIndex];

  return (
    <ImageBackground source={theme.backgroundImage} style={styles.background}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.centerContent}>
        <LottieView
          source={require('@/src/assets/animations/splash-loop.json')}
          autoPlay
          loop
          style={styles.animation}
        />
        <Animated.View style={{ opacity: message ? 1 : fadeAnim }}>
          <ThemedText style={styles.message}>{displayMessage}</ThemedText>
        </Animated.View>
        {progress !== undefined && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 1) * 100}%` }]} />
          </View>
        )}
      </View>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    alignItems: 'center',
    width: '80%',
    gap: verticalScale(12),
  },
  animation: {
    width: moderateScale(450),
    height: moderateScale(450),
  },
  message: {
    color: '#ffffff',
    fontSize: moderateScale(16),
    textAlign: 'center',
    opacity: 0.85,
  },
  progressTrack: {
    width: '100%',
    height: verticalScale(4),
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 999,
  },
});

export default LoadingScreen;
