import React from 'react';
import { TextStyle } from 'react-native';
import { Text } from '@/src/components/app-text';
import { moderateScale } from '@/src/utils/responsive';

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