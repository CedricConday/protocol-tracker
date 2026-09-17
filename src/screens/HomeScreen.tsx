import { Alert, Modal } from 'react-native';
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
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import DoseDetailModal from '../components/DoseDetailModal';
import SunMascot from '../components/SunMascot';
import DoseRow from '../components/DoseRow';
import StartDayButton from '../components/StartDayButton';
import UpcomingAppointmentCard from '../components/UpcomingAppointmentCard';
import { medicalDisclaimer } from '../config/links';
import { t, useLanguage, locale } from '../i18n';
import SkeletonCard from '../components/SkeletonCard';
import WeatherCard from '../components/WeatherCard';
import { startDay, getTodaySchedule, dosesPastBedtime } from '../engine/scheduler';
import { formatClock } from '../utils/time';
import { confirmDose, skipDose, skipDoseWithReason, logExercise, getTodayExercise, getProfile, setFirstMealTime, getFirstMealTime, getJournalEntry, getStreak, getDaySummary, getLatestJournalEntry, logMeal, getTodayMeals, getNextMedicalEvent, getMiscFlag, setMiscFlag, todayStr } from '../db/queries';
import { dismissWeeklyReport } from '../utils/autoReport';
import ShareSheet from '../share/ShareSheet';
import { clearAppBadge } from '../notifications';
import type { ScheduledDose, MedicalEvent } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  // locale(), not a hardcoded 'en-US': in German this has to read
  // "Sonntag, 14. September", which is a different order, not a translation.
  return d.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });
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
         <Text style={[headerStyles.celebrationText, { fontSize: 18 }]}>{t('homeAllDosesDone')}</Text>
       ) : (
         <View style={headerStyles.summaryRow}>
           <Text style={headerStyles.summaryCount}>{taken}</Text>
           <Text style={headerStyles.summaryOf}> {t('homeDosesOf', { total })}</Text>
         </View>
       )}
     </View>
  );
}

const headerStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#112438',
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
    color: '#495D72',
    fontSize: 13,
  },
  startedText: {
    color: '#495D72',
    fontSize: 13,
  },
  mealText: {
    color: '#F2B233',
    fontSize: 12,
    marginTop: 2,
  },
  tickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  tick: {
    color: '#617285',
    fontSize: 10,
  },
  trackOuter: {
    height: 10,
    backgroundColor: '#D8E1EA',
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: 14,
  },
  trackFill: {
    height: 10,
    backgroundColor: '#1162B9',
    borderRadius: 5,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  summaryCount: {
    color: '#112438',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryOf: {
    color: '#112438',
    fontSize: 20,
    fontWeight: '700',
  },
  summaryLabel: {
    color: '#495D72',
    fontSize: 15,
  },
  celebrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  celebrationIcon: {
    color: '#1162B9',
    fontSize: 22,
    fontWeight: '900',
  },
  celebrationText: {
    color: '#1162B9',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  readyText: {
    color: '#495D72',
    fontSize: 15,
  },
});



// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  useLanguage(); // re-render this screen when the language changes
  const navigation = useNavigation<any>();
  const {
    t0, setT0, dayLoaded, doses, setDoses, firstMealTime, setFirstMealTimeState,
    exerciseMinutes, setExerciseMinutes, exerciseType, setExerciseType,
    exerciseIntensity, setExerciseIntensity,
    todayMeals, setTodayMeals, patientName,
    showMagnesiumHint, setShowMagnesiumHint, showD3MealHint, setShowD3MealHint,
    showEngagementNudge, setShowEngagementNudge, lowStockSupps, setLowStockSupps,
    vitDDanger, insightText, currentStreak, milestoneModalVisible, setMilestoneModalVisible,
    todayMood, setTodayMood, todayNotePreview, latestJournal,
    refreshing, setRefreshing, starting, setStarting,
    weeklyDue, setWeeklyDue, nextMedicalEvent,
    showMealPrompt, setShowMealPrompt, showFirstEntryWizard, setShowFirstEntryWizard,
    loadDay,
  } = useHomeScreen(navigation);

  const [weeklyShareOpen, setWeeklyShareOpen] = useState(false);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [dosesExpanded, setDosesExpanded] = useState(false);
  const remainingDoses = doses.filter(
    (d) => d.status === 'upcoming' || d.status === 'due'
  ).length;
  const [initialLoading, setInitialLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadDay(); }, [loadDay]));

  useEffect(() => {
    if (t0 !== null || doses.length > 0 || !initialLoading) {
      const timer = setTimeout(() => setInitialLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [t0, doses, initialLoading]);

  useEffect(() => {
    const timer = setTimeout(() => setInitialLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const [strictMode, setStrictMode] = useState(false);

  useEffect(() => {
    getMiscFlag('strict_mode_enabled').then((v) => setStrictMode(v === 'true'));
  }, []);

  const energyCredits = doses.reduce((acc, d) => {
    if (d.status === 'taken') return acc + 1;
    if (d.status === 'missed' || d.status === 'skipped') return acc - 1;
    return acc;
  }, 10);
  const clampedCredits = Math.max(0, Math.min(10, energyCredits));

  useEffect(() => {
    setDosesExpanded(false);
  }, [doses]);

  /** Opens the day, after saying out loud what will not fit before bedtime. */
  const runStartDay = async () => {
    setStarting(true);
    try {
      const schedule = await startDay();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setT0(new Date());
      setDoses(schedule);
      setShowMealPrompt(true);
    } catch (error: any) {
      console.error('Error starting day:', error);
      Alert.alert(t('errorTitle'), t('startFailed'), [{ text: 'OK', style: 'cancel' }]);
    } finally {
      setStarting(false);
    }
  };

  /**
   * Starting late used to be refused outright (BEDTIME_GATE). It is now a
   * warning: the doses that would land after bedtime are named, and starting is
   * still the patient's call. A late start is a real day — refusing it recorded
   * nothing at all, which is worse for the protocol than a dose at 01:55.
   */
  const handleStartDay = async () => {
    let late: { name: string; at: Date }[] = [];
    try {
      late = await dosesPastBedtime();
    } catch (e) {
      // The warning is advisory. If it cannot be computed, start anyway rather
      // than blocking the day on a failure in the thing that only informs it.
      console.error('Could not check bedtime overlap:', e);
    }

    if (late.length === 0) {
      await runStartDay();
      return;
    }

    Alert.alert(
      t('startLateTitle'),
      `${t('startLateBody', { count: String(late.length) })}\n\n${late
        .map((d) => `· ${d.name}  ${formatClock(d.at)}`)
        .join('\n')}`,
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('startAnyway'), onPress: () => { runStartDay(); } },
      ],
    );
  };

  const handleLogExercise = async (minutes: number = 30, type: string = 'walk', intensity: string = 'moderate') => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await logExercise(minutes, type, todayStr(), intensity);
    setExerciseMinutes(prev => prev + minutes);
    setExerciseType(type);
    setExerciseIntensity(intensity);
  };

  const handleLogMeal = async () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
    await setFirstMealTime(todayStr(), timeStr);
    setFirstMealTimeState(timeStr);
    setShowMealPrompt(false);
  };

    const handleTook = async (dose: ScheduledDose) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        if (!dose.logId) {
          Alert.alert(t('errorTitle'), t('logDoseFailed'));
          return;
        }
        {
          await confirmDose(dose.logId);

          const reviewPrompted = await AsyncStorage.getItem('review_prompted');
          const streak = await getStreak();
          const todayCompliance = await getDaySummary();
          if (!reviewPrompted && streak >= 7 && todayCompliance.compliancePct === 100) {
            StoreReview.requestReview();
            await AsyncStorage.setItem('review_prompted', 'true');
          }
        }
        await loadDay();
      } catch {
        Alert.alert(t('errorTitle'), t('logDoseFailed'));
      } finally {
        setSelectedDose(null);
      }
    };

  const handleDosePress = useCallback((dose: ScheduledDose) => {
    setSelectedDose(dose);
  }, []);

  const handleSkip = async (dose: ScheduledDose, reason?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      if (!dose.logId) {
        Alert.alert(t('errorTitle'), t('skipDoseFailed'));
        return;
      }
      {
        if (reason) {
          await skipDoseWithReason(dose.logId, reason);
        } else {
          await skipDose(dose.logId);
        }
      }
      await loadDay();
    } catch {
      Alert.alert(t('errorTitle'), t('logDoseFailed'));
    } finally {
      setSelectedDose(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDay();
    setRefreshing(false);
  };

  const renderHeader = () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingTop: 12 }}>
      <View style={{ flex: 1 }}>
        {/* The mascot crowns the greeting. It sits in space the header was
            already leaving empty, so nothing below it moves. */}
        <View style={styles.mascotRow}>
          <SunMascot size={66} />
        </View>
        <Text style={[styles.greeting, { textAlign: 'center' }]}>
          {patientName ? t('homeGreeting', { name: patientName.split(' ')[0] }) : t('homeGreetingNoName')}
        </Text>
      </View>
    </View>
  );

  // ── Pre-day view ───────────────────────────────────────────────────────────

  // Until the anchor has been read, `t0` is null because nothing is known yet,
  // not because the day has not been started. Showing "Start My Day" here is
  // wrong for anyone already mid-protocol, so the skeleton holds the frame.
  if (!dayLoaded) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.scroll}>
          {renderHeader()}
          <SkeletonCard height={80} />
          <SkeletonCard height={120} />
          <SkeletonCard height={60} />
          <SkeletonCard height={80} />
          <SkeletonCard height={80} />
        </View>
      </SafeAreaView>
    );
  }

  if (!t0) {
    if (starting) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.scroll}>
            {renderHeader()}
            <SkeletonCard height={100} />
            <SkeletonCard height={80} />
            <SkeletonCard height={80} />
            <SkeletonCard height={60} />
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          {renderHeader()}
          <WeatherCard />
          <Text style={styles.subtitle}>
            {t('homeReadyPrompt')}
          </Text>
          <StartDayButton onPress={handleStartDay} loading={starting} />
        </View>
      </SafeAreaView>
    );
  }

  if (initialLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.scroll}>
          {renderHeader()}
          <SkeletonCard height={80} />
          <SkeletonCard height={120} />
          <SkeletonCard height={60} />
          <SkeletonCard height={80} />
          <SkeletonCard height={80} />
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
        <WeatherCard />

        {/* Opens the share sheet on last week rather than handing over a PDF
            that was written without being asked (2026-09-17). */}
        {weeklyDue ? (
          <TouchableOpacity
            style={styles.reportReadyBanner}
            onPress={() => setWeeklyShareOpen(true)}
            activeOpacity={0.8}
            accessibilityLabel={t('a11yShareWeekly')}
            accessibilityRole="button"
          >
            <Text style={styles.reportReadyText}>📄 {t('homeReportReady')}</Text>
            <TouchableOpacity onPress={async () => { await dismissWeeklyReport(); setWeeklyDue(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={t('a11yDismissReport')} accessibilityRole="button">
              <Text style={styles.reportReadyDismiss}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ) : null}

        {vitDDanger !== null ? (
          <View style={styles.vitDBanner}>
            <Text style={styles.vitDBannerText} accessibilityLiveRegion="polite">{t('homeVitDLatest', { value: vitDDanger })}</Text>
          </View>
        ) : null}

        {lowStockSupps.map((s) => (
          <View key={s.id} style={styles.reorderBanner}>
            <Text style={styles.reorderBannerText}>{t('homeReorderBanner', { name: s.name, doses: s.quantity_on_hand ?? 0 })}</Text>
            <TouchableOpacity onPress={async () => {
              const week = new Date().toISOString().slice(0, 7);
              await AsyncStorage.setItem(`dismissed_reorder_${s.id}_${week}`, 'true');
              setLowStockSupps((prev) => prev.filter((x) => x.id !== s.id));
            }} accessibilityLabel={t('a11yDismissReorder')} accessibilityRole="button">
              <Text style={styles.reorderBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {showEngagementNudge ? (
          <View style={styles.nudgeBanner}>
            <Text style={styles.nudgeBannerText}>{t('homeNudgeBanner')}</Text>
            <TouchableOpacity onPress={() => setShowEngagementNudge(false)} accessibilityLabel={t('a11yDismissNudge')} accessibilityRole="button">
              <Text style={styles.nudgeBannerDismiss}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {insightText ? (
          <View style={styles.insightCard}>
            <Text style={styles.insightLabel}>{t('homeProtocolTip')}</Text>
            <Text style={styles.insightText}>{insightText}</Text>
          </View>
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
            <Text style={styles.wizardTitle}>{t('homeWizardTitle')}</Text>
            <Text style={styles.wizardStep}>{t('homeWizardStep1')}</Text>
            <Text style={styles.wizardStep}>{t('homeWizardStep2')}</Text>
            <Text style={styles.wizardStep}>{t('homeWizardStep3')}</Text>
            <Text style={styles.wizardStep}>{t('homeWizardStep4')}</Text>
            <TouchableOpacity style={styles.wizardBtn} onPress={async () => { await AsyncStorage.setItem('first_entry_wizard_shown', 'true'); setShowFirstEntryWizard(false); }} activeOpacity={0.8} accessibilityLabel={t('a11yDismissWizard')} accessibilityRole="button">
              <Text style={styles.wizardBtnText}>{t('homeWizardCta')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Still actionable: upcoming or due. A taken, skipped or missed dose
            is resolved and should not be counted as something left to do. */}
        {doses.length > 0 ? (
          <>
            {doses.every((d) => d.status === 'taken') ? (
              <Text style={styles.allDoneLabel}>{t('homeAllDone')}</Text>
            ) : (
              // A single dose has nothing to collapse. The teaser read "0 more
              // doses today — tap to view all" over an empty stack, and the
              // one dose of the day was not on screen at all until it was
              // tapped. Treat a one-dose day as already expanded.
              (dosesExpanded || doses.length <= 1) ? (
                // Expanded, the list is just a list. Keeping the outer touchable
                // here nested DoseRow and Collapse inside a button, so the wrapper
                // competed with them for the touch responder and a long-press
                // anywhere re-fired expand.
                <View>
                  <Text style={styles.sectionLabel}>DOSES</Text>
                  {doses.map((dose) => (
                    <DoseRow key={dose.id} dose={dose} onPress={() => handleDosePress(dose)} />
                  ))}
                  {doses.length > 1 ? (
                    <TouchableOpacity
                      style={styles.collapseBtn}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setDosesExpanded(false);
                      }}
                      activeOpacity={0.7}
                      accessibilityLabel={t('a11yCollapseDoses')}
                      accessibilityRole="button"
                    >
                      <Text style={styles.collapseBtnText}>{t('collapse')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setDosesExpanded(true);
                  }}
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setDosesExpanded(true);
                  }}
                  accessibilityLabel={t('a11yExpandDoses')}
                  accessibilityRole="button"
                >
                  <View>
                    {/* Stacked peek cards. `slice(1, …)` dated from when the
                        first dose was rendered above this teaser; nothing is,
                        so it drew one card too few. */}
                    <View style={styles.stackPeek}>
                      {doses.slice(0, 3).map((d, i) => (
                        <View key={d.id} style={[styles.stackCard, { top: -i * 8 }]} />
                      ))}
                    </View>
                    {/* Doses still to take, not the size of the list.
                        `doses.length - 1` was wrong twice over: off by one for
                        the same reason as the stack above, and counting TOTAL
                        rather than REMAINING, so on a four-dose day it read "3
                        more doses" whether none had been taken or three had.
                        Reported from the device: "It always say 3 no matter
                        what." */}
                    <Text style={styles.stackLabel}>
                      {remainingDoses === 0
                        ? t('homeTapToView', { count: doses.length })
                        : t(remainingDoses === 1 ? 'homeDoseLeft' : 'homeDosesLeft', { count: remainingDoses })}
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            )}
          </>
        ) : (
          <View style={styles.emptyDoses}>
            <Text style={styles.emptyDosesIcon}>💊</Text>
            <Text style={styles.emptyDosesTitle}>{t('homeNoDoses')}</Text>
            <Text style={styles.emptyDosesSub}>{t('homeNoDosesSub')}</Text>
        </View>
      )}

        <Text style={styles.homeDisclaimer}>{medicalDisclaimer()}</Text>

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
        accessibilityViewIsModal={true}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('homeMilestoneTitle')}</Text>
            <Text style={styles.modalBody}>{t('homeMilestoneBody', { days: currentStreak })}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={async () => {
                await setMiscFlag('last_90_modal_shown', String(currentStreak));
                setMilestoneModalVisible(false);
              }}
              activeOpacity={0.8}
              accessibilityLabel={t('a11yDismissMilestone')}
              accessibilityRole="button"
            >
              <Text style={styles.modalButtonText}>{t('continue')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ShareSheet
        visible={weeklyShareOpen}
        onClose={() => setWeeklyShareOpen(false)}
        initialPreset="7d"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFE',
  },
  lastEntryCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 12, marginHorizontal: 0 },
  lastEntryTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  lastEntryEmoji: { fontSize: 22 },
  lastEntryDate: { color: '#495D72', fontSize: 12 },
  lastEntryNote: { color: '#112438', fontSize: 14, lineHeight: 20 },
  lastEntryEmpty: { color: '#617285', fontSize: 14, textAlign: 'center' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  modalContent: {
    backgroundColor: '#F7FAFE',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#112438',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalBody: {
    color: '#495D72',
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
    color: '#F7FAFE',
    fontSize: 16,
    fontWeight: '800',
  },
  quickLinksRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 16 },
  quickLink: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 10 },
  quickLinkText: { color: '#495D72', fontSize: 13, fontWeight: '600' },
  reorderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEEFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1162B9',
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    gap: 10,
  },
  reorderBannerText: {
    flex: 1,
    color: '#004593',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  reorderBannerDismiss: {
    color: '#617285',
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
  mascotRow: {
    alignItems: 'center',
    marginBottom: 6,
  },
  greeting: {
    color: '#112438',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#495D72',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  exerciseLabel: {
    color: '#495D72',
    fontSize: 14,
  },
  exerciseDone: {
    color: '#227D4C',
    fontWeight: '700',
    marginTop: 8,
  },
  exerciseLogButton: {
    backgroundColor: '#DEEFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1162B9',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  exerciseLogButtonText: {
    color: '#1162B9',
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
    borderColor: '#C0392B',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  reportReadyBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#EBF0F5', borderRadius: 10, padding: 14, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#2AA6B8' },
  reportReadyText: { color: '#2AA6B8', fontSize: 13, fontWeight: '600', flex: 1 },
  reportReadyDismiss: { color: '#617285', fontSize: 16, paddingLeft: 12 },
  emptyDoses: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyDosesIcon: { fontSize: 40, marginBottom: 12 },
  emptyDosesTitle: { color: '#112438', fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyDosesSub: { color: '#617285', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  allDoneLabel: { color: '#22c55e', fontSize: 16, fontWeight: '700', textAlign: 'center', marginVertical: 12 },
  relapseButtonInline: {
    borderWidth: 1.5,
    borderColor: '#C0392B',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  sectionLabel: { color: '#617285', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  stackPeek: { height: 20, marginBottom: 8, position: 'relative' },
  stackCard: { position: 'absolute', left: 0, right: 0, height: 8, backgroundColor: '#E9EFF6', borderRadius: 6, shadowColor: '#112438', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  stackLabel: { color: '#1162B9', fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  collapseBtn: { backgroundColor: '#FFFFFF', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: '#8393A3' },
  collapseBtnText: { color: '#495D72', fontSize: 13, fontWeight: '600' },
  energyCard: { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#22c55e30' },
  energyLabel: { color: '#166534', fontSize: 13, fontWeight: '600' },
  energyCount: { color: '#166534', fontSize: 13, fontWeight: '700' },
  energyDot: { width: 20, height: 20, borderRadius: 10, flex: 1 },
  relapseButtonText: {
    color: '#C0392B',
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
    borderColor: '#8393A3',
    paddingVertical: 8,
    alignItems: 'center',
  },
  exercisePillActive: {
    borderColor: '#1162B9',
    backgroundColor: '#DEEFFF',
  },
  exercisePillText: {
    color: '#617285',
    fontSize: 12,
    fontWeight: '600',
  },
  exercisePillTextActive: {
    color: '#1162B9',
  },
  exerciseIntensityPill: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8393A3',
    paddingVertical: 8,
    alignItems: 'center',
  },
  exerciseIntensityActive: {
    borderColor: '#F2B233',
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
    backgroundColor: '#DEEFFF',
    borderWidth: 1,
    borderColor: '#1162B930',
    paddingVertical: 10,
    alignItems: 'center',
  },
  exerciseMinButtonText: {
    color: '#1162B9',
    fontSize: 14,
    fontWeight: '700',
  },
  mealPromptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealPromptTitle: {
    color: '#112438',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  mealPromptButton: {
    backgroundColor: '#1162B9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  mealPromptButtonText: {
    color: '#F7FAFE',
    fontSize: 14,
    fontWeight: '800',
  },
  journalSummaryCard: {
    backgroundColor: '#FFFFFF',
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
    color: '#495D72',
    fontSize: 14,
    fontWeight: '600',
  },
  journalSummaryPreview: {
    color: '#495D72',
    fontSize: 13,
    fontStyle: 'italic',
  },
  journalSummaryPrompt: {
    color: '#617285',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    textDecorationColor: '#1162B9',
  },
  consentBanner: { backgroundColor: '#EBF0F5', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#2AA6B8' },
  consentBannerTitle: { color: '#2AA6B8', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  consentBannerText: { color: '#495D72', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  consentBannerBtn: { backgroundColor: '#2AA6B8', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  consentBannerBtnText: { color: '#F7FAFE', fontSize: 13, fontWeight: '700' },
  nudgeBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8EC', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#F2B233', gap: 10 },
  nudgeBannerText: { flex: 1, color: '#8A5A10', fontSize: 13, lineHeight: 18 },
  nudgeBannerDismiss: { color: '#617285', fontSize: 16, fontWeight: '700' },
  insightCard: { backgroundColor: '#DEEFFF', borderRadius: 12, padding: 14, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#1162B9' },
  insightLabel: { color: '#1162B9', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 },
  insightText: { color: '#495D72', fontSize: 14, lineHeight: 22 },
  homeDisclaimer: { color: '#617285', fontSize: 11, lineHeight: 17, marginTop: 28 },
  strictBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8EC', borderRadius: 8, padding: 10, marginBottom: 10, gap: 8, borderWidth: 1, borderColor: '#eab308' },
  strictAmberDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#eab308' },
  strictBadgeText: { color: '#8A5A10', fontSize: 13, fontWeight: '600', flex: 1 },
  hintCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8EC', borderRadius: 10, padding: 12, marginBottom: 10, borderLeftWidth: 3, borderLeftColor: '#F2B233', gap: 10 },
  hintCardInner: { flex: 1 },
  hintCardTitle: { color: '#F2B233', fontSize: 11, fontWeight: '700', letterSpacing: 0.3, marginBottom: 4 },
  hintCardText: { color: '#495D72', fontSize: 12, lineHeight: 18 },
  hintCardDismiss: { color: '#617285', fontSize: 16, fontWeight: '700' },
  wizardCard: { backgroundColor: '#DEEFFF', borderRadius: 14, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#1162B940' },
  wizardTitle: { color: '#1162B9', fontSize: 15, fontWeight: '800', marginBottom: 12 },
  wizardStep: { color: '#495D72', fontSize: 13, lineHeight: 20, marginBottom: 8 },
  wizardBtn: { backgroundColor: '#1162B9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  wizardBtnText: { color: '#F7FAFE', fontSize: 14, fontWeight: '800' },
  mealCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 12 },
  mealCardTitle: { color: '#495D72', fontSize: 12, fontWeight: '600', letterSpacing: 0.2, marginBottom: 10 },
  mealButtonRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  mealTypeBtn: { flex: 1, backgroundColor: '#D8E1EA', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  mealTypeBtnText: { color: '#1162B9', fontSize: 12, fontWeight: '700' },
  mealChipScroll: { marginTop: 4 },
  mealChip: { backgroundColor: '#DEEFFF', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, borderWidth: 1, borderColor: '#1162B930' },
  mealChipText: { color: '#1162B9', fontSize: 12 },
});
