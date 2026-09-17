import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { t, useLanguage } from '../i18n';

// The goal is context, not a ceiling. High-dose D3 protocols ask for intake well
// above 2.5 L, and the old card swapped its button for a "goal reached" banner at
// exactly that point — so the litres that matter most were the ones it refused to
// record.
export const DEFAULT_GOAL_ML = 2500;
// Always five segments, whatever the goal. Dividing by a fixed 500 ml meant a
// 4 L goal drew eight slivers and a 1 L goal drew two fat ones; dividing the
// goal instead keeps the bar reading the same at any target, and at the 2.5 L
// default it is the same five-by-500 bar it has always been.
const SEGMENTS = 5;
const PRESETS = [150, 250, 500, 750];
const STEP = 50;

interface Props {
  waterMl: number;
  onAdd: (amountMl: number) => void;
  /** The day's target. Callers that do not set one get the protocol default. */
  goalMl?: number;
}

const WaterTracker = React.memo(function WaterTracker({ waterMl, onAdd, goalMl = DEFAULT_GOAL_ML }: Props) {
  useLanguage(); // memoised: without this the language switch never reaches it
  const [amount, setAmount] = useState(250);
  const [draft, setDraft] = useState('250');

  // A goal of 0 would divide by zero and render NaN-wide bars, so the segment
  // size floors at 1 ml: the bar simply reads full, which is the truth.
  const segmentMl = Math.max(1, goalMl / SEGMENTS);
  const goalReached = waterMl >= goalMl;
  const fullSegments = Math.floor(waterMl / segmentMl);
  const partialRatio = (waterMl % segmentMl) / segmentMl;

  const setBoth = (next: number) => {
    const clamped = Math.max(STEP, Math.min(5000, next));
    setAmount(clamped);
    setDraft(String(clamped));
  };

  const commitDraft = () => {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10);
    setBoth(Number.isFinite(parsed) ? parsed : amount);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={styles.droplet}>💧</Text>
          <Text style={styles.label}>{t('water')}</Text>
        </View>
        <Text style={[styles.amount, goalReached ? styles.amountDone : null]}>
          {waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)}L` : `${waterMl}ml`}
          <Text style={styles.goal}> · goal {goalMl >= 1000 ? `${(goalMl / 1000).toFixed(1)}L` : `${goalMl}ml`}</Text>
        </Text>
      </View>

      <View style={styles.segmentRow}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const isFull = i < fullSegments;
          const isPartial = i === fullSegments && partialRatio > 0;
          return (
            <View key={i} style={styles.segmentTrack}>
              {isFull ? (
                <View style={[styles.segmentFill, goalReached ? styles.segmentDone : styles.segmentFull]} />
              ) : isPartial ? (
                <View style={styles.segmentPartialContainer}>
                  <View style={[styles.segmentFill, styles.segmentPartial, { width: `${partialRatio * 100}%` }]} />
                </View>
              ) : (
                <View style={[styles.segmentFill, styles.segmentEmpty]} />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => setBoth(amount - STEP)}
          activeOpacity={0.7}
          accessibilityLabel={t('waterAmountDown')}
          accessibilityRole="button"
        >
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>

        <View style={styles.field}>
          <TextInput
            style={styles.fieldInput}
            value={draft}
            onChangeText={setDraft}
            onEndEditing={commitDraft}
            onBlur={commitDraft}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={commitDraft}
            accessibilityLabel={t('waterAmountField')}
          />
          <Text style={styles.fieldUnit}>ml</Text>
        </View>

        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => setBoth(amount + STEP)}
          activeOpacity={0.7}
          accessibilityLabel={t('waterAmountUp')}
          accessibilityRole="button"
        >
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.presetRow}>
        {PRESETS.map((ml) => (
          <TouchableOpacity
            key={ml}
            style={[styles.preset, amount === ml ? styles.presetActive : null]}
            onPress={() => setBoth(ml)}
            activeOpacity={0.7}
            accessibilityLabel={t('waterSetMlA11y', { ml })}
            accessibilityRole="button"
          >
            <Text style={[styles.presetText, amount === ml ? styles.presetTextActive : null]}>{ml}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.logBtn}
        onPress={() => onAdd(amount)}
        activeOpacity={0.85}
        accessibilityLabel={t('waterLogMlA11y', { ml: amount })}
        accessibilityRole="button"
      >
        <Text style={styles.logBtnText}>{t('waterLogMl', { ml: amount })}</Text>
      </TouchableOpacity>
    </View>
  );
});

export default WaterTracker;

const styles = StyleSheet.create({
  container: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#8393A3', shadowColor: '#112438', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  droplet: { fontSize: 16 },
  label: { color: '#495D72', fontSize: 14, fontWeight: '600' },
  amount: { color: '#112438', fontSize: 16, fontWeight: '700' },
  amountDone: { color: '#227D4C' },
  goal: { color: '#617285', fontSize: 13, fontWeight: '400' },
  segmentRow: { flexDirection: 'row', gap: 4, marginBottom: 14 },
  segmentTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#D8E1EA' },
  segmentFill: { height: '100%', borderRadius: 5 },
  segmentFull: { width: '100%', backgroundColor: '#2AA6B8' },
  segmentDone: { width: '100%', backgroundColor: '#227D4C' },
  segmentPartialContainer: { width: '100%', height: '100%', flexDirection: 'row' },
  segmentPartial: { backgroundColor: '#63C2D1' },
  segmentEmpty: { width: '100%', backgroundColor: 'transparent' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: '#F7FAFE', borderWidth: 1, borderColor: '#8393A3', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: '#495D72', fontSize: 22, fontWeight: '600', lineHeight: 26 },
  field: { flex: 1, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 12, backgroundColor: '#F7FAFE', borderWidth: 1, borderColor: '#8393A3' },
  fieldInput: { minWidth: 64, textAlign: 'right', color: '#112438', fontSize: 19, fontWeight: '700', padding: 0 },
  fieldUnit: { color: '#617285', fontSize: 14, fontWeight: '600' },
  presetRow: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  preset: { flex: 1, height: 44, borderRadius: 11, backgroundColor: '#F7FAFE', borderWidth: 1, borderColor: '#8393A3', alignItems: 'center', justifyContent: 'center' },
  presetActive: { backgroundColor: '#EAF7F9', borderColor: '#2AA6B8' },
  presetText: { color: '#495D72', fontSize: 14, fontWeight: '600' },
  presetTextActive: { color: '#2AA6B8', fontWeight: '700' },
  logBtn: { height: 48, borderRadius: 12, backgroundColor: '#2AA6B8', alignItems: 'center', justifyContent: 'center' },
  logBtnText: { color: '#F7FAFE', fontSize: 15, fontWeight: '700' },
});
