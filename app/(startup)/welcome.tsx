import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import React from 'react';
import { ImageBackground, StyleSheet, useWindowDimensions, View } from 'react-native';

import PrimaryButton from '@/src/assets/buttons/primary-button-component';
import SecondaryButton from '@/src/assets/buttons/secondary-button-component';
import ButtonText from '@/src/components/typography/button-text';
import { scale, verticalScale } from '@/src/utils/responsive';
import { StatusBar } from 'expo-status-bar';


export default function Welcome() {
  const { width } = useWindowDimensions();
  const logoW = Math.min(width * 0.72, scale(360));
  const logoH = logoW * 0.95; // adjust to your logo aspect

  return (
    <View style={styles.container}>
      <StatusBar>

      </StatusBar>
      {/* background image */}
      <ImageBackground
        source={require('@/src/assets/start-up/welcome-background.jpg')}
        style={styles.background}
        resizeMode="cover"
      />

      {/* TOP: animation fills, logo centered on top */}
      <View pointerEvents="none" style={styles.topContainer}>
        <LottieView
          source={require('@/src/assets/animations/galaxy.json')}
          autoPlay
          loop
          style={styles.topAnimation}  // absolute fill inside top container
        /> 
        {/* centered logo (over the animation) */}
        <View pointerEvents="none" style={styles.logoWrap}>
          
         <LottieView
          source={require('@/src/assets/animations/logo.json')}
          autoPlay
          loop={false}
          style={{ width: '100%', aspectRatio: 0.95 / 2}}
        />
        </View>
      </View>

      {/* BOTTOM: buttons */}
      <View style={styles.bottomContainer}>
        <PrimaryButton
          title="Get Started"
          onPress={() => router.replace('/sign-up')}
        />

        <View style={styles.divider} />

        <ButtonText>
          <SecondaryButton
            title="Already a member?"
            linkString="Log In"
            onPress={() => router.replace('/login')}
          />
        </ButtonText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1 },
  background: { ...StyleSheet.absoluteFillObject },

  topContainer: {
    flex: 3.5,                 // keep logo centered here
    position: 'relative',
    paddingBottom: verticalScale(75),   // ↓ was larger; reduces gap
  },

  bottomContainer: {
    flex: 2,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: verticalScale(75),
    paddingBottom: verticalScale(30),
    gap: verticalScale(15),
    paddingHorizontal: scale(24),

    // pull the whole block upward
    marginTop: -verticalScale(90),   // ↑ increase magnitude to move closer
  },
  // animation fills top container
  topAnimation: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },

  // center the logo in the middle of the top container
  logoWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  divider: {
    width: '80%',
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D4D6DD',
    marginVertical: verticalScale(15), // was 20
  },
});
