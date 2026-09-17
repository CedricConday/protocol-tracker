import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { t, useLanguage } from '../i18n';

// The goal is context, not a ceiling. Someone who spent two hours outside should be
// able to say so; the old card swapped its buttons for a "goal reached" banner at
// 30 minutes, which silently made 30 the most the day could ever hold.
export const DEFAULT_SUN_GOAL_MIN = 30;
const PRESETS = [10, 20, 30, 60];
const STEP = 5;

interface Props {
  sunMinutes: number;
  onLog: (minutes: number) => void;
  /** The day's target. Editable on the Sunlight screen and stored in
   *  misc_flags; 30 was hardcoded here, so the card contradicted the goal the
   *  user had just set. Same prop shape as WaterTracker's `goalMl`. */
  goalMin?: number;
}

const SunTracker = React.memo(function SunTracker({ sunMinutes, onLog, goalMin = DEFAULT_SUN_GOAL_MIN }: Props) {
  useLanguage(); // memoised: without this the language switch never reaches it
  const [amount, setAmount] = useState(20);
  const [draft, setDraft] = useState('20');

  const goalReached = sunMinutes >= goalMin;
  const pct = Math.min(sunMinutes / Math.max(1, goalMin), 1);

  const setBoth = (next: number) => {
    const clamped = Math.max(STEP, Math.min(600, next));
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
          <Text style={styles.icon}>☀️</Text>
          <Text style={styles.label}>{t('sunExposure')}</Text>
        </View>
        <Text style={[styles.amount, goalReached ? styles.amountDone : null]}>
          {sunMinutes}
          <Text style={styles.goal}> min · goal {goalMin}</Text>
        </Text>
      </View>

      <View style={styles.barBg}>
        <View style={[styles.barFill, goalReached ? styles.barFillDone : null, { width: `${pct * 100}%` as `${number}%` }]} />
      </View>

      <View style={styles.stepperRow}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => setBoth(amount - STEP)}
          activeOpacity={0.7}
          accessibilityLabel={t('sunMinutesDown')}
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
            accessibilityLabel={t('sunMinutesField')}
          />
          <Text style={styles.fieldUnit}>{t('unitMin')}</Text>
        </View>

        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => setBoth(amount + STEP)}
          activeOpacity={0.7}
          accessibilityLabel={t('sunMinutesUp')}
          accessibilityRole="button"
        >
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.presetRow}>
        {PRESETS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[styles.preset, amount === m ? styles.presetActive : null]}
            onPress={() => setBoth(m)}
            activeOpacity={0.7}
            accessibilityLabel={t('trkSetMinutesA11y', { minutes: m })}
            accessibilityRole="button"
          >
            <Text style={[styles.presetText, amount === m ? styles.presetTextActive : null]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.logBtn}
        onPress={() => onLog(amount)}
        activeOpacity={0.85}
        accessibilityLabel={t('sunLogMinutesA11y', { minutes: amount })}
        accessibilityRole="button"
      >
        <Text style={styles.logBtnText}>{t('trkLogMinutes', { minutes: amount })}</Text>
      </TouchableOpacity>
    </View>
  );
});

export default SunTracker;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#8393A3',
    shadowColor: '#112438',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { fontSize: 16 },
  label: { color: '#495D72', fontSize: 14, fontWeight: '600' },
  amount: { color: '#112438', fontSize: 16, fontWeight: '700' },
  amountDone: { color: '#227D4C' },
  goal: { color: '#617285', fontSize: 13, fontWeight: '400' },
  barBg: {
    height: 8,
    backgroundColor: '#D8E1EA',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: { height: 8, backgroundColor: '#F2B233', borderRadius: 4 },
  barFillDone: { backgroundColor: '#227D4C' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F7FAFE',
    borderWidth: 1,
    borderColor: '#8393A3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: '#495D72', fontSize: 22, fontWeight: '600', lineHeight: 26 },
  field: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 12,
    backgroundColor: '#F7FAFE',
    borderWidth: 1,
    borderColor: '#8393A3',
  },
  fieldInput: {
    minWidth: 56,
    textAlign: 'right',
    color: '#112438',
    fontSize: 19,
    fontWeight: '700',
    padding: 0,
  },
  fieldUnit: { color: '#617285', fontSize: 14, fontWeight: '600' },
  presetRow: { flexDirection: 'row', gap: 7, marginBottom: 10 },
  preset: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    backgroundColor: '#F7FAFE',
    borderWidth: 1,
    borderColor: '#8393A3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { backgroundColor: '#FFF8EC', borderColor: '#F2B233' },
  presetText: { color: '#495D72', fontSize: 14, fontWeight: '600' },
  presetTextActive: { color: '#F2B233', fontWeight: '700' },
  logBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F2B233',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: { color: '#112438', fontSize: 15, fontWeight: '700' },
});
