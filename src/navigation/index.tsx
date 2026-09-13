import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getProfile } from '../db/queries';
import { navigationRef } from './navigationRef';
import { t } from '../i18n';
import { AppResetProvider } from '../context/AppResetContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import AboutScreen from '../screens/AboutScreen';
import CaregiverScreen from '../screens/CaregiverScreen';
import CoachingStyleScreen from '../screens/CoachingStyleScreen';
import FamilySyncScreen from '../screens/FamilySyncScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import CalendarScreen from '../screens/CalendarScreen';
import HomeScreen from '../screens/HomeScreen';
import LabResultsScreen from '../screens/LabResultsScreen';
import MriScreen from '../screens/MriScreen';
import JournalScreen from '../screens/JournalScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ReportScreen from '../screens/ReportScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SettingsScreen from '../screens/SettingsScreen';
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
  headerStyle: { backgroundColor: '#F7F7F2' },
  headerTintColor: '#14213D',
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
      <CalendarTabNav.Screen name="CalendarMain" component={CalendarScreen} />
    </CalendarTabNav.Navigator>
  );
}

function JournalNavigator() {
  return (
    <JournalNav.Navigator screenOptions={{ headerShown: false }}>
      <JournalNav.Screen name="JournalMain" component={JournalScreen} />
    </JournalNav.Navigator>
  );
}

/**
 * Placeholder for the four tracker screens (PT-trio round 2, Lane B).
 *
 * The route names `Water`, `Sunlight`, `Exercise` and `Food` were agreed before
 * either lane started, so the Trackers tab is navigable end to end now and Lane
 * B only has to swap the `component` below when each screen lands. A loud empty
 * state rather than a silent dead card: a tab that opens onto nothing with no
 * explanation reads as a bug.
 *
 * TODO(lane-b): replace each `component={TrackerPlaceholder}` with the real
 * screen. Nothing else in this file needs to change.
 */
function TrackerPlaceholder() {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderTitle}>Not built yet</Text>
      <Text style={styles.placeholderBody}>
        This tracker has a data layer but no screen. It is next on the list.
      </Text>
    </View>
  );
}

const TRACKER_ROUTES: { name: string; title: string }[] = [
  { name: 'Water', title: 'Water' },
  { name: 'Sunlight', title: 'Sunlight' },
  { name: 'Exercise', title: 'Exercise' },
  { name: 'Food', title: 'Food' },
];

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
      {TRACKER_ROUTES.map((route) => (
        <SummaryNav.Screen
          key={route.name}
          name={route.name}
          component={TrackerPlaceholder}
          options={{ ...SUB_HEADER, title: route.title, animation: 'slide_from_right' }}
        />
      ))}
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
        name="Schedule"
        component={ScheduleScreen}
        options={{ ...SUB_HEADER, title: 'Schedule & Reminders', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="CoachingStyle"
        component={CoachingStyleScreen}
        options={{ ...SUB_HEADER, title: 'Reminder Tone', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="FamilySync"
        component={FamilySyncScreen}
        options={{ ...SUB_HEADER, title: 'Family Sync', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Caregiver"
        component={CaregiverScreen}
        options={{ ...SUB_HEADER, title: 'Caregiver', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Feedback"
        component={FeedbackScreen}
        options={{ ...SUB_HEADER, title: 'Send Feedback', animation: 'slide_from_right' }}
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
          backgroundColor: '#F7F7F2',
          borderTopColor: '#CFD2C6',
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 16,
          height: 72,
        },
        tabBarActiveTintColor: '#1B58B8',
        tabBarInactiveTintColor: '#9AA3B2',
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
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
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
          tabBarLabel: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      >
        {() => <ErrorBoundary><HomeNavigator /></ErrorBoundary>}
      </Tab.Screen>
      {/* Route id stays `Summary` on purpose: every existing navigate('Summary', …)
          and the three medical sub-routes below keep working, and the rename is
          one line instead of a sweep. The tab stopped being a summary on
          2026-09-13 — compliance moved under the calendar and this became the
          home of the four daily trackers. */}
      <Tab.Screen
        name="Summary"
        options={{
          tabBarLabel: t('trackers'),
          tabBarIcon: ({ color, size }) => <Ionicons name="leaf-outline" size={size} color={color} />,
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

interface NavigationProps {
  /**
   * Fired on the first laid-out frame of real content (Home or onboarding).
   * App uses it to drop the native splash, so the OS layer is only replaced
   * once there is something usable underneath it — never by a blank frame.
   */
  onReady?: () => void;
}

export default function Navigation({ onReady }: NavigationProps) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    getProfile().then((profile) => {
      setHasProfile(profile !== null);
    });
  }, []);

  if (hasProfile === null) return null;

  if (!hasProfile) {
    return (
      <View style={styles.root} onLayout={onReady}>
        <OnboardingScreen onComplete={() => setHasProfile(true)} />
      </View>
    );
  }

  return (
    <AppResetProvider value={() => setHasProfile(false)}>
      <View style={styles.root} onLayout={onReady}>
        <NavigationContainer ref={navigationRef}>
          <ErrorBoundary>
            <TabNavigator />
          </ErrorBoundary>
        </NavigationContainer>
      </View>
    </AppResetProvider>
  );
}

const styles = StyleSheet.create({
  placeholder: { flex: 1, backgroundColor: '#F7F7F2', alignItems: 'center', justifyContent: 'center', padding: 32 },
  placeholderTitle: { color: '#14213D', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  placeholderBody: { color: '#5A6478', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  root: { flex: 1 },
});
