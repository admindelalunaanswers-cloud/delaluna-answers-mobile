import React from 'react';
import { TextStyle } from 'react-native';
import { Text } from '@/src/components/app-text';
import { moderateScale } from '@/src/utils/responsive';

type Props = {
  children: React.ReactNode;
  style?: TextStyle;
};

export const BodyText = ({ children, style }: Props) => (
  <Text
    style={[
      {
        fontFamily: 'SpaceMono-Regular',
        fontSize: moderateScale(16),
        lineHeight: moderateScale(24),
        color: '#ddd',
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export default BodyText;
