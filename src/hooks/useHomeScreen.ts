import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getAnchor, getDaySummary, getStreak, getMiscFlag, setMiscFlag,
  getProfile, getTodayExercise, getTodaySunLog, getFirstMealTime,
  getJournalEntry, getLatestJournalEntry, getTodayMeals,
  getNextMedicalEvent, getLatestLabResult, getSupplementsLowStock,
  todayStr,
} from '../db/queries';
import { getTodaySchedule } from '../engine/scheduler';
import { checkAndGenerateWeeklyReport } from '../utils/autoReport';
import { clearAppBadge } from '../notifications';
import type { MedicalEvent } from '../types';

export function useHomeScreen(navigation: any) {
  const [t0, setT0] = useState<Date | null>(null);
  const [doses, setDoses] = useState<any[]>([]);
  const [waterMl, setWaterMl] = useState(0);
  const [firstMealTime, setFirstMealTimeState] = useState<string | null>(null);
  const [exerciseMinutes, setExerciseMinutes] = useState(0);
  const [exerciseType, setExerciseType] = useState('walk');
  const [exerciseIntensity, setExerciseIntensity] = useState('moderate');
  const [sunMinutes, setSunMinutes] = useState(0);
  const [todayMeals, setTodayMeals] = useState<{ id: number; meal_type: string; time: string }[]>([]);
  const [patientName, setPatientName] = useState('');
  const [isCaregiver, setIsCaregiver] = useState(false);
  const [caregiverPatientName, setCaregiverPatientName] = useState('');
  const [showFatigueAlert, setShowFatigueAlert] = useState(false);
  const [showSurveyPrompt, setShowSurveyPrompt] = useState(false);
  const [showMagnesiumHint, setShowMagnesiumHint] = useState(false);
  const [showD3MealHint, setShowD3MealHint] = useState(false);
  const [showEngagementNudge, setShowEngagementNudge] = useState(false);
  const [lowStockSupps, setLowStockSupps] = useState<{id: string; name: string; quantity_on_hand: number}[]>([]);
  const [vitDDanger, setVitDDanger] = useState<number | null>(null);
  const [insightText, setInsightText] = useState('');
  const [currentStreak, setCurrentStreak] = useState(0);
  const [milestoneModalVisible, setMilestoneModalVisible] = useState(false);
  const [todayMood, setTodayMood] = useState<string | null>(null);
  const [todayNotePreview, setTodayNotePreview] = useState('');
  const [latestJournal, setLatestJournal] = useState<{ mood: string; note: string; date: string } | null | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [reportReadyUri, setReportReadyUri] = useState<string | null>(null);
  const [nextMedicalEvent, setNextMedicalEvent] = useState<MedicalEvent | null>(null);
  const [showMealPrompt, setShowMealPrompt] = useState(false);
  const [showFirstEntryWizard, setShowFirstEntryWizard] = useState(false);

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
    const journal = await getJournalEntry(todayStr());
    setTodayMood(journal?.mood ?? null);
    setTodayNotePreview(journal?.note?.slice(0, 60) ?? '');
    const latest = await getLatestJournalEntry();
    setLatestJournal(latest ? { mood: latest.mood, note: latest.note, date: latest.date } : null);
    const meals = await getTodayMeals(todayStr());
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
      const today = todayStr();
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

  // Pure-tracker build: app-authored "Protocol tip" insights and the
  // magnesium / D3-with-meal hints were medical advice — removed. insightText
  // stays '' and the hint flags stay false, so their UI guards render nothing.

  useEffect(() => {
    if (t0) {
      AsyncStorage.getItem('first_entry_wizard_shown').then((v) => {
        if (!v) setShowFirstEntryWizard(true);
      });
    }
  }, [t0]);

  useEffect(() => {
    (async () => {
      const [last, installDate] = await Promise.all([
        AsyncStorage.getItem('last_active_date'),
        AsyncStorage.getItem('install_date'),
      ]);
      const now = todayStr();
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

  useEffect(() => {
    getNextMedicalEvent().then(setNextMedicalEvent).catch(() => setNextMedicalEvent(null));
  }, []);

  // Pure-tracker build: interpreting a lab value (D3 "critically low" → contact
  // your doctor) is medical advice — removed. vitDDanger stays null so the
  // banner never renders.

  useEffect(() => {
    (async () => {
      const s = await getStreak();
      setCurrentStreak(s);
      if (s >= 90 && s % 90 === 0) {
        const shown = await getMiscFlag('last_90_modal_shown');
        if (shown !== String(s)) {
          setMilestoneModalVisible(true);
        }
      }
    })();
  }, []);

  return {
    t0, setT0, doses, setDoses, waterMl, setWaterMl, firstMealTime, setFirstMealTimeState,
    exerciseMinutes, setExerciseMinutes, exerciseType, setExerciseType,
    exerciseIntensity, setExerciseIntensity, sunMinutes, setSunMinutes,
    todayMeals, setTodayMeals,
    patientName, isCaregiver, caregiverPatientName,
    showFatigueAlert, setShowFatigueAlert,
    showSurveyPrompt, setShowSurveyPrompt,
    showMagnesiumHint, setShowMagnesiumHint,
    showD3MealHint, setShowD3MealHint,
    showEngagementNudge, setShowEngagementNudge,
    lowStockSupps, setLowStockSupps,
    vitDDanger, insightText,
    currentStreak, milestoneModalVisible, setMilestoneModalVisible,
    todayMood, setTodayMood, todayNotePreview, latestJournal,
    refreshing, setRefreshing, starting, setStarting,
    reportReadyUri, setReportReadyUri,
    nextMedicalEvent,
    showMealPrompt, setShowMealPrompt,
    showFirstEntryWizard, setShowFirstEntryWizard,
    loadDay,
  };
}
