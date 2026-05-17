import { Alert } from 'react-native';
import * as Sharing from 'expo-sharing';
import { getSupplementsLowStock } from '../db/queries';
import { useSimpleMode } from '../context/SimpleModeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  Animated,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import DoseDetailModal from '../components/DoseDetailModal';
import DoseRow from '../components/DoseRow';
import StartDayButton from '../components/StartDayButton';
import SunTracker from '../components/SunTracker';
import WaterTracker from '../components/WaterTracker';
import { startDay, getTodaySchedule } from '../engine/scheduler';
import { getAnchor, addWater, confirmDose, skipDose, skipDoseWithReason, logExercise, getTodayExercise, getProfile, logSunExposure, getTodaySunLog, setFirstMealTime, getFirstMealTime, getJournalEntry, getStreak, getDaySummary, getLatestJournalEntry, logMeal, getTodayMeals } from '../db/queries';
import { checkAndGenerateWeeklyReport } from '../utils/autoReport';
import { clearAppBadge } from '../notifications';
import type { ScheduledDose } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatTime12(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function relativeTimeLabel(dose: ScheduledDose): string {
  const now = new Date();
  const diffMs = dose.scheduledTime.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60_000);

  if (dose.status === 'due' || diffMin <= 0) return 'NOW';
  if (diffMin <= 60) return `In ${diffMin} min`;
  return formatTime12(dose.scheduledTime);
}

// ─── Progress Header Card ────────────────────────────────────────────────────

interface ProgressHeaderProps {
  t0: Date | null;
  doses: ScheduledDose[];
  patientName?: string;
  firstMealTime?: string | null;
  isSimple?: boolean;
}

function ProgressHeader({ t0, doses, patientName, firstMealTime, isSimple }: ProgressHeaderProps) {
  const total  = doses.length;
  const taken  = doses.filter(d => d.status === 'taken').length;
  const pct    = total > 0 ? taken / total : 0;
  const today  = formatDate(new Date());
  const startedStr = t0 ? `Started ${formatTime12(t0)}` : null;
  const allDone = total > 0 && taken === total;
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [pct, fillAnim]);

  if (isSimple) {
    return (
       <View style={[headerStyles.card, { paddingBottom: 10 }]}>
         <Text style={headerStyles.dateText}>{today}</Text>
         <View style={{ height: 12 }} />
         {allDone ? (
           <Text style={[headerStyles.celebrationText, { fontSize: 18 }]}>All doses done! ✓</Text>
         ) : (
           <View style={headerStyles.summaryRow}>
             <Text style={headerStyles.summaryCount}>{taken}</Text>
             <Text style={headerStyles.summaryOf}> of {total} doses</Text>
           </View>
         )}
       </View>
    );
  }

  return (
    <View style={headerStyles.card}>
      {/* Top row */}
      <View style={headerStyles.topRow}>
        <Text style={headerStyles.dateText}>{today}</Text>
        <View style={headerStyles.topRight}>
          {startedStr && <Text style={headerStyles.startedText}>{startedStr}</Text>}
          {firstMealTime && <Text style={headerStyles.mealText}>Meal: {firstMealTime}</Text>}
        </View>
      </View>

      {/* Tick marks */}
      <View style={headerStyles.tickRow}>
        <Text style={headerStyles.tick}>0</Text>
        <Text style={headerStyles.tick}>{total}</Text>
      </View>

      {/* Progress bar — animated fill */}
      <View style={headerStyles.trackOuter}>
        <Animated.View
          style={[
            headerStyles.trackFill,
            { width: fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>

      {/* Summary */}
      {allDone ? (
        <View style={headerStyles.celebrationRow}>
          <Text style={headerStyles.celebrationIcon}>✓</Text>
          <Text style={headerStyles.celebrationText}>
            All doses done, {patientName ? patientName.split(' ')[0] : ''}!{'  '}Well done.
          </Text>
        </View>
      ) : total > 0 ? (
        <View style={headerStyles.summaryRow}>
          <Text style={headerStyles.summaryCount}>{taken}</Text>
          <Text style={headerStyles.summaryOf}> of {total} doses</Text>
          <Text style={headerStyles.summaryLabel}> today</Text>
        </View>
      ) : (
        <Text style={headerStyles.readyText}>Ready when you are</Text>
      )}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#F2EDE8',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  topRight: {
    alignItems: 'flex-end',
  },
  dateText: {
    color: '#7A6A62',
    fontSize: 13,
  },
  startedText: {
    color: '#7A6A62',
    fontSize: 13,
  },
  mealText: {
    color: '#C4882A',
    fontSize: 12,
    marginTop: 2,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tick: {
    color: '#B0A098',
    fontSize: 10,
  },
  trackOuter: {
    height: 10,
    backgroundColor: '#E8E0D8',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  trackFill: {
    height: 10,
    backgroundColor: '#C96A50',
    borderRadius: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryCount: {
    color: '#2C2420',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryOf: {
    color: '#2C2420',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#7A6A62',
    fontSize: 15,
  },
  celebrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  celebrationIcon: {
    color: '#C96A50',
    fontSize: 22,
    fontWeight: '900',
  },
  celebrationText: {
    color: '#C96A50',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  readyText: {
    color: '#7A6A62',
    fontSize: 15,
  },
});

// ─── Next Dose Spotlight Card ────────────────────────────────────────────────

interface NextDoseCardProps {
  doses: ScheduledDose[];
  onPress: (dose: ScheduledDose) => void;
}

function NextDoseCard({ doses, onPress }: NextDoseCardProps) {
  const next = doses.find(d => d.status === 'due' || d.status === 'upcoming');
  if (!next) return null;

  const label = relativeTimeLabel(next);
  const isDue = next.status === 'due' || label === 'NOW';

  return (
    <TouchableOpacity
      style={nextStyles.card}
      onPress={() => onPress(next)}
      activeOpacity={0.8}
    >
      <View style={nextStyles.left}>
        <Text style={nextStyles.nextLabel}>NEXT</Text>
        <Text style={nextStyles.name} numberOfLines={1}>{next.supplementName}</Text>
        <Text style={nextStyles.meta}>
          {next.doseAmount}{next.form ? ` · ${next.form}` : ''}
        </Text>
        {next.withFood && (
          <Text style={nextStyles.foodTag}>with food</Text>
        )}
      </View>
      <View style={nextStyles.right}>
        <Text style={[nextStyles.countdown, isDue && nextStyles.countdownDue]}>
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const nextStyles = StyleSheet.create({
  card: {
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  left: {
    flex: 1,
    marginRight: 12,
  },
  nextLabel: {
    color: '#B0A098',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 4,
  },
  name: {
    color: '#2C2420',
    fontSize: 20,
    fontWeight: '700',
  },
  meta: {
    color: '#7A6A62',
    fontSize: 14,
    marginTop: 2,
  },
  foodTag: {
    color: '#C4882A',
    fontSize: 11,
    marginTop: 4,
  },
  right: {
    alignItems: 'flex-end',
  },
  countdown: {
    color: '#2C2420',
    fontSize: 16,
    fontWeight: '700',
  },
  countdownDue: {
    color: '#C96A50',
    fontSize: 18,
  },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { isSimple, toggleSimple } = useSimpleMode();
  const [t0, setT0] = useState<Date | null>(null);
  const [doses, setDoses] = useState<ScheduledDose[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [exerciseMinutes, setExerciseMinutes] = useState(0);
  const [patientName, setPatientName] = useState('');
  const [sunMinutes, setSunMinutes] = useState(0);
  const [firstMealTime, setFirstMealTimeState] = useState<string | null>(null);
  const [showMealPrompt, setShowMealPrompt] = useState(false);
  const [todayMood, setTodayMood] = useState<string | null>(null);
  const [todayNotePreview, setTodayNotePreview] = useState('');
  const [exerciseType, setExerciseType] = useState('walk');
  const [exerciseIntensity, setExerciseIntensity] = useState('moderate');
  const [showFatigueAlert, setShowFatigueAlert] = useState(false);
  const [showSurveyPrompt, setShowSurveyPrompt] = useState(false);
  const [lowStockSupps, setLowStockSupps] = useState<{id: string; name: string; quantity_on_hand: number}[]>([]);
  const [latestJournal, setLatestJournal] = useState<{ mood: string; note: string; date: string } | null | undefined>(undefined);
  const [todayMeals, setTodayMeals] = useState<{ id: number; meal_type: string; time: string }[]>([]);
  const [showSimpleModeConsent, setShowSimpleModeConsent] = useState(false);
  const [insightText, setInsightText] = useState('');
  const [showMagnesiumHint, setShowMagnesiumHint] = useState(false);
  const [showD3MealHint, setShowD3MealHint] = useState(false);
  const [showEngagementNudge, setShowEngagementNudge] = useState(false);
  const [showFirstEntryWizard, setShowFirstEntryWizard] = useState(false);
  const [reportReadyUri, setReportReadyUri] = useState<string | null>(null);
  const [isCaregiver, setIsCaregiver] = useState(false);
  const [caregiverPatientName, setCaregiverPatientName] = useState('');

  const loadDay = useCallback(async () => {
    const anchor = await getAnchor();
    setWaterMl(anchor?.water_ml ?? 0);
    const ex = await getTodayExercise();
    const profile = await getProfile();
    setPatientName(profile?.name ?? '');
    setExerciseMinutes(ex.totalMinutes);
    setExerciseType(ex.type);
    setExerciseIntensity(ex.intensity);
    const sun = await getTodaySunLog();
    setSunMinutes(sun?.minutes ?? 0);
    const mealTime = await getFirstMealTime();
    setFirstMealTimeState(mealTime);
    const journal = await getJournalEntry(new Date().toISOString().split('T')[0]);
    setTodayMood(journal?.mood ?? null);
    setTodayNotePreview(journal?.note?.slice(0, 60) ?? '');
    const latest = await getLatestJournalEntry();
    setLatestJournal(latest ? { mood: latest.mood, note: latest.note, date: latest.date } : null);
    const meals = await getTodayMeals(new Date().toISOString().split('T')[0]);
    setTodayMeals(meals);
    const pt = await AsyncStorage.getItem('patient_type');
    const caregiverName = await AsyncStorage.getItem('caregiver_patient_name');
    setIsCaregiver(pt === 'caregiver');
    if (caregiverName) setCaregiverPatientName(caregiverName);
    if (anchor?.t0_timestamp) {
      setT0(new Date(anchor.t0_timestamp));
      const schedule = await getTodaySchedule();
      setDoses(schedule);
      const dueCount = schedule.filter(d => d.status === 'due').length;
      navigation.getParent()?.setOptions({ tabBarBadge: dueCount > 0 ? dueCount : undefined });
    } else {
      setT0(null);
      setDoses([]);
      navigation.getParent()?.setOptions({ tabBarBadge: undefined });
    }
  }, [navigation]);

  useEffect(() => {
    loadDay();
    const interval = setInterval(loadDay, 60_000);
    return () => clearInterval(interval);
  }, [loadDay]);

  useEffect(() => {
    AsyncStorage.getItem('fatigue_alert_shown').then((date) => {
      const today = new Date().toISOString().split('T')[0];
      setShowFatigueAlert(date === today);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('last_care_survey_date').then((date) => {
      if (!date) { setShowSurveyPrompt(true); return; }
      const daysSince = Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
      if (daysSince >= 90) setShowSurveyPrompt(true);
    });
  }, []);

  useEffect(() => {
    checkAndGenerateWeeklyReport().catch(() => {});
    clearAppBadge().catch(() => {});
    AsyncStorage.getItem('auto_report_ready_uri').then((uri) => {
      if (uri) setReportReadyUri(uri);
    });
  }, []);

  // Task 18: Simple Mode consent banner
  useEffect(() => {
    AsyncStorage.getItem('simple_mode_consent_shown').then((v) => {
      if (!v) setShowSimpleModeConsent(true);
    });
  }, []);

  // Task 19: Daily insight card — rotates by day-of-year
  useEffect(() => {
    const INSIGHTS = [
      'Drink 2.5L+ of water daily to protect your kidneys on high-dose D3.',
      'Avoid dairy to keep dietary calcium low on the Coimbra Protocol.',
      'Sun exposure produces D3 sulfate — a form your body uses differently from supplements.',
      'Magnesium helps your body convert D3 to its active form. Don\'t skip it.',
      'Low PTH on your blood test means your D3 is working — this is the target.',
      'Exercise supports neuroprotection and bone density. Even a short walk counts.',
      'Omega-3 reduces neuroinflammation. Take it with your largest meal of the day.',
      'Consistent dosing time reduces variability in blood levels. Set a routine.',
      'Track your mood — it correlates with protocol adherence in clinical studies.',
      'Vitamin K2 (MK-7) directs calcium to bones, not arteries. Essential with high D3.',
      'Resveratrol supports immune modulation. Take it away from other supplements.',
      'Boron improves magnesium absorption. Small amounts make a difference.',
    ];
    const idx = Math.floor(Date.now() / 86_400_000) % INSIGHTS.length;
    setInsightText(INSIGHTS[idx]);
  }, []);

  // Task 22: Magnesium balance hint — show once per week
  useEffect(() => {
    const week = new Date().toISOString().slice(0, 7);
    AsyncStorage.getItem(`mag_hint_${week}`).then((v) => {
      if (!v) setShowMagnesiumHint(true);
    });
  }, []);

  // Task 23: Meal-timed D3 hint — show until dismissed
  useEffect(() => {
    AsyncStorage.getItem('d3_meal_hint_dismissed').then((v) => {
      if (!v) setShowD3MealHint(true);
    });
  }, []);

  // Task 25: First entry wizard — show once after first T0 is set
  useEffect(() => {
    if (t0) {
      AsyncStorage.getItem('first_entry_wizard_shown').then((v) => {
        if (!v) setShowFirstEntryWizard(true);
      });
    }
  }, [t0]);

  // Task 28: 48-hour re-engagement nudge (new users only, Days 1-8)
  useEffect(() => {
    (async () => {
      const [last, installDate] = await Promise.all([
        AsyncStorage.getItem('last_active_date'),
        AsyncStorage.getItem('install_date'),
      ]);
      const now = new Date().toISOString().split('T')[0];
      if (!installDate) await AsyncStorage.setItem('install_date', now);
      const appAge = Math.floor((Date.now() - new Date(installDate ?? now).getTime()) / 86_400_000);
      if (appAge < 8 && last) {
        const daysSince = Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
        if (daysSince >= 2) setShowEngagementNudge(true);
      }
      await AsyncStorage.setItem('last_active_date', now);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const supps = await getSupplementsLowStock();
      const week = new Date().toISOString().slice(0, 7);
      const visible: { id: string; name: string; quantity_on_hand: number }[] = [];
      for (const s of supps as any[]) {
        const dismissed = await AsyncStorage.getItem(`dismissed_reorder_${s.id}_${week}`);
        if (!dismissed) visible.push(s);
      }
      setLowStockSupps(visible);
    })();
  }, []);

   const handleStartDay = async () => {
     setStarting(true);
     try {
       const schedule = await startDay();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setT0(new Date());
        setDoses(schedule);
        setShowMealPrompt(true);
     } catch (error: any) {
       if (error.message === 'BEDTIME_GATE') {
         Alert.alert(
           "Past Bedtime",
           "It's past your bedtime. Start your day tomorrow morning.",
           [{ text: 'OK', style: 'cancel' }]
         );
       } else {
         console.error('Error starting day:', error);
         Alert.alert(
           'Error',
           'Failed to start the day. Please try again.',
           [{ text: 'OK', style: 'cancel' }]
         );
       }
     } finally {
       setStarting(false);
     }
   };

  const handleAddWater = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await addWater(250);
    setWaterMl((prev) => prev + 250);
  };

  const handleLogExercise = async (minutes: number = 30, type: string = 'walk', intensity: string = 'moderate') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await logExercise(minutes, type, new Date().toISOString().split('T')[0], intensity);
    setExerciseMinutes(prev => prev + minutes);
    setExerciseType(type);
    setExerciseIntensity(intensity);
  };

  const handleLogSun = async (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logSunExposure(minutes);
    setSunMinutes(prev => prev + minutes);
  };

  const handleLogMeal = async () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    await setFirstMealTime(new Date().toISOString().split('T')[0], timeStr);
    setFirstMealTimeState(timeStr);
    setShowMealPrompt(false);
  };

    const handleTook = async (dose: ScheduledDose) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (dose.logId) {
        await confirmDose(dose.logId);
        
        const reviewPrompted = await AsyncStorage.getItem('review_prompted');
        const streak = await getStreak();
        const todayCompliance = await getDaySummary();
        if (!reviewPrompted && streak >= 7 && todayCompliance.compliancePct === 100) {
          StoreReview.requestReview();
          await AsyncStorage.setItem('review_prompted', 'true');
        }
      }
      setSelectedDose(null);
      await loadDay();
    };

  const handleSkip = async (dose: ScheduledDose, reason?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (dose.logId) {
      if (reason) {
        await skipDoseWithReason(dose.logId, reason);
      } else {
        await skipDose(dose.logId);
      }
    }
    setSelectedDose(null);
    await loadDay();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDay();
    setRefreshing(false);
  };

  const renderHeader = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: isSimple ? 16 : 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.greeting, { textAlign: isSimple ? 'center' : 'left' }]}>
          {isCaregiver
            ? (caregiverPatientName ? `Tracking ${caregiverPatientName.split(' ')[0]}` : 'Caregiver View')
            : (patientName ? `Hello, ${patientName.split(' ')[0]}` : 'Coimbra Protocol')}
        </Text>
        {isCaregiver && (
          <Text style={{ fontSize: 12, color: '#B0A098', marginTop: 2, textAlign: isSimple ? 'center' : 'left' }}>
            Caregiver · {patientName || 'Your account'}
          </Text>
        )}
      </View>
      {!isSimple && !isCaregiver && (
        <TouchableOpacity onPress={toggleSimple} style={{ padding: 8 }}>
          <MaterialCommunityIcons name="circle-slice-8" size={24} color="#C96A50" />
        </TouchableOpacity>
      )}
      {isCaregiver && (
        <TouchableOpacity
          style={{ backgroundColor: '#C96A50', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
          onPress={() => navigation.navigate('Settings', { screen: 'Caregiver' })}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#FAF7F4', fontSize: 12, fontWeight: '700' }}>Dashboard</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // ── Pre-day view ───────────────────────────────────────────────────────────

  if (!t0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          {renderHeader()}
          <Text style={styles.subtitle}>
            {isSimple 
              ? "Time for your supplements."
              : "Tap when you're ready to take your first supplement.\nThis sets your schedule for the day."}
          </Text>
          <StartDayButton onPress={handleStartDay} loading={starting} />
          
          {!isSimple && (
            <>
              <TouchableOpacity
                style={styles.relapseButton}
                onPress={() => navigation.navigate('Journal', { screen: 'Relapse' })}
                activeOpacity={0.7}
              >
                <Text style={styles.relapseButtonText}>Log Event</Text>
              </TouchableOpacity>
              {waterMl > 0 && (
                <WaterTracker waterMl={waterMl} onAdd={handleAddWater} />
              )}
              <View style={styles.exerciseCard}>
                <Text style={styles.exerciseLabel}>Exercise today</Text>
                {exerciseMinutes >= 30 ? (
                  <Text style={styles.exerciseDone}>{exerciseType} {exerciseIntensity} — {exerciseMinutes} min ✓</Text>
                ) : (
                  <>
                    <View style={styles.exercisePillRow}>
                      {[['Walk', 'walk'], ['Run', 'run'], ['Swim', 'swim'], ['Bike', 'bike']].map(([label, val]) => (
                        <TouchableOpacity key={val} style={[styles.exercisePill, exerciseType === val ? styles.exercisePillActive : null]} onPress={() => setExerciseType(val)} activeOpacity={0.7}>
                          <Text style={[styles.exercisePillText, exerciseType === val ? styles.exercisePillTextActive : null]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.exercisePillRow}>
                      {[['Light', 'light'], ['Moderate', 'moderate'], ['Intense', 'intense']].map(([label, val]) => (
                        <TouchableOpacity key={val} style={[styles.exerciseIntensityPill, exerciseIntensity === val ? styles.exerciseIntensityActive : null]} onPress={() => setExerciseIntensity(val)} activeOpacity={0.7}>
                          <Text style={[styles.exercisePillText, exerciseIntensity === val ? styles.exercisePillTextActive : null]}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <View style={styles.exerciseMinRow}>
                      {[15, 30, 60].map((min) => (
                        <TouchableOpacity key={min} style={styles.exerciseMinButton} onPress={() => handleLogExercise(min, exerciseType, exerciseIntensity)} activeOpacity={0.8}>
                          <Text style={styles.exerciseMinButtonText}>+{min}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}
              </View>
              <SunTracker sunMinutes={sunMinutes} onLog={handleLogSun} />
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Active day view ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
        }
      >
        {renderHeader()}

        {reportReadyUri ? (
          <TouchableOpacity
            style={styles.reportReadyBanner}
            onPress={async () => {
              await Sharing.shareAsync(reportReadyUri, { mimeType: 'application/pdf', dialogTitle: 'Weekly Protocol Report' });
              await AsyncStorage.removeItem('auto_report_ready_uri');
              setReportReadyUri(null);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.reportReadyText}>📄 Weekly report ready — tap to share</Text>
            <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem('auto_report_ready_uri'); setReportReadyUri(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.reportReadyDismiss}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ) : null}

        {showFatigueAlert ? (
          <View style={styles.fatigueBanner}>
            <Text style={styles.fatigueBannerText}>⚠ Fatigue pattern detected. Consider contacting your prescriber or resting today.</Text>
            <TouchableOpacity onPress={() => setShowFatigueAlert(false)}>
              <Text style={styles.fatigueBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {lowStockSupps.map((s) => (
          <View key={s.id} style={styles.reorderBanner}>
            <Text style={styles.reorderBannerText}>⚠ {s.name} running low — ~{s.quantity_on_hand} doses remaining. Restock soon.</Text>
            <TouchableOpacity onPress={async () => {
              const week = new Date().toISOString().slice(0, 7);
              await AsyncStorage.setItem(`dismissed_reorder_${s.id}_${week}`, 'true');
              setLowStockSupps((prev) => prev.filter((x) => x.id !== s.id));
            }}>
              <Text style={styles.reorderBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {showSurveyPrompt ? (
          <TouchableOpacity style={styles.surveyPrompt} onPress={() => { setShowSurveyPrompt(false); navigation.navigate('Journal', { screen: 'CareSurvey' }); }} activeOpacity={0.85}>
            <Text style={styles.surveyPromptText}>Quarterly check-in: How coordinated is your MS care? · Tap to take survey</Text>
            <TouchableOpacity onPress={() => setShowSurveyPrompt(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.surveyPromptDismiss}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ) : null}

        {showSimpleModeConsent ? (
          <View style={styles.consentBanner}>
            <Text style={styles.consentBannerTitle}>Simple Mode Active</Text>
            <Text style={styles.consentBannerText}>Advanced charts, trends, and protocol details are hidden. All data is still recorded. Tap below to acknowledge.</Text>
            <TouchableOpacity style={styles.consentBannerBtn} onPress={async () => { await AsyncStorage.setItem('simple_mode_consent_shown', 'true'); setShowSimpleModeConsent(false); }} activeOpacity={0.8}>
              <Text style={styles.consentBannerBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showEngagementNudge ? (
          <View style={styles.nudgeBanner}>
            <Text style={styles.nudgeBannerText}>Welcome back. It looks like you may have missed some doses. Your protocol works best with daily consistency.</Text>
            <TouchableOpacity onPress={() => setShowEngagementNudge(false)}>
              <Text style={styles.nudgeBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {insightText ? (
          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>TODAY'S INSIGHT</Text>
            <Text style={styles.insightText}>{insightText}</Text>
          </View>
        ) : null}

        <ProgressHeader t0={t0} doses={doses} patientName={patientName} firstMealTime={firstMealTime} isSimple={isSimple} />

        {showFirstEntryWizard ? (
          <View style={styles.wizardCard}>
            <Text style={styles.wizardTitle}>Your First Day Started</Text>
            <Text style={styles.wizardStep}>1 — Your T=0 anchor is now set. All supplements are scheduled from this moment.</Text>
            <Text style={styles.wizardStep}>2 — Tap any dose row to mark it as taken or skip it.</Text>
            <Text style={styles.wizardStep}>3 — Drink 2.5L+ of water today. Track it with the Water tracker below.</Text>
            <Text style={styles.wizardStep}>4 — Log your sun exposure and exercise each day to support the protocol.</Text>
            <TouchableOpacity style={styles.wizardBtn} onPress={async () => { await AsyncStorage.setItem('first_entry_wizard_shown', 'true'); setShowFirstEntryWizard(false); }} activeOpacity={0.8}>
              <Text style={styles.wizardBtnText}>Got it, let's start</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!isSimple && <NextDoseCard doses={doses} onPress={setSelectedDose} />}

        {doses.length === 0 ? (
          <View style={styles.emptyDoses}>
            <Text style={styles.emptyDosesIcon}>💊</Text>
            <Text style={styles.emptyDosesTitle}>No supplements scheduled</Text>
            <Text style={styles.emptyDosesSub}>Go to Settings → Protocol to add your Coimbra supplements.</Text>
          </View>
        ) : doses.map((dose) => (
          <DoseRow key={dose.id} dose={dose} onPress={() => setSelectedDose(dose)} isSimple={isSimple} />
        ))}

        {!isSimple && (
          <>
            <TouchableOpacity
              style={styles.relapseButtonInline}
              onPress={() => navigation.navigate('Journal', { screen: 'Relapse' })}
              activeOpacity={0.7}
            >
              <Text style={styles.relapseButtonText}>Log Event</Text>
            </TouchableOpacity>
            <WaterTracker waterMl={waterMl} onAdd={handleAddWater} />
            <View style={styles.exerciseCard}>
              <Text style={styles.exerciseLabel}>Exercise today</Text>
              {exerciseMinutes >= 30 ? (
                <Text style={styles.exerciseDone}>{exerciseType} {exerciseIntensity} — {exerciseMinutes} min ✓</Text>
              ) : (
                <>
                  <View style={styles.exercisePillRow}>
                    {[['Walk', 'walk'], ['Run', 'run'], ['Swim', 'swim'], ['Bike', 'bike']].map(([label, val]) => (
                      <TouchableOpacity key={val} style={[styles.exercisePill, exerciseType === val ? styles.exercisePillActive : null]} onPress={() => setExerciseType(val)} activeOpacity={0.7}>
                        <Text style={[styles.exercisePillText, exerciseType === val ? styles.exercisePillTextActive : null]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.exercisePillRow}>
                    {[['Light', 'light'], ['Moderate', 'moderate'], ['Intense', 'intense']].map(([label, val]) => (
                      <TouchableOpacity key={val} style={[styles.exerciseIntensityPill, exerciseIntensity === val ? styles.exerciseIntensityActive : null]} onPress={() => setExerciseIntensity(val)} activeOpacity={0.7}>
                        <Text style={[styles.exercisePillText, exerciseIntensity === val ? styles.exercisePillTextActive : null]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.exerciseMinRow}>
                    {[15, 30, 60].map((min) => (
                      <TouchableOpacity key={min} style={styles.exerciseMinButton} onPress={() => handleLogExercise(min, exerciseType, exerciseIntensity)} activeOpacity={0.8}>
                        <Text style={styles.exerciseMinButtonText}>+{min}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
            <SunTracker sunMinutes={sunMinutes} onLog={handleLogSun} />
            
            {showMealPrompt && !firstMealTime && (
              <View style={styles.mealPromptCard}>
                <Text style={styles.mealPromptTitle}>When did you have your first meal?</Text>
                <TouchableOpacity style={styles.mealPromptButton} onPress={handleLogMeal} activeOpacity={0.8}>
                  <Text style={styles.mealPromptButtonText}>Now</Text>
                </TouchableOpacity>
              </View>
            )}
            
            <TouchableOpacity style={styles.journalSummaryCard} onPress={() => navigation.navigate('Journal')} activeOpacity={0.7}>
              <View style={styles.journalSummaryHeader}>
                <Text style={styles.journalSummaryEmoji}>{todayMood ?? '—'}</Text>
                <Text style={styles.journalSummaryTitle}>Journal</Text>
              </View>
              {todayMood ? (
                <Text style={styles.journalSummaryPreview} numberOfLines={1}>{todayNotePreview || 'Tap to write more'}</Text>
              ) : (
                <Text style={styles.journalSummaryPrompt}>How are you feeling?</Text>
              )}
            </TouchableOpacity>

            {latestJournal !== undefined ? (
              <TouchableOpacity style={styles.lastEntryCard} onPress={() => navigation.navigate('Journal')} activeOpacity={0.7}>
                {latestJournal ? (
                  <>
                    <View style={styles.lastEntryTop}>
                      <Text style={styles.lastEntryEmoji}>{latestJournal.mood}</Text>
                      <Text style={styles.lastEntryDate}>{latestJournal.date}</Text>
                    </View>
                    <Text style={styles.lastEntryNote} numberOfLines={2}>
                      {latestJournal.note.slice(0, 80)}{latestJournal.note.length > 80 ? '...' : ''}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.lastEntryEmpty}>No journal entries yet. Tap to write your first.</Text>
                )}
              </TouchableOpacity>
            ) : null}

            {showD3MealHint ? (
              <View style={styles.hintCard}>
                <View style={styles.hintCardInner}>
                  <Text style={styles.hintCardTitle}>D3 WITH MEALS</Text>
                  <Text style={styles.hintCardText}>Vitamin D3 is fat-soluble. Take it with your largest meal of the day for best absorption — ideally breakfast or lunch.</Text>
                </View>
                <TouchableOpacity onPress={async () => { await AsyncStorage.setItem('d3_meal_hint_dismissed', 'true'); setShowD3MealHint(false); }}>
                  <Text style={styles.hintCardDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {showMagnesiumHint ? (
              <View style={styles.hintCard}>
                <View style={styles.hintCardInner}>
                  <Text style={styles.hintCardTitle}>MAGNESIUM BALANCE</Text>
                  <Text style={styles.hintCardText}>High-dose D3 depletes magnesium. Ensure you're taking magnesium glycinate or malate at a separate time from calcium-rich foods.</Text>
                </View>
                <TouchableOpacity onPress={async () => { const week = new Date().toISOString().slice(0, 7); await AsyncStorage.setItem(`mag_hint_${week}`, 'true'); setShowMagnesiumHint(false); }}>
                  <Text style={styles.hintCardDismiss}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={styles.mealCard}>
              <Text style={styles.mealCardTitle}>MEALS TODAY</Text>
              <View style={styles.mealButtonRow}>
                {(['Breakfast', 'Lunch', 'Dinner', 'Snack'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={styles.mealTypeBtn}
                    activeOpacity={0.7}
                    onPress={async () => {
                      const today = new Date().toISOString().split('T')[0];
                      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      await logMeal(today, type, time);
                      const meals = await getTodayMeals(today);
                      setTodayMeals(meals);
                    }}
                  >
                    <Text style={styles.mealTypeBtnText}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {todayMeals.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mealChipScroll}>
                  {todayMeals.map((m) => (
                    <View key={m.id} style={styles.mealChip}>
                      <Text style={styles.mealChipText}>{m.meal_type} {m.time}</Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
            </View>

            <View style={styles.quickLinksRow}>
              <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Calendar')} activeOpacity={0.7}>
                <Ionicons name="calendar-outline" size={16} color="#888888" />
                <Text style={styles.quickLinkText}>History</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickLink} onPress={() => navigation.navigate('Awareness')} activeOpacity={0.7}>
                <Ionicons name="heart-outline" size={16} color="#888888" />
                <Text style={styles.quickLinkText}>Awareness</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <DoseDetailModal
        visible={selectedDose !== null}
        dose={selectedDose}
        onClose={() => setSelectedDose(null)}
        onTook={handleTook}
        onSkip={handleSkip}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F4',
  },
  lastEntryCard: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 14, marginBottom: 12, marginHorizontal: 0 },
  lastEntryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lastEntryEmoji: { fontSize: 22 },
  lastEntryDate: { color: '#7A6A62', fontSize: 12 },
  lastEntryNote: { color: '#2C2420', fontSize: 14, lineHeight: 20 },
  lastEntryEmpty: { color: '#B0A098', fontSize: 14, textAlign: 'center' },
  quickLinksRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 16 },
  quickLink: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F2EDE8', borderRadius: 8, paddingVertical: 10 },
  quickLinkText: { color: '#7A6A62', fontSize: 13, fontWeight: '600' },
  reorderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBF0ED',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C96A50',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    gap: 10,
  },
  reorderBannerText: {
    flex: 1,
    color: '#A8503A',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  reorderBannerDismiss: {
    color: '#B0A098',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  fatigueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8EC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C4882A',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    gap: 10,
  },
  fatigueBannerText: {
    flex: 1,
    color: '#8A5A10',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  fatigueBannerDismiss: {
    color: '#B0A098',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  surveyPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBF0ED',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C96A5040',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    gap: 10,
  },
  surveyPromptText: {
    flex: 1,
    color: '#A8503A',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  surveyPromptDismiss: {
    color: '#B0A098',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  greeting: {
    color: '#2C2420',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#7A6A62',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 22,
  },
  scroll: {
    padding: 20,
    paddingTop: 60,
  },
  exerciseCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  exerciseLabel: {
    color: '#7A6A62',
    fontSize: 14,
  },
  exerciseDone: {
    color: '#5A8A5A',
    fontWeight: '700',
    marginTop: 8,
  },
  exerciseLogButton: {
    backgroundColor: '#FBF0ED',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C96A50',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  exerciseLogButtonText: {
    color: '#C96A50',
    fontWeight: '600',
  },
  relapseButton: {
    borderWidth: 1.5,
    borderColor: '#C04040',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  reportReadyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EBF0F5', borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#4A7A9B' },
  reportReadyText: { color: '#4A7A9B', fontSize: 13, fontWeight: '600', flex: 1 },
  reportReadyDismiss: { color: '#B0A098', fontSize: 16, paddingLeft: 12 },
  emptyDoses: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyDosesIcon: { fontSize: 40, marginBottom: 12 },
  emptyDosesTitle: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDosesSub: { color: '#B0A098', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  relapseButtonInline: {
    borderWidth: 1.5,
    borderColor: '#C04040',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 8,
  },
  relapseButtonText: {
    color: '#C04040',
    fontSize: 14,
    fontWeight: '700',
  },
  exercisePillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  exercisePill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8CFC8',
    paddingVertical: 8,
    alignItems: 'center',
  },
  exercisePillActive: {
    borderColor: '#C96A50',
    backgroundColor: '#FBF0ED',
  },
  exercisePillText: {
    color: '#B0A098',
    fontSize: 12,
    fontWeight: '600',
  },
  exercisePillTextActive: {
    color: '#C96A50',
  },
  exerciseIntensityPill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D8CFC8',
    paddingVertical: 8,
    alignItems: 'center',
  },
  exerciseIntensityActive: {
    borderColor: '#C4882A',
    backgroundColor: '#FFF8EC',
  },
  exerciseMinRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  exerciseMinButton: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#FBF0ED',
    borderWidth: 1,
    borderColor: '#C96A5030',
    paddingVertical: 10,
    alignItems: 'center',
  },
  exerciseMinButtonText: {
    color: '#C96A50',
    fontSize: 14,
    fontWeight: '700',
  },
  mealPromptCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealPromptTitle: {
    color: '#2C2420',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  mealPromptButton: {
    backgroundColor: '#C96A50',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  mealPromptButtonText: {
    color: '#FAF7F4',
    fontSize: 14,
    fontWeight: '800',
  },
  journalSummaryCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  journalSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  journalSummaryEmoji: {
    fontSize: 20,
  },
  journalSummaryTitle: {
    color: '#7A6A62',
    fontSize: 14,
    fontWeight: '600',
  },
  journalSummaryPreview: {
    color: '#7A6A62',
    fontSize: 13,
    fontStyle: 'italic',
  },
  journalSummaryPrompt: {
    color: '#B0A098',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textDecorationColor: '#C96A50',
  },
  consentBanner: { backgroundColor: '#EBF0F5', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#4A7A9B' },
  consentBannerTitle: { color: '#4A7A9B', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  consentBannerText: { color: '#7A6A62', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  consentBannerBtn: { backgroundColor: '#4A7A9B', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  consentBannerBtnText: { color: '#FAF7F4', fontSize: 13, fontWeight: '700' },
  nudgeBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8EC', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#C4882A', gap: 10 },
  nudgeBannerText: { flex: 1, color: '#8A5A10', fontSize: 13, lineHeight: 18 },
  nudgeBannerDismiss: { color: '#B0A098', fontSize: 16, fontWeight: '700' },
  insightCard: { backgroundColor: '#FBF0ED', borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#C96A50' },
  insightLabel: { color: '#C96A50', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  insightText: { color: '#7A6A62', fontSize: 13, lineHeight: 20 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8EC', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#C4882A', gap: 10 },
  hintCardInner: { flex: 1 },
  hintCardTitle: { color: '#C4882A', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  hintCardText: { color: '#7A6A62', fontSize: 12, lineHeight: 18 },
  hintCardDismiss: { color: '#B0A098', fontSize: 16, fontWeight: '700' },
  wizardCard: { backgroundColor: '#FBF0ED', borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#C96A5040' },
  wizardTitle: { color: '#C96A50', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  wizardStep: { color: '#7A6A62', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  wizardBtn: { backgroundColor: '#C96A50', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  wizardBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '800' },
  mealCard: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 14, marginBottom: 12 },
  mealCardTitle: { color: '#7A6A62', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  mealButtonRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mealTypeBtn: { flex: 1, backgroundColor: '#E8E0D8', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  mealTypeBtnText: { color: '#C96A50', fontSize: 12, fontWeight: '700' },
  mealChipScroll: { marginTop: 4 },
  mealChip: { backgroundColor: '#FBF0ED', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, borderWidth: 1, borderColor: '#C96A5030' },
  mealChipText: { color: '#C96A50', fontSize: 12 },
});
