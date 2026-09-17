import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DoseDetailModal from '../components/DoseDetailModal';
import { confirmDose, skipDose, localDateStr } from '../db/queries';
import { useScheduleScreen } from '../hooks';
import type { ScheduledDose } from '../types';
import EmptyState from '../components/EmptyState';

import { t, useLanguage } from '../i18n';
import { monthNames } from '../i18n/dates';

interface DayCell { date: string; dayNumber: number; compliancePct: number; totalDoses: number; isToday: boolean; }

function buildLast30Days(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(localDateStr(d));
  }
  return days;
}

function getCellColor(pct: number, total: number) {
  if (total === 0) return '#D8E1EA';
  if (pct >= 80) return '#227D4C';
  if (pct >= 50) return '#F2B233';
  return '#C0392B';
}


function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

export default function ScheduleScreen() {
  useLanguage(); // re-render this screen when the language changes
  const navigation = useNavigation<any>();
  const {
    doses, refreshing, setRefreshing, loaded, showHighDoseAlert, setShowHighDoseAlert,
    calCells, calLoaded, loadSchedule, loadCalendar,
  } = useScheduleScreen();
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);
  const [activeView, setActiveView] = useState<'today' | 'history'>('today');

  useFocusEffect(useCallback(() => { loadSchedule(); }, [loadSchedule]));

  useEffect(() => {
    if (activeView === 'history') loadCalendar();
  }, [activeView, loadCalendar]);

  const handleTook = async (dose: ScheduledDose) => {
    try {
      if (dose.logId) {
        await confirmDose(dose.logId);
      }
      await loadSchedule();
    } catch {
      Alert.alert(t('errorTitle'), t('logDoseFailed'));
    } finally {
      setSelectedDose(null);
    }
  };

  const handleSkip = async (dose: ScheduledDose) => {
    try {
      if (dose.logId) {
        await skipDose(dose.logId);
      }
      await loadSchedule();
    } catch {
      Alert.alert(t('errorTitle'), t('logDoseFailed'));
    } finally {
      setSelectedDose(null);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSchedule();
    setRefreshing(false);
  };

  const renderToggle = () => (
    <View style={styles.toggleRow}>
      <TouchableOpacity style={[styles.toggleBtn, activeView === 'today' ? styles.toggleBtnActive : null]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveView('today'); }} activeOpacity={0.7}>
        <Text style={[styles.toggleBtnText, activeView === 'today' ? styles.toggleBtnTextActive : null]}>{t('today')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.toggleBtn, activeView === 'history' ? styles.toggleBtnActive : null]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setActiveView('history'); }} activeOpacity={0.7}>
        <Text style={[styles.toggleBtnText, activeView === 'history' ? styles.toggleBtnTextActive : null]}>{t('history')}</Text>
      </TouchableOpacity>
    </View>
  );

  if (activeView === 'history') {
    const now = new Date();
    const rows: DayCell[][] = [];
    for (let i = 0; i < calCells.length; i += 6) rows.push(calCells.slice(i, i + 6));
    return (
      <View style={styles.container}>
        <View style={styles.headingRow}>
          <Text style={styles.heading}>{monthNames()[now.getMonth()]} {now.getFullYear()}</Text>
        </View>
        {renderToggle()}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          {calLoaded && rows.map((row, ri) => (
            <View key={ri} style={styles.calRow}>
              {row.map((cell) => {
                const bg = cell.isToday
                  ? (cell.totalDoses === 0 ? '#617285' : cell.compliancePct >= 80 ? '#4A7A4A' : cell.compliancePct >= 50 ? '#B07820' : '#A03030')
                  : getCellColor(cell.compliancePct, cell.totalDoses);
                return (
                  <View key={cell.date} style={styles.calCellWrapper}>
                    <View style={[styles.calCell, { backgroundColor: bg }, cell.isToday ? styles.calCellToday : null]}>
                      <Text style={styles.calCellText}>{cell.dayNumber}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
          <View style={styles.legend}>
            {[['#227D4C','≥80%'],['#F2B233','50–79%'],['#C0392B','<50%'],['#D8E1EA',t('noData')]].map(([color, label]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color, borderWidth: color === '#2a2a2a' ? 1 : 0, borderColor: '#444' }]} />
                <Text style={styles.legendLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  if (loaded && doses.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>{t('schTodaysSchedule')}</Text>
        {renderToggle()}
        <EmptyState
          icon="⏱"
          title={t('schNoDoses')}
          subtitle={t('schNoDosesSub')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t('schTodaysSchedule')}</Text>
      </View>
      {renderToggle()}

      {showHighDoseAlert ? (
        <TouchableOpacity
          style={styles.highDoseBanner}
          onPress={async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            await AsyncStorage.setItem('high_dose_alert_week', isoWeek(new Date()));
            setShowHighDoseAlert(false);
          }}
          activeOpacity={0.9}
        >
          <Text style={styles.highDoseBannerText}>
            ⚠ High-dose D3 detected. Ensure adequate hydration (2.5L/day), low-calcium diet, and regular kidney function monitoring per the Protocol guidelines.
          </Text>
          <Text style={styles.highDoseBannerDismiss}>{t('schGotIt')}</Text>
        </TouchableOpacity>
      ) : null}

      <FlatList
        data={doses}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedDose(item); }}
              activeOpacity={0.7}
            >
              <View style={styles.info}>
                <Text style={styles.name}>{item.supplementName}</Text>
                {item.status === 'skipped' && item.logId && (
                  <Text style={styles.skipReasonText}>{item.skipReason ?? t('skipped')}</Text>
                )}

                <View style={{ marginLeft: 'auto', paddingLeft: 12 }}>
                  {item.status === 'taken' ? (
                    <Text style={{ color: '#227D4C', fontWeight: '700' }}>{t('taken')}</Text>
                  ) : item.status === 'missed' ? (
                    <Text style={{ color: '#C0392B', fontWeight: '700' }}>{t('missed')}</Text>
                  ) : item.status === 'skipped' ? (
                    <Text style={{ color: '#495D72', fontWeight: '700' }}>{t('skipped')}</Text>
                  ) : (
                    <View style={{ backgroundColor: item.status === 'due' ? '#1162B9' : '#FFFFFF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#1162B9' }}>
                      <Text style={{ color: item.status === 'due' ? '#F7FAFE' : '#1162B9', fontWeight: '800', fontSize: 12 }}>{item.status === 'due' ? t('schTake') : t('schWait')}</Text>
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1162B9" />
        }
      />

      <DoseDetailModal
        visible={selectedDose !== null}
        dose={selectedDose}
        onClose={() => setSelectedDose(null)}
        onTook={handleTook}
        onSkip={handleSkip}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFE',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heading: {
    color: '#112438',
    fontSize: 22,
    fontWeight: '700',
  },
  scanBtn: { backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#1162B9' },
  scanBtnText: { color: '#1162B9', fontSize: 14, fontWeight: '600' },
  highDoseBanner: {
    backgroundColor: '#FDF3E0',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F2B23360',
    padding: 14,
    marginBottom: 14,
  },
  highDoseBannerText: {
    color: '#F2B233',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8,
  },
  highDoseBannerDismiss: {
    color: '#F2B233',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    opacity: 0.7,
  },
  list: {
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 64,
  },
  timeCol: {
    width: 56,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 12,
  },
  timeText: {
    color: '#495D72',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 18,
  },
  timeTextDimmed: {
    color: '#617285',
  },
  timeTextDue: {
    color: '#1162B9',
  },
  trackCol: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lineSegment: {
    flex: 1,
    width: 1,
    backgroundColor: '#D8E1EA',
  },
  lineSegmentInvisible: {
    backgroundColor: 'transparent',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginVertical: 2,
  },
  info: {
    flex: 1,
    paddingLeft: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#D8E1EA',
  },
  name: {
    color: '#112438',
    fontSize: 15,
    fontWeight: '600',
  },
  doseAmount: {
    color: '#495D72',
    fontSize: 15,
    marginTop: 2,
  },
  foodTag: {
    color: '#F2B233',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
  },
  skipReasonText: {
    color: '#617285',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 3,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#495D72',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  toggleRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 14, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: '#8393A3' },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#F7FAFE' },
  toggleBtnText: { color: '#617285', fontSize: 13, fontWeight: '700' },
  toggleBtnTextActive: { color: '#1162B9' },
  calRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  calCellWrapper: { flex: 1, aspectRatio: 1 },
  calCell: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  calCellToday: { borderWidth: 2, borderColor: '#112438' },
  calCellText: { color: '#F7FAFE', fontSize: 12, fontWeight: '700' },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 14, paddingTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { color: '#495D72', fontSize: 11, fontWeight: '500' },
});
