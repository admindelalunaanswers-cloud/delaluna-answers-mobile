// PronounToggle.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  LayoutChangeEvent,
  StyleProp,
  ViewStyle,
  TextStyle,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PRONOUNS = Platform.select({
  ios: ['She/Her', 'He/Him', 'They/\nThem', 'Non\nBinary'],
  android: ['She/Her', 'He/Him', 'They/Them', 'Non Binary'],
})!;

interface PronounToggleProps {
  selectedIndex: number;
  onChange: (newIndex: number) => void;
  clickable?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function PronounToggle({
  selectedIndex,
  onChange,
  clickable = true,
  style,
}: PronounToggleProps) {
  const [width, setWidth] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  };

  const segmentWidth = width / PRONOUNS.length;

  return (
    <LinearGradient
      colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0.0)']}
      start={[0, 0]}
      end={[0, 1]}
      style={[styles.outer, style]}
    >
      <View style={styles.inner} onLayout={onLayout}>
        {width > 0 && (
          <View
            style={[
              styles.slider,
              {
                width: segmentWidth,
                transform: [{ translateX: selectedIndex * segmentWidth }],
              },
            ]}
          />
        )}

        {PRONOUNS.map((label, i) => (
          <TouchableOpacity
            key={label}
            style={styles.segment}
            activeOpacity={0.8}
            disabled={!clickable}
            onPress={() => {
              if (clickable) onChange(i);
            }}
          >
            <Text
              style={[
                styles.text,
                i === selectedIndex && styles.textSelected,
                {textAlign: 'center'}
              ]}
            numberOfLines={2}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create<{
  outer: ViewStyle;
  inner: ViewStyle;
  slider: ViewStyle;
  segment: ViewStyle;
  text: TextStyle;
  textSelected: TextStyle;
}>({
  outer: {
    borderRadius: 30,
    padding: 3,
    marginVertical: 12,
    width: '100%',
    alignSelf: 'center',
    minHeight: 64,
  },
  inner: {
    flexDirection: 'row',
    position: 'relative',
    borderRadius: 25,
    minHeight: 64 - 6,
  },
  slider: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    backgroundColor: '#FFF',
    borderRadius: 25,
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#EEE',
    fontWeight: '600',
  },
  textSelected: {
    color: '#1C2541',
    fontWeight: '700',
  },
});
