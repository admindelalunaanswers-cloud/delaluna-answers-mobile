import { useContext } from 'react';
import { View, type ViewProps } from 'react-native';

import { ThemeContext } from '@/src/context/theme-context';

export type ThemedViewVariant = 'transparent' | 'background' | 'card' | 'header';

export type ThemedViewProps = ViewProps & {
  variant?: ThemedViewVariant;
};

export function ThemedView({ style, variant = 'transparent', ...otherProps }: ThemedViewProps) {
  const { theme } = useContext(ThemeContext);

  const backgroundColor = (() => {
    switch (variant) {
      case 'background': return theme.colors.background as string;
      case 'header':     return theme.colors.headerBg;
      case 'card':       return theme.colors.overlay ?? `${theme.colors.headerBg}99`;
      default:           return 'transparent';
    }
  })();

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
