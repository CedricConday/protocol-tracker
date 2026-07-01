import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getProfile } from '../db/queries';
import { navigationRef } from './navigationRef';
import { AppResetProvider } from '../context/AppResetContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import AboutScreen from '../screens/AboutScreen';
import CalendarScreen from '../screens/CalendarScreen';
import CalciumLogScreen from '../screens/CalciumLogScreen';
import HomeScreen from '../screens/HomeScreen';
import LabResultsScreen from '../screens/LabResultsScreen';
import MriScreen from '../screens/MriScreen';
import JournalScreen from '../screens/JournalScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import RelapseScreen from '../screens/RelapseScreen';
import ReportScreen from '../screens/ReportScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SleepScreen from '../screens/SleepScreen';
import SupplementEditorScreen from '../screens/SupplementEditorScreen';
import SummaryScreen from '../screens/SummaryScreen';

const Tab = createBottomTabNavigator();
const CalendarTabNav = createNativeStackNavigator();
const HomeNav = createNativeStackNavigator();
const JournalNav = createNativeStackNavigator();
const SummaryNav = createNativeStackNavigator();
const SettingsNav = createNativeStackNavigator();

const SUB_HEADER = {
  headerShown: true,
  headerStyle: { backgroundColor: '#FAF7F4' },
  headerTintColor: '#2C2420',
  headerShadowVisible: false,
  headerBackTitleVisible: false,
} as const;

function HomeNavigator() {
  return (
    <HomeNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeNav.Screen name="HomeMain" component={HomeScreen} />
      <HomeNav.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ ...SUB_HEADER, title: 'History', animation: 'slide_from_right' }}
      />
    </HomeNav.Navigator>
  );
}

function CalendarTabNavigator() {
  return (
    <CalendarTabNav.Navigator screenOptions={{ headerShown: false }}>
      <CalendarTabNav.Screen name="CalendarMain" component={ScheduleScreen} />
      <CalendarTabNav.Screen
        name="CalendarView"
        component={CalendarScreen}
        options={{ ...SUB_HEADER, title: 'History', animation: 'slide_from_right' }}
      />
    </CalendarTabNav.Navigator>
  );
}

function JournalNavigator() {
  return (
    <JournalNav.Navigator screenOptions={{ headerShown: false }}>
      <JournalNav.Screen name="JournalMain" component={JournalScreen} />
      <JournalNav.Screen
        name="Relapse"
        component={RelapseScreen}
        options={{
          ...SUB_HEADER,
          title: 'Events',
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </JournalNav.Navigator>
  );
}

function SummaryNavigator() {
  return (
    <SummaryNav.Navigator screenOptions={{ headerShown: false }}>
      <SummaryNav.Screen name="SummaryMain" component={SummaryScreen} />
      <SummaryNav.Screen
        name="Report"
        component={ReportScreen}
        options={{ ...SUB_HEADER, title: 'Share with Doctor', animation: 'slide_from_right' }}
      />
      <SummaryNav.Screen
        name="MriTracker"
        component={MriScreen}
        options={{ ...SUB_HEADER, title: 'MRI History', animation: 'slide_from_right' }}
      />
      <SummaryNav.Screen
        name="LabResults"
        component={LabResultsScreen}
        options={{ ...SUB_HEADER, title: 'Lab Results', animation: 'slide_from_right' }}
      />
    </SummaryNav.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsNav.Navigator screenOptions={{ headerShown: false }}>
      <SettingsNav.Screen name="SettingsMain" component={SettingsScreen} />
      <SettingsNav.Screen
        name="SupplementEditor"
        component={SupplementEditorScreen}
        options={{ ...SUB_HEADER, title: 'Manage Supplements', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="About"
        component={AboutScreen}
        options={{ ...SUB_HEADER, title: 'About', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Sleep"
        component={SleepScreen}
        options={{ ...SUB_HEADER, title: 'Sleep Check-in', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="CalciumLog"
        component={CalciumLogScreen}
        options={{ ...SUB_HEADER, title: 'Calcium Log', animation: 'slide_from_right' }}
      />
    </SettingsNav.Navigator>
  );
}

function TabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#FAF7F4',
          borderTopColor: '#D8CFC8',
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 16,
          height: 72,
        },
        tabBarActiveTintColor: '#C96A50',
        tabBarInactiveTintColor: '#B0A098',
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
        name="Calendar"
        options={{
          tabBarLabel: 'Calendar',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      >
        {() => <ErrorBoundary><CalendarTabNavigator /></ErrorBoundary>}
      </Tab.Screen>
      <Tab.Screen
        name="Journal"
        options={{
          tabBarLabel: 'Journal',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="notebook-outline" size={size} color={color} />
          ),
        }}
      >
        {() => <ErrorBoundary><JournalNavigator /></ErrorBoundary>}
      </Tab.Screen>
      <Tab.Screen
        name="Home"
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      >
        {() => <ErrorBoundary><HomeNavigator /></ErrorBoundary>}
      </Tab.Screen>
      <Tab.Screen
        name="Summary"
        options={{
          tabBarLabel: 'Summary',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      >
        {() => <ErrorBoundary><SummaryNavigator /></ErrorBoundary>}
      </Tab.Screen>
      <Tab.Screen
        name="Settings"
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
        }}
      >
        {() => <ErrorBoundary><SettingsNavigator /></ErrorBoundary>}
      </Tab.Screen>
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

  if (hasProfile === null) return null;

  if (!hasProfile) {
    return <OnboardingScreen onComplete={() => setHasProfile(true)} />;
  }

  return (
    <AppResetProvider value={() => setHasProfile(false)}>
      <NavigationContainer ref={navigationRef}>
        <ErrorBoundary>
          <TabNavigator />
        </ErrorBoundary>
      </NavigationContainer>
    </AppResetProvider>
  );
}
