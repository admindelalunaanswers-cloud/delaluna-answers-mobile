import React from 'react';
import { Text, TextStyle } from 'react-native';
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
