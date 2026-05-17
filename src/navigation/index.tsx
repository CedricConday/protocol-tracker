import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { getProfile } from '../db/queries';
import CalendarScreen from '../screens/CalendarScreen';
import GuideScreen from '../screens/GuideScreen';
import HomeScreen from '../screens/HomeScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SummaryScreen from '../screens/SummaryScreen';

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
      <Tab.Screen
        name="History"
        component={CalendarScreen}
        options={{ tabBarLabel: 'History' }}
      />
      <Tab.Screen
        name="Guide"
        component={GuideScreen}
        options={{ tabBarLabel: 'Guide' }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    getProfile().then((profile) => {
      setHasProfile(profile !== null);
    });
  }, []);

  if (hasProfile === null) {
    return null;
  }

  if (!hasProfile) {
    return <OnboardingScreen onComplete={() => setHasProfile(true)} />;
  }

  return (
    <NavigationContainer>
      <TabNavigator />
    </NavigationContainer>
  );
}
