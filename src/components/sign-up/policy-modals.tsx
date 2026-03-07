// components/PolicyModals.tsx
import { verticalScale, moderateScale, scale } from '@/src/utils/responsive';
import Markdown from 'react-native-markdown-display';

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


interface PolicyModalProps {
  visible: boolean;
  onClose: () => void;
  textContent?: string;
  title: string;
}


export default function PolicyModal({
  visible,
  onClose,
  textContent,
  title,
}: PolicyModalProps) {
  const [content, setContent] = useState<string>('');

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.modalContainer}>
        <View style={styles.header}>
  <Text style={styles.title}>{title}</Text>
  <TouchableOpacity onPress={onClose} style={styles.closeButton}>
    <Text style={styles.closeText}>Close</Text>
  </TouchableOpacity>
</View>


        {visible && textContent && (
          <ScrollView contentContainerStyle={styles.textContainer}>
            <Markdown style={markdownStyles}>
  {textContent}
</Markdown>

          </ScrollView>
        )}

      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? verticalScale(60) : verticalScale(20),
    backgroundColor: '#fff',
  },
  header: {
    paddingVertical: verticalScale(16),
    borderBottomWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  title: {
    fontSize: moderateScale(18),
    fontWeight: '600',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: scale(16),
    top: verticalScale(16),
    padding: scale(8),
  },
  closeText: {
    color: '#0000EE', // match link color
    fontSize: moderateScale(16),
    fontWeight: '500',
  },
  textContainer: {
    padding: scale(16),
  },
  textContent: {
    fontSize: moderateScale(14),
    color: '#333',
    lineHeight: moderateScale(20),
  },
});

import { TextStyle } from 'react-native';

const markdownStyles: { [key: string]: TextStyle } = {
  body: { color: '#333', fontSize: moderateScale(15), lineHeight: moderateScale(22) },
  heading1: { fontSize: moderateScale(22), fontWeight: 'bold', marginBottom: verticalScale(10), alignSelf: 'center', },
  heading2: { fontSize: moderateScale(20), fontWeight: 'bold', marginTop: verticalScale(16), alignSelf: 'center',  },
  heading3: { fontSize: moderateScale(18), fontWeight: '600', marginTop: verticalScale(12), alignSelf: 'center',  },
  strong: { fontWeight: 'bold' },
  link: { color: '#1C2541', textDecorationLine: 'underline' },
};

