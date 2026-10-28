import { type TextProps } from 'react-native';
import { Text } from '@/src/components/app-text';

import { useResponsive } from '@/src/hooks/use-responsive';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { verticalScale } from '@/src/utils/responsive';
import { C } from '../constants/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?:
    | 'default'
    | 'title'
    | 'defaultSemiBold'
    | 'subtitle'
    | 'link'
    | 'table'
    | 'definition'
    | 'question'
    | 'sectionDefinition';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');
  const { moderateScale } = useResponsive();

  const typeStyle = (() => {
    switch (type) {
      case 'title':
        return { fontSize: moderateScale(32), fontWeight: 'bold' as const, lineHeight: moderateScale(38), color: C.white };
      case 'subtitle':
        return { fontSize: moderateScale(20), fontWeight: 'bold' as const };
      case 'defaultSemiBold':
        return { fontSize: moderateScale(16), lineHeight: moderateScale(24), color: C.white, fontWeight: '600' as const };
      case 'link':
        return { fontSize: moderateScale(16), lineHeight: moderateScale(30), color: '#0a7ea4' };
      case 'table':
        return { fontSize: moderateScale(16), lineHeight: moderateScale(14) };
      case 'definition':
        return {
          marginTop: verticalScale(16),
          fontSize: moderateScale(14),
          color: 'rgba(255,255,255,0.6)',
          textAlign: 'center' as const,
          marginBottom: verticalScale(16),
          alignSelf: 'stretch' as const,
        };
      case 'question':
        return {
          borderWidth: 1,
          borderColor: 'rgba(188,168,244,0.35)',
          borderRadius: 20,
          paddingVertical: 10,
          paddingHorizontal: 16,
          marginBottom: 24,
          backgroundColor: 'rgba(188,168,244,0.07)',
        };
      case 'sectionDefinition':
        return {
          color: 'rgba(255,255,255,0.4)',
          fontSize: 12,
          lineHeight: 18,
          marginTop: -8,
          marginBottom: 8,
          textAlign: 'center' as const,
        };
      default:
        return { fontSize: moderateScale(16), lineHeight: moderateScale(24) };
    }
  })();

  return (
    <Text
      style={[{ color }, typeStyle, style]}
      {...rest}
    />
  );
}
