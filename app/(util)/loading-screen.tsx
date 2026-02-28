import React, { useContext } from 'react';
import { View, ImageBackground, StyleSheet, StatusBar } from 'react-native';
import LottieView from 'lottie-react-native';

import { ThemeContext } from '@/src/context/theme-context';
import { ThemedText } from '@/src/components/themed-text';
import { moderateScale, verticalScale } from '@/src/utils/responsive';

type LoadingScreenProps = {
  progress?: number; // 0 to 1
  message?: string;
};

const LoadingScreen: React.FC<LoadingScreenProps> = ({ progress, message }) => {
  const { theme } = useContext(ThemeContext);

  return (
    <ImageBackground source={theme.backgroundImage} style={styles.background}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.centerContent}>
        <LottieView
          source={require('@/src/assets/animations/galaxy.json')}
          autoPlay
          loop
          style={styles.animation}
        />
        <ThemedText style={styles.message}>{message ?? 'Loading...'}</ThemedText>
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
    width: moderateScale(160),
    height: moderateScale(160),
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
