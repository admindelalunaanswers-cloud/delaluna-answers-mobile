import { PropsWithChildren, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useTheme } from '@/src/hooks/use-theme';
import { useResponsive } from '@/src/hooks/use-responsive';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme } = useTheme();
  const { scale, moderateScale } = useResponsive();

  return (
    <ThemedView>
      <TouchableOpacity
        style={[styles.heading, { gap: scale(6) }]}
        onPress={() => setIsOpen(v => !v)}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={moderateScale(18)}
          color={theme.colors.primary}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />
        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && (
        <ThemedView style={{ marginTop: scale(6), marginLeft: scale(24) }}>
          {children}
        </ThemedView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
