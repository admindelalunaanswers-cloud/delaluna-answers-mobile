import Ionicons from '@expo/vector-icons/Ionicons';
import { ComponentProps } from 'react';
import { Image, ImageSourcePropType, ImageStyle, OpaqueColorValue, StyleProp, TextStyle } from 'react-native';

const ICON_MAPPING = {
  'house': 'home-outline',
  'paperplane': 'paper-plane-outline',
  'chevron.left.forwardslash.chevron.right': 'code-slash-outline',
  'chevron.right': 'chevron-forward-outline',
  'star': 'star-outline',
  'heart': 'heart-outline',
  'globe': 'globe-outline',
  'bubble.left': 'chatbubble-outline',
  'binoculars': 'binoculars-outline',
} satisfies Record<string, ComponentProps<typeof Ionicons>['name']>;

export type IconSymbolName = keyof typeof ICON_MAPPING;

// String → Ionicons lookup. Anything else (require result, { uri }) → Image.
type IconSymbolSource = IconSymbolName | ImageSourcePropType;

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
  if (typeof name !== 'string') {
    return (
      <Image
        source={name as ImageSourcePropType}
        style={[{ width: size, height: size, tintColor: color as string }, style as StyleProp<ImageStyle>]}
        resizeMode="contain"
      />
    );
  }

  return (
    <Ionicons
      color={color}
      size={size}
      name={ICON_MAPPING[name]}
      style={style as StyleProp<TextStyle>}
    />
  );
}
