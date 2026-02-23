import { verticalScale, moderateScale, scale } from '@/src/utils/responsive';
import React from 'react';

import { StyleSheet, Text, View } from 'react-native';

import { Dropdown } from 'react-native-element-dropdown';

const data = ['She/Her', 'He/Him', 'They/Them', 'Non Binary'].map(pronoun => ({ label: pronoun, value: pronoun }));

type PronounDropdownProps = {
  style?: any;
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
};

const PronounDropdown: React.FC<PronounDropdownProps> = ({ value, onChange, onFocus }) => {
  return (
    <Dropdown
      style={styles.dropdown}
      itemTextStyle={styles.itemText}
      placeholderStyle={styles.placeholderStyle}
      selectedTextStyle={styles.selectedTextStyle}
      inputSearchStyle={styles.inputSearchStyle}
      iconStyle={styles.iconStyle}
      data={data}
      maxHeight={300}
      labelField="label"
      valueField="value"
      placeholder="Select pronouns"
      value={value}
      containerStyle={styles.listContainer}
      itemContainerStyle={styles.itemContainer}
      onFocus={onFocus}
      onChange={item => {
        onChange(item.value);
      }}
      renderItem={item => {
        const isSelected = item.value === value;
        return (
          <View
            style={[
              styles.itemContainer,
              isSelected && styles.itemSelected
            ]}
          >
            <Text style={styles.itemText}>{item.label}</Text>
          </View>
        );
      }}
    />
  );
};

export default PronounDropdown;

const styles = StyleSheet.create({
  dropdown: {
    width: '100%',
    marginVertical: verticalScale(5),
    height: verticalScale(45),
    borderRadius: moderateScale(5),
    paddingHorizontal: scale(5),
  },
  icon: {
    marginRight: scale(5),
  },
  placeholderStyle: {
    fontSize: moderateScale(16),
    color: 'rgba(255,255,255,0.6)',
  },
  listContainer: {
    backgroundColor: '#2A2A2A',   // dropdown list background
    borderRadius: moderateScale(8),
  },
  itemContainer: {
    backgroundColor: '#1E1E1E',   // each row background
    paddingVertical: verticalScale(10),
  },
  itemSelected: {
    backgroundColor: '#4B2E83',
  },
  selectedTextStyle: {
    fontSize: moderateScale(16),
    color: '#fff',
  },
  iconStyle: {
    width: scale(20),
    height: verticalScale(20),
  },
  inputSearchStyle: {
    height: verticalScale(40),
    fontSize: moderateScale(16),
    color: '#ffffff58',
  },
  itemText: {
  color: "#fff",
  fontSize: moderateScale(16),
},
});
