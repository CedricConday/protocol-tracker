import AsyncStorage from '@react-native-async-storage/async-storage';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import OnboardingScreen from '../screens/OnboardingScreen';
import HomeScreen from '../screens/HomeScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SummaryScreen from '../screens/SummaryScreen';

const ONBOARDING_KEY = 'coimbra_onboarding_complete';
const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0d0d0d',
          borderTopColor: '#1a1a1a',
          borderTopWidth: 1,
          paddingTop: 6,
          paddingBottom: 10,
          height: 60,
        },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#555555',
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ tabBarLabel: 'Schedule' }}
      />
      <Tab.Screen
        name="Summary"
        component={SummaryScreen}
        options={{ tabBarLabel: 'Summary' }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      setOnboarded(val === 'true');
    });
  }, []);

  const handleComplete = useCallback(() => {
    AsyncStorage.setItem(ONBOARDING_KEY, 'true').then(() => {
      setOnboarded(true);
    });
  }, []);

  if (onboarded === null) {
    return null;
  }

  if (!onboarded) {
    return <OnboardingScreen onComplete={handleComplete} />;
  }

  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}
