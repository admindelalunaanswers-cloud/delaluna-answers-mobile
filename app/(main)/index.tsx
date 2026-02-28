import { StyleSheet } from 'react-native';

import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { Ionicons } from '@expo/vector-icons';
import HeaderNav from '@/src/components/shared/header-nav';
import HomeSignsDisplay from '@/src/components/shared/signs-display.component';
import DateSwitcher from '@/src/components/home/date-switcher.component';
export default function HomeScreen() {

  // Actions
  const goToProfile = () => {
    // Navigation logic to go to the profile screen
    console.log('Navigating to Profile Screen');
  };

  const goToNatalChartView = () => {
    // Navigation logic to go to the natal chart view screen
    console.log('Navigating to Natal Chart View Screen');
  };

  const goToChatbot = () => {
    // Navigation logic to go to the chatbot screen
    console.log('Navigating to Chatbot Screen');
  }


  return (
    <ThemedView style={styles.container}>
      <HeaderNav 
      title="Home"
      rightIconName="person-circle-outline"
        onRightPress={goToProfile} />

        <ThemedView style={{ marginTop: 5 }}>
         <HomeSignsDisplay
          sun={"Loading"}
            moon={"Loading"}
            rising={"Loading"}
            showViewChart={true}
            birthChartReady={true} />
        </ThemedView>

        
        
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
