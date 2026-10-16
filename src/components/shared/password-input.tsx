import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { scale, moderateScale, verticalScale } from '@/src/utils/responsive';

interface PasswordInputProps extends Omit<TextInputProps, 'secureTextEntry'> {
  containerStyle?: ViewStyle;
}

/**
 * A TextInput with a show/hide toggle that never dismisses the keyboard.
 * The eye button uses `focusable={false}` so it doesn't steal input focus.
 */
const PasswordInput = forwardRef<TextInput, PasswordInputProps>(
  ({ containerStyle, style, ...props }, ref) => {
    const [isVisible, setIsVisible] = useState(false);
    const innerRef = useRef<TextInput>(null);
    useImperativeHandle(ref, () => innerRef.current as TextInput);

    const handleToggle = () => {
      const wasFocused = innerRef.current?.isFocused?.();
      setIsVisible(v => !v);
      // Toggling secureTextEntry drops focus on iOS — re-focus next frame
      // so the keyboard stays up and no frame-jump scroll is triggered.
      if (wasFocused) {
        requestAnimationFrame(() => innerRef.current?.focus());
      }
    };

    return (
      <View style={[styles.wrapper, containerStyle]}>
        <TextInput
          ref={innerRef}
          style={[styles.input, style]}
          secureTextEntry={!isVisible}
          // Placeholder text vanishes once typing starts, so it is not a label.
          accessibilityLabel={props.placeholder}
          {...props}
        />
        <TouchableOpacity
          style={styles.toggle}
          onPress={handleToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          focusable={false}
          accessibilityRole="button"
          accessibilityLabel={isVisible ? 'Hide password' : 'Show password'}
        >
          <Image
            source={
              isVisible
                ? require('@/src/assets/actions/visibility.png')
                : require('@/src/assets/actions/visibility_off.png')
            }
            style={styles.icon}
            resizeMode="contain"
            accessible={false}
          />
        </TouchableOpacity>
      </View>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
export default PasswordInput;

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(111,255,233,0.4)',
    borderRadius: moderateScale(12),
    paddingHorizontal: scale(16),
  },
  input: {
    flex: 1,
    paddingVertical: verticalScale(12),
    color: '#ffffff',
    fontSize: moderateScale(16),
  },
  toggle: {
    paddingLeft: scale(8),
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    width: moderateScale(22),
    height: moderateScale(22),
    tintColor: 'rgba(255,255,255,0.55)',
  },
});
