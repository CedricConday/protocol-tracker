import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getProfile } from '../db/queries';
import { navigationRef } from './navigationRef';
import CalendarScreen from '../screens/CalendarScreen';
import GuideScreen from '../screens/GuideScreen';
import HomeScreen from '../screens/HomeScreen';
import JournalScreen from '../screens/JournalScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SummaryScreen from '../screens/SummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import AwarenessScreen from '../screens/AwarenessScreen';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#0d0d0d',
          borderTopColor: '#1f1f1f',
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 16,
          height: 72,
        },
        tabBarActiveTintColor: '#22c55e',
        tabBarInactiveTintColor: '#555555',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.3,
        },
        tabBarIconStyle: {
          marginBottom: -2,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Summary"
        component={SummaryScreen}
        options={{
          tabBarLabel: 'Summary',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={CalendarScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Journal"
        component={JournalScreen}
        options={{
          tabBarLabel: 'Journal',
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="notebook-outline" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Awareness"
        component={AwarenessScreen}
        options={{
          tabBarLabel: 'Awareness',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Guide"
        component={GuideScreen}
        options={{
          tabBarLabel: 'Guide',
          tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-sharp" size={size} color={color} />,
        }}
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
    <NavigationContainer ref={navigationRef}>
      <TabNavigator />
    </NavigationContainer>
  );
}
