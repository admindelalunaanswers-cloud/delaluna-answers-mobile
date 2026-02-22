import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Image, ImageStyle, OpaqueColorValue, StyleProp, TextStyle } from 'react-native';

// --- Ionicons mapping (SF Symbol name → Ionicons name) ---
const ICON_MAPPING = {
  'house': 'home-outline',
  'paperplane': 'paper-plane-outline',
  'chevron.left.forwardslash.chevron.right': 'code-slash-outline',
  'chevron.right': 'chevron-forward-outline',
  'star': 'star-outline',
  'heart': 'heart-outline',
  'globe': 'globe-outline',
  'bubble.left': 'chatbubble-outline',
} satisfies Record<string, ComponentProps<typeof Ionicons>['name']>;

// --- Asset mapping (key → require path) ---
const ASSET_MAPPING = {
  // Tabs
  'asset:tabs/home': require('@/src/assets/tabs/home.png'),
  'asset:tabs/connections': require('@/src/assets/tabs/connections.png'),
  'asset:tabs/transits': require('@/src/assets/tabs/transits.png'),
  'asset:tabs/chat': require('@/src/assets/tabs/chat.png'),

  // Actions
  'asset:actions/add': require('@/src/assets/actions/add_circle_icon.png'),
  'asset:actions/arrow-right': require('@/src/assets/actions/arrow-right-icon.png'),
  'asset:actions/arrow-back': require('@/src/assets/actions/arrow_back_icon.png'),
  'asset:actions/arrow-forward': require('@/src/assets/actions/arrow_forward_icon.png'),
  'asset:actions/send': require('@/src/assets/actions/send_Icon.png'),
  'asset:actions/visibility': require('@/src/assets/actions/visibility.png'),
  'asset:actions/visibility-off': require('@/src/assets/actions/visibility_off.png'),
  'asset:actions/log-out': require('@/src/assets/actions/log-out-icon.png'),
  'asset:actions/change-password': require('@/src/assets/actions/change-password-icon.png'),
  'asset:actions/change-theme': require('@/src/assets/actions/change-theme-icon.png'),
  'asset:actions/delete-account': require('@/src/assets/actions/delete-account-icon.png'),
  
  // Main
  'asset:main/moon': require('@/src/assets/main/moon_icon.png'),
  'asset:main/sun': require('@/src/assets/main/sun_icon.png'),
  'asset:main/avatar': require('@/src/assets/main/avatar_icon.png'),
  'asset:main/arrow-upward': require('@/src/assets/main/arrow_upward_icon.png'),
  
  // Connections
  'asset:connections/heart': require('@/src/assets/connections/heart_icon.png'),
  'asset:connections/satisfied': require('@/src/assets/connections/satisfied_icon.png'),
  'asset:connections/neutral': require('@/src/assets/connections/neutral_icon.png'),
  'asset:connections/dissatisfied': require('@/src/assets/connections/dissatisfied_icon.png'),
  
} satisfies Record<string, ReturnType<typeof require>>;

export type IconSymbolName = keyof typeof ICON_MAPPING | keyof typeof ASSET_MAPPING;

// name accepts a registered string key OR a direct require() result (number)
type IconSymbolSource = IconSymbolName | number;

function isAssetSource(name: IconSymbolSource): name is number {
  return typeof name === 'number';
}

function isAssetKey(name: string): name is keyof typeof ASSET_MAPPING {
  return name in ASSET_MAPPING;
}

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolSource;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<ImageStyle | TextStyle>;
  weight?: string;
}) {
  if (isAssetSource(name) || isAssetKey(name as string)) {
    const source = isAssetSource(name)
      ? name
      : ASSET_MAPPING[name as keyof typeof ASSET_MAPPING];

    return (
      <Image
        source={source}
        style={[{ width: size, height: size, tintColor: color as string }, style as StyleProp<ImageStyle>]}
        resizeMode="contain"
      />
    );
  }

  return (
    <Ionicons
      color={color}
      size={size}
      name={ICON_MAPPING[name as keyof typeof ICON_MAPPING]}
      style={style as StyleProp<TextStyle>}
    />
  );
}
