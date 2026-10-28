import React from 'react';
import { TextStyle } from 'react-native';
import { Text } from '@/src/components/app-text';
import { moderateScale } from '@/src/utils/responsive';

type ButtonTextProps = {
  children: React.ReactNode;
  style?: TextStyle;
};

export const ButtonText = ({ children, style }: ButtonTextProps) => {
  return (
    <Text
      style={[
        {
          fontFamily: 'Futura-Generic',
          fontSize: moderateScale(40),
          letterSpacing: moderateScale(1),
          textTransform: 'uppercase',
          color: '#fff',
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
};
export default ButtonText;
export type { ButtonTextProps };