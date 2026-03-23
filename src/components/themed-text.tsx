import { Text, type TextProps } from 'react-native';

import { useResponsive } from '@/src/hooks/use-responsive';
import { useThemeColor } from '@/src/hooks/use-theme-color';
import { C } from '../constants/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'table';
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
