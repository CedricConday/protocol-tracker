import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getProfile } from '../db/queries';
import { navigationRef } from './navigationRef';
import { AppResetProvider } from '../context/AppResetContext';
import AboutScreen from '../screens/AboutScreen';
import AwarenessScreen from '../screens/AwarenessScreen';
import CalendarScreen from '../screens/CalendarScreen';
import CalciumLogScreen from '../screens/CalciumLogScreen';
import CareSurveyScreen from '../screens/CareSurveyScreen';
import CaregiverScreen from '../screens/CaregiverScreen';
import DrugCheckerScreen from '../screens/DrugCheckerScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import GuideScreen from '../screens/GuideScreen';
import HomeScreen from '../screens/HomeScreen';
import LabResultsScreen from '../screens/LabResultsScreen';
import MriScreen from '../screens/MriScreen';
import JournalScreen from '../screens/JournalScreen';
import MmasScreen from '../screens/MmasScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import QuizScreen from '../screens/QuizScreen';
import RelapseScreen from '../screens/RelapseScreen';
import ReportScreen from '../screens/ReportScreen';
import ScannerScreen from '../screens/ScannerScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SecurityScreen from '../screens/SecurityScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SleepScreen from '../screens/SleepScreen';
import SupplementEditorScreen from '../screens/SupplementEditorScreen';
import SummaryScreen from '../screens/SummaryScreen';
import TerminalLinkScreen from '../screens/TerminalLinkScreen';
import WorkspaceScreen from '../screens/WorkspaceScreen';

const Tab = createBottomTabNavigator();
const HomeNav = createNativeStackNavigator();
const ScheduleNav = createNativeStackNavigator();
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

// ─── Home Tab ──────────────────────────────────────────────────────────────
function HomeNavigator() {
  return (
    <HomeNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeNav.Screen name="HomeMain" component={HomeScreen} />
      <HomeNav.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{ ...SUB_HEADER, title: 'History', animation: 'slide_from_right' }}
      />
      <HomeNav.Screen
        name="Awareness"
        component={AwarenessScreen}
        options={{ ...SUB_HEADER, title: 'Awareness Calendar', animation: 'slide_from_right' }}
      />
    </HomeNav.Navigator>
  );
}

// ─── Schedule Tab ──────────────────────────────────────────────────────────
function ScheduleNavigator() {
  return (
    <ScheduleNav.Navigator screenOptions={{ headerShown: false }}>
      <ScheduleNav.Screen name="ScheduleMain" component={ScheduleScreen} />
      <ScheduleNav.Screen
        name="Scanner"
        component={ScannerScreen}
        options={{
          ...SUB_HEADER,
          title: 'Ingredient Scanner',
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      />
    </ScheduleNav.Navigator>
  );
}

// ─── Journal Tab ───────────────────────────────────────────────────────────
// Absorbs: JournalScreen, RelapseScreen (bottom sheet), CareSurveyScreen (prompted)
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
      <JournalNav.Screen
        name="CareSurvey"
        options={{
          ...SUB_HEADER,
          title: 'Care Survey',
          presentation: 'modal',
          animation: 'slide_from_bottom',
        }}
      >
        {({ navigation }) => <CareSurveyScreen onClose={() => navigation.goBack()} />}
      </JournalNav.Screen>
    </JournalNav.Navigator>
  );
}

// ─── Summary Tab ───────────────────────────────────────────────────────────
// Absorbs: SummaryScreen, ReportScreen (action button), WorkspaceScreen (AI panel)
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
      <SummaryNav.Screen
        name="Workspace"
        component={WorkspaceScreen}
        options={{ ...SUB_HEADER, title: 'AI Workspace', animation: 'slide_from_right' }}
      />
    </SummaryNav.Navigator>
  );
}

// ─── Settings Tab ──────────────────────────────────────────────────────────
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
        name="DrugChecker"
        component={DrugCheckerScreen}
        options={{ ...SUB_HEADER, title: 'Drug Checker', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Security"
        component={SecurityScreen}
        options={{ ...SUB_HEADER, title: 'Security & Passkeys', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="About"
        component={AboutScreen}
        options={{ ...SUB_HEADER, title: 'About', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Guide"
        component={GuideScreen}
        options={{ ...SUB_HEADER, title: 'Protocol Guide', animation: 'slide_from_right' }}
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
      <SettingsNav.Screen
        name="Caregiver"
        component={CaregiverScreen}
        options={{ ...SUB_HEADER, title: 'Caregiver View', animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="TerminalLink"
        component={TerminalLinkScreen}
        options={{ ...SUB_HEADER, title: 'Terminal Link', animation: 'slide_from_bottom' }}
      />
      <SettingsNav.Screen
        name="Mmas"
        options={{ ...SUB_HEADER, title: 'Monthly Check-In', animation: 'slide_from_right' }}
      >
        {({ navigation }) => <MmasScreen onClose={() => navigation.goBack()} />}
      </SettingsNav.Screen>
      <SettingsNav.Screen
        name="Quiz"
        options={{ ...SUB_HEADER, title: 'Protocol Quiz', animation: 'slide_from_right' }}
      >
        {({ navigation }) => <QuizScreen onClose={() => navigation.goBack()} />}
      </SettingsNav.Screen>
      <SettingsNav.Screen
        name="Feedback"
        component={FeedbackScreen}
        options={{ ...SUB_HEADER, title: 'Send Feedback', animation: 'slide_from_right' }}
      />
    </SettingsNav.Navigator>
  );
}

// ─── Tab Bar ───────────────────────────────────────────────────────────────
function TabNavigator() {
  return (
    <Tab.Navigator
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
        name="Home"
        component={HomeNavigator}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Schedule"
        component={ScheduleNavigator}
        options={{
          tabBarLabel: 'Schedule',
          tabBarIcon: ({ color, size }) => <Ionicons name="time" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Journal"
        component={JournalNavigator}
        options={{
          tabBarLabel: 'Journal',
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="notebook-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Summary"
        component={SummaryNavigator}
        options={{
          tabBarLabel: 'Summary',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
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

  if (hasProfile === null) return null;

  if (!hasProfile) {
    return <OnboardingScreen onComplete={() => setHasProfile(true)} />;
  }

  return (
    <AppResetProvider value={() => setHasProfile(false)}>
      <NavigationContainer ref={navigationRef}>
        <TabNavigator />
      </NavigationContainer>
    </AppResetProvider>
  );
}
