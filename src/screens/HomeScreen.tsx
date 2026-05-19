import { Alert, Modal } from 'react-native';
import * as Sharing from 'expo-sharing';
import { useHomeScreen } from '../hooks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import {
  Animated,
  LayoutAnimation,
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
import UpcomingAppointmentCard from '../components/UpcomingAppointmentCard';
import SunTracker from '../components/SunTracker';
import WaterTracker from '../components/WaterTracker';
import { startDay, getTodaySchedule } from '../engine/scheduler';
import { getAnchor, addWater, confirmDose, skipDose, skipDoseWithReason, logExercise, getTodayExercise, getProfile, logSunExposure, getTodaySunLog, setFirstMealTime, getFirstMealTime, getJournalEntry, getStreak, getDaySummary, getLatestJournalEntry, logMeal, getTodayMeals, getNextMedicalEvent, getLatestLabResult, getMiscFlag, setMiscFlag } from '../db/queries';
import { checkAndGenerateWeeklyReport } from '../utils/autoReport';
import { clearAppBadge } from '../notifications';
import type { ScheduledDose, MedicalEvent } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Progress Header Card ────────────────────────────────────────────────────

interface ProgressHeaderProps {
  t0: Date | null;
  doses: ScheduledDose[];
  patientName?: string;
}

function ProgressHeader({ t0, doses }: ProgressHeaderProps) {
  const total  = doses.length;
  const taken  = doses.filter(d => d.status === 'taken').length;
  const today  = formatDate(new Date());
  const allDone = total > 0 && taken === total;

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

const headerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#F2EDE8',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
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



// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const {
    t0, setT0, doses, setDoses, waterMl, setWaterMl, firstMealTime, setFirstMealTimeState,
    exerciseMinutes, setExerciseMinutes, exerciseType, setExerciseType,
    exerciseIntensity, setExerciseIntensity, sunMinutes, setSunMinutes,
    todayMeals, setTodayMeals, patientName, isCaregiver, caregiverPatientName,
    showFatigueAlert, setShowFatigueAlert, showSurveyPrompt, setShowSurveyPrompt,
    showMagnesiumHint, setShowMagnesiumHint, showD3MealHint, setShowD3MealHint,
    showEngagementNudge, setShowEngagementNudge, lowStockSupps, setLowStockSupps,
    vitDDanger, insightText, currentStreak, milestoneModalVisible, setMilestoneModalVisible,
    todayMood, setTodayMood, todayNotePreview, latestJournal,
    refreshing, setRefreshing, starting, setStarting,
    reportReadyUri, setReportReadyUri, nextMedicalEvent,
    showMealPrompt, setShowMealPrompt, showFirstEntryWizard, setShowFirstEntryWizard,
    loadDay,
  } = useHomeScreen(navigation);

  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [dosesExpanded, setDosesExpanded] = useState(false);

  const [strictMode, setStrictMode] = useState(false);

  useEffect(() => {
    getMiscFlag('strict_mode_enabled').then((v) => setStrictMode(v === 'true'));
  }, []);

  const energyCredits = doses.reduce((acc, d) => {
    if (d.status === 'taken') return acc + 1;
    if (d.status === 'missed') return acc - 1;
    return acc;
  }, 10);
  const clampedCredits = Math.max(0, Math.min(10, energyCredits));

  useEffect(() => {
    setDosesExpanded(false);
  }, [doses]);

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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingTop: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.greeting, { textAlign: 'center' }]}>
          {isCaregiver
            ? (caregiverPatientName ? `Tracking ${caregiverPatientName.split(' ')[0]}` : 'Caregiver View')
            : (patientName ? `Hello, ${patientName.split(' ')[0]}` : 'the Protocol')}
        </Text>
        {isCaregiver && (
          <Text style={{ fontSize: 12, color: '#B0A098', marginTop: 2, textAlign: 'center' }}>
            Caregiver · {patientName || 'Your account'}
          </Text>
        )}
      </View>
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
            {"Ready for today's doses?"}
          </Text>
          <StartDayButton onPress={handleStartDay} loading={starting} />
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

        {vitDDanger !== null ? (
          <View style={styles.vitDBanner}>
            <Text style={styles.vitDBannerText}>⚠ Vitamin D critically low ({vitDDanger} ng/mL). Contact your prescriber immediately.</Text>
          </View>
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
            <Text style={styles.insightLabel}>Protocol tip</Text>
            <Text style={styles.insightText}>{insightText}</Text>
          </View>
        ) : null}

        {strictMode ? (
          <TouchableOpacity style={styles.strictBadge} onPress={() => navigation.navigate('Settings', { screen: 'DrugChecker' })} activeOpacity={0.7}>
            <View style={styles.strictAmberDot} />
            <Text style={styles.strictBadgeText}>Strict Mode active — Drug Checker</Text>
          </TouchableOpacity>
        ) : null}

        <ProgressHeader t0={t0} doses={doses} />

        {nextMedicalEvent ? (
          <UpcomingAppointmentCard
            event={nextMedicalEvent}
            onViewDetails={() => navigation.navigate('Calendar' as never)}
          />
        ) : null}

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

        {doses.length > 0 ? (
          <>
            {doses.every((d) => d.status === 'taken') ? (
              <Text style={styles.allDoneLabel}>All done ✓</Text>
            ) : (
              <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setDosesExpanded(true);
                }}
                onPress={dosesExpanded ? undefined : () => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setDosesExpanded(true);
                }}
              >
                {dosesExpanded ? (
                  <View>
                    <Text style={styles.sectionLabel}>DOSES</Text>
                    {doses.map((dose) => (
                      <DoseRow key={dose.id} dose={dose} onPress={() => setSelectedDose(dose)} />
                    ))}
                    <TouchableOpacity
                      style={styles.collapseBtn}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setDosesExpanded(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.collapseBtnText}>Collapse</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View>
                    {/* Stacked peek cards */}
                    <View style={styles.stackPeek}>
                      {doses.slice(1, 4).map((d, i) => (
                        <View key={d.id} style={[styles.stackCard, { top: -i * 8 }]} />
                      ))}
                    </View>
                    <Text style={styles.stackLabel}>
                      {doses.length - 1} more dose{doses.length - 1 !== 1 ? 's' : ''} today — tap to view all
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <View style={styles.emptyDoses}>
            <Text style={styles.emptyDosesIcon}>💊</Text>
            <Text style={styles.emptyDosesTitle}>No supplements scheduled</Text>
            <Text style={styles.emptyDosesSub}>Go to Settings → Protocol to add your Coimbra supplements.</Text>
        </View>
      )}

      <View style={styles.energyCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.energyLabel}>Energy today</Text>
          <Text style={styles.energyCount}>{clampedCredits}/10</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: 10 }, (_, i) => (
            <View key={i} style={[styles.energyDot, { backgroundColor: i < clampedCredits ? '#22c55e' : '#E8E0D8' }]} />
          ))}
        </View>
      </View>

      </ScrollView>

      <DoseDetailModal
        visible={selectedDose !== null}
        dose={selectedDose}
        onClose={() => setSelectedDose(null)}
        onTook={handleTook}
        onSkip={handleSkip}
      />

      <Modal
        visible={milestoneModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMilestoneModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>90-Day Milestone 🏆</Text>
            <Text style={styles.modalBody}>
              You've maintained the Protocol for {currentStreak} consecutive days. Research shows consistent adherence at this stage significantly reduces relapse risk. Keep going.
            </Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={async () => {
                await setMiscFlag('last_90_modal_shown', String(currentStreak));
                setMilestoneModalVisible(false);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#FAF7F4',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalBody: {
    color: '#7A6A62',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  modalButtonText: {
    color: '#FAF7F4',
    fontSize: 16,
    fontWeight: '800',
  },
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
    paddingBottom: 48,
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
  vitDBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
    marginHorizontal: 0,
    marginBottom: 10,
    padding: 12,
  },
  vitDBannerText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
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
  emptyDosesTitle: { color: '#2C2420', fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDosesSub: { color: '#B0A098', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  allDoneLabel: { color: '#22c55e', fontSize: 16, fontWeight: '700', textAlign: 'center', marginVertical: 12 },
  relapseButtonInline: {
    borderWidth: 1.5,
    borderColor: '#C04040',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionLabel: { color: '#B0A098', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  stackPeek: { height: 20, marginBottom: 8, position: 'relative' },
  stackCard: { position: 'absolute', left: 0, right: 0, height: 8, backgroundColor: '#F0EBE8', borderRadius: 6, shadowColor: '#2C2420', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  stackLabel: { color: '#C96A50', fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  collapseBtn: { backgroundColor: '#F2EDE8', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#D8CFC8' },
  collapseBtnText: { color: '#7A6A62', fontSize: 13, fontWeight: '600' },
  energyCard: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#22c55e30' },
  energyLabel: { color: '#166534', fontSize: 13, fontWeight: '600' },
  energyCount: { color: '#166534', fontSize: 13, fontWeight: '700' },
  energyDot: { width: 20, height: 20, borderRadius: 10, flex: 1 },
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
  insightLabel: { color: '#C96A50', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  insightText: { color: '#7A6A62', fontSize: 14, lineHeight: 22 },
  strictBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8EC', borderRadius: 8, padding: 10, marginBottom: 10, gap: 8, borderWidth: 1, borderColor: '#eab308' },
  strictAmberDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#eab308' },
  strictBadgeText: { color: '#8A5A10', fontSize: 13, fontWeight: '600', flex: 1 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8EC', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#C4882A', gap: 10 },
  hintCardInner: { flex: 1 },
  hintCardTitle: { color: '#C4882A', fontSize: 11, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  hintCardText: { color: '#7A6A62', fontSize: 12, lineHeight: 18 },
  hintCardDismiss: { color: '#B0A098', fontSize: 16, fontWeight: '700' },
  wizardCard: { backgroundColor: '#FBF0ED', borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#C96A5040' },
  wizardTitle: { color: '#C96A50', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  wizardStep: { color: '#7A6A62', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  wizardBtn: { backgroundColor: '#C96A50', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  wizardBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '800' },
  mealCard: { backgroundColor: '#F2EDE8', borderRadius: 12, padding: 14, marginBottom: 12 },
  mealCardTitle: { color: '#7A6A62', fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginBottom: 10 },
  mealButtonRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mealTypeBtn: { flex: 1, backgroundColor: '#E8E0D8', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  mealTypeBtnText: { color: '#C96A50', fontSize: 12, fontWeight: '700' },
  mealChipScroll: { marginTop: 4 },
  mealChip: { backgroundColor: '#FBF0ED', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, borderWidth: 1, borderColor: '#C96A5030' },
  mealChipText: { color: '#C96A50', fontSize: 12 },
});
