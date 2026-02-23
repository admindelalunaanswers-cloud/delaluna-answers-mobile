import React from 'react';
import { Text, TextStyle } from 'react-native';
import { moderateScale } from '@/utils/responsive';

type Props = {
  children: React.ReactNode;
  style?: TextStyle;
};

export const TitleText = ({ children, style }: Props) => (
  <Text
    style={[
      {
        fontFamily: 'Futura-Generic',
        fontSize: moderateScale(35),
        letterSpacing: moderateScale(1.2),
        textTransform: 'uppercase',
        color: '#fff', // or your theme color
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export default TitleText;