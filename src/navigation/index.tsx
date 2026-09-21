import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { C, themed, useTheme } from '../theme/colors';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getProfile } from '../db/queries';
import { navigationRef } from './navigationRef';
import { t, useLanguage } from '../i18n';
import { CONTENT_MAX_WIDTH, useIsWideScreen } from '../theme/layout';
import { AppResetProvider } from '../context/AppResetContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import AboutScreen from '../screens/AboutScreen';
import AccountSettingsScreen from '../screens/AccountSettingsScreen';
import CoachingStyleScreen from '../screens/CoachingStyleScreen';
import FeedbackScreen from '../screens/FeedbackScreen';
import { ImpressumScreen, PrivacyPolicyScreen } from '../screens/LegalDocumentScreen';
import CalendarScreen from '../screens/CalendarScreen';
import HomeScreen from '../screens/HomeScreen';
import JournalScreen from '../screens/JournalScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ScheduleScreen from '../screens/ScheduleScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SupplementEditorScreen from '../screens/SupplementEditorScreen';
import BedtimeScreen from '../screens/BedtimeScreen';
import SummaryScreen from '../screens/SummaryScreen';
import WaterScreen from '../screens/WaterScreen';
import SunlightScreen from '../screens/SunlightScreen';
import ExerciseScreen from '../screens/ExerciseScreen';
import FoodScreen from '../screens/FoodScreen';

const Tab = createBottomTabNavigator();
const CalendarTabNav = createNativeStackNavigator();
const HomeNav = createNativeStackNavigator();
const JournalNav = createNativeStackNavigator();
const SummaryNav = createNativeStackNavigator();
const SettingsNav = createNativeStackNavigator();

const SUB_HEADER = {
  headerShown: true,
  headerStyle: { backgroundColor: C.bg },
  headerTintColor: C.text,
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
        options={{ ...SUB_HEADER, title: t('navHistory'), animation: 'slide_from_right' }}
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
 * The tracker screens (PT-trio round 3, C5).
 *
 * Six since 2026-09-14: Manage supplements and Bedtime moved here out of
 * Settings, so everything a day is built from is on one tab.
 *
 * The route names were agreed before either round-2 lane started and registered
 * against a placeholder, so the Trackers tab has been navigable end to end since
 * the shell landed and this round only swapped `component`. Nothing else in this
 * file changed, which was the point of agreeing the names up front.
 */
// `titleKey`, not `title`: this array is built once at module load, so a
// literal here would be the language at import time and would never change.
const TRACKER_ROUTES: { name: string; titleKey: string; component: ComponentType<any> }[] = [
  { name: 'Water', titleKey: 'water', component: WaterScreen },
  { name: 'Sunlight', titleKey: 'sunlight', component: SunlightScreen },
  { name: 'Exercise', titleKey: 'exercise', component: ExerciseScreen },
  { name: 'Food', titleKey: 'food', component: FoodScreen },
  { name: 'SupplementEditor', titleKey: 'navManageSupplements', component: SupplementEditorScreen },
  { name: 'Bedtime', titleKey: 'navBedtime', component: BedtimeScreen },
];

function SummaryNavigator() {
  return (
    <SummaryNav.Navigator screenOptions={{ headerShown: false }}>
      <SummaryNav.Screen name="SummaryMain" component={SummaryScreen} />
      {TRACKER_ROUTES.map((route) => (
        <SummaryNav.Screen
          key={route.name}
          name={route.name}
          component={route.component}
          options={{ ...SUB_HEADER, title: t(route.titleKey), animation: 'slide_from_right' }}
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
        name="About"
        component={AboutScreen}
        options={{ ...SUB_HEADER, title: t('navAbout'), animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="AccountSettings"
        component={AccountSettingsScreen}
        options={{ ...SUB_HEADER, title: t('navAccountSettings'), animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Schedule"
        component={ScheduleScreen}
        options={{ ...SUB_HEADER, title: t('navSchedule'), animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="CoachingStyle"
        component={CoachingStyleScreen}
        options={{ ...SUB_HEADER, title: t('navReminderTone'), animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="Feedback"
        component={FeedbackScreen}
        options={{ ...SUB_HEADER, title: t('navSendFeedback'), animation: 'slide_from_right' }}
      />
      {/*
        Two taps from the Settings tab, which is what § 5 DDG's "reachable in
        at most two steps" means here, and both render bundled text so they
        work with no network.
      */}
      <SettingsNav.Screen
        name="Impressum"
        component={ImpressumScreen}
        options={{ ...SUB_HEADER, title: t('navImpressum'), animation: 'slide_from_right' }}
      />
      <SettingsNav.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ ...SUB_HEADER, title: t('navPrivacy'), animation: 'slide_from_right' }}
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
          backgroundColor: C.bg,
          borderTopColor: C.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 16,
          height: 72,
        },
        tabBarActiveTintColor: C.primary,
        tabBarInactiveTintColor: C.textMuted,
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
          tabBarLabel: t('navHistory'),
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" size={size} color={color} />,
        }}
      >
        {() => <ErrorBoundary><CalendarTabNavigator /></ErrorBoundary>}
      </Tab.Screen>
      <Tab.Screen
        name="Journal"
        options={{
          tabBarLabel: t('journal'),
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
          tabBarLabel: t('today'),
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
          // A nested push outlives the tap that made it: a sub-route opened
          // here kept showing instead of the tracker grid when the tab was
          // returned to, with no way back but the header arrow. Reported from
          // the device on 2026-09-17 as "the tracker screen is now only lab
          // results". Leaving the tab now returns its stack to the grid.
          //
          // The worst case is gone with the cause: History used to push
          // `Summary/Report` across tabs, and Share is a modal sheet now, so
          // nothing reaches into this stack from another tab. This still
          // guards the tracker sub-routes.
          popToTopOnBlur: true,
        }}
      >
        {() => <ErrorBoundary><SummaryNavigator /></ErrorBoundary>}
      </Tab.Screen>
      <Tab.Screen
        name="Settings"
        options={{
          tabBarLabel: t('settings'),
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

/**
 * One centred column on a big screen, the whole window on a phone.
 *
 * Wrapping here rather than in each screen is deliberate: it is one place
 * instead of seventeen, it catches sub-screens pushed onto every stack, and it
 * keeps the tab bar the same width as the content it belongs to — a five-icon
 * bar spread across a 10" landscape screen reads as a stretched phone app,
 * which is exactly what this is fixing. Backgrounds stay full-bleed because
 * the gutter is the app's own background colour.
 */
function ContentFrame({ children }: { children: React.ReactNode }) {
  const wide = useIsWideScreen();
  if (!wide) return <>{children}</>;
  return (
    <View style={styles.wideBackdrop}>
      <View style={styles.wideColumn}>{children}</View>
    </View>
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
  useLanguage(); // re-render this screen when the language changes
  useTheme(); // ...and when the theme tier changes
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
        <ContentFrame>
          <OnboardingScreen onComplete={() => setHasProfile(true)} />
        </ContentFrame>
      </View>
    );
  }

  return (
    <AppResetProvider value={() => setHasProfile(false)}>
      <View style={styles.root} onLayout={onReady}>
        <NavigationContainer ref={navigationRef}>
          <ErrorBoundary>
            <ContentFrame>
              <TabNavigator />
            </ContentFrame>
          </ErrorBoundary>
        </NavigationContainer>
      </View>
    </AppResetProvider>
  );
}

const styles = themed((C) => StyleSheet.create({
  root: { flex: 1 },
  wideBackdrop: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  wideColumn: { flex: 1, width: '100%', maxWidth: CONTENT_MAX_WIDTH },
}));
