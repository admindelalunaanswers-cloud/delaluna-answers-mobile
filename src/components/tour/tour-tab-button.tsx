// expo-router 57 ships its own copy of React Navigation; the `@react-navigation`
// packages are a different copy whose types (and button) don't match its Tabs.
import { PlatformPressable } from 'expo-router/react-navigation';
import type { BottomTabBarButtonProps } from 'expo-router/tabs';
import { StyleSheet } from 'react-native';

import { TourTarget } from '@/src/components/tour/tour-target';

/**
 * A tab bar button registered as a tour target, so the spotlight rings the
 * whole tab square rather than just its icon. Pass the result as `tabBarButton`.
 *
 * The wrapper takes the item's `flex` (that is what shares the bar's width
 * between tabs) and the real button fills it, so the layout is unchanged. The
 * wrapper is a plain View, so the button stays the one accessible element.
 *
 * Built once at module level, never during render: a component created per
 * render would remount the button on every tab bar update.
 */
export function tourTabButton(id: string) {
  function TourTabButton(props: BottomTabBarButtonProps) {
    const flex = StyleSheet.flatten(props.style)?.flex ?? 1;
    return (
      <TourTarget id={id} style={{ flex }}>
        <PlatformPressable {...props} style={[props.style, { flex: 1 }]} />
      </TourTarget>
    );
  }
  return TourTabButton;
}
