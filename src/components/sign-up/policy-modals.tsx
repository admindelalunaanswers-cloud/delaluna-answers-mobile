import React, { useState, useEffect } from 'react';

import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
} from 'react-native';
import { TextStyle } from 'react-native';

import Markdown from 'react-native-markdown-display';

import { verticalScale, moderateScale, scale } from '@/src/utils/responsive';

const markdownStyles: { [key: string]: TextStyle } = {
  body: { color: '#333', fontSize: moderateScale(15), lineHeight: moderateScale(22) },
  heading1: { fontSize: moderateScale(22), fontWeight: 'bold', marginBottom: verticalScale(10), alignSelf: 'center', },
  heading2: { fontSize: moderateScale(20), fontWeight: 'bold', marginTop: verticalScale(16), alignSelf: 'center',  },
  heading3: { fontSize: moderateScale(18), fontWeight: '600', marginTop: verticalScale(12), alignSelf: 'center',  },
  strong: { fontWeight: 'bold' },
  link: { color: '#1C2541', textDecorationLine: 'underline' },
};

