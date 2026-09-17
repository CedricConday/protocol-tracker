import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Pressable, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C } from '../theme/colors';
import { t, locale } from '../i18n';
import { weekdaysShortSundayFirst } from '../i18n/dates';
import { FREQUENCIES, parseDaysOfWeek } from '../engine/cadence';

/**
 * The supplement form, in one place.
 *
 * Lifted out of SupplementEditorScreen on 2026-09-17 when the wizard needed the
 * same fields. Two copies of this would drift the moment one of them gained a
 * column, and the drift would be silent — both screens write the same row.
 *
 * Timing is the one field the two screens ask for differently: the editor asks
 * for a supplement's place in the day, the wizard asks how long after the last
 * one. So it is a slot, not a field — `renderTiming` goes where the old minutes
 * box was, and neither caller has to reason about the other's phrasing.
 */

export type SupplementFormState = {
  name: string;
  form: string;
  dose_amount: string;
  dose_unit: string;
  offset_minutes: string;
  with_food: boolean;
  tolerance_window: string;
  frequency: string;
  days_of_week: string;
  day_of_month: string;
  cycle_on_days: string;
  cycle_off_days: string;
  cycle_start_date: string;
};

export const BLANK_SUPPLEMENT: SupplementFormState = {
  name: '',
  form: 'capsule',
  dose_amount: '',
  dose_unit: '',
  offset_minutes: '0',
  with_food: false,
  tolerance_window: '30',
  frequency: 'daily',
  days_of_week: '',
  day_of_month: '',
  cycle_on_days: '',
  cycle_off_days: '',
  cycle_start_date: '',
};

export const FORMS = ['capsule', 'tablet', 'powder', 'liquid'] as const;

export const FREQ_KEYS: Record<string, string> = {
  'daily': 'freqDaily',
  'specific-days': 'freqSpecificDays',
  'day-of-month': 'freqMonthly',
  'cycle': 'freqCycle',
  'as-needed': 'freqAsNeeded',
};

/**
 * One-letter day dots and their full names, both from Intl — German starts the
 * week on Monday and abbreviates differently, and a hardcoded S-M-T-W-T-F-S was
 * wrong in both respects. `getDay()` order (Sunday first) is kept because the
 * dot index IS the stored day number.
 */
function weekdayInitials(): string[] {
  return weekdaysShortSundayFirst().map((d) => d.charAt(0).toUpperCase());
}

function weekdayNames(): string[] {
  const fmt = new Intl.DateTimeFormat(locale(), { weekday: 'long' });
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
}

type FieldProps = { form: SupplementFormState; onChange: (f: SupplementFormState) => void };

/**
 * Cadence picker. Only the sub-control the chosen frequency actually reads is
 * shown — a weekday row under "Monthly" would be dead UI the user still has to
 * reason about.
 */
export function CadenceFields({ form, onChange }: FieldProps) {
  const days = parseDaysOfWeek(form.days_of_week);
  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange({ ...form, days_of_week: next.sort((a, b) => a - b).join(',') });
  };

  return (
    <>
      <Text style={styles.label}>{t('howOften')}</Text>
      <View style={styles.chipRow}>
        {FREQUENCIES.map((f) => (
          <Pressable
            key={f}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange({ ...form, frequency: f }); }}
            style={[styles.chip, form.frequency === f && styles.chipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: form.frequency === f }}
            accessibilityLabel={t(FREQ_KEYS[f])}
          >
            <Text style={[styles.chipText, form.frequency === f && styles.chipTextActive]}>{t(FREQ_KEYS[f])}</Text>
          </Pressable>
        ))}
      </View>

      {form.frequency === 'specific-days' && (
        <View style={styles.dayRow}>
          {weekdayInitials().map((label, d) => (
            <Pressable
              key={d}
              onPress={() => toggleDay(d)}
              style={[styles.dayDot, days.includes(d) && styles.dayDotOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: days.includes(d) }}
              accessibilityLabel={weekdayNames()[d]}
            >
              <Text style={[styles.dayDotText, days.includes(d) && styles.dayDotTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {form.frequency === 'day-of-month' && (
        <View style={styles.row2}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>{t('dayOfMonth')}</Text>
            <TextInput
              style={styles.input}
              value={form.day_of_month}
              onChangeText={(v) => onChange({ ...form, day_of_month: v })}
              placeholder="1"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }} />
        </View>
      )}

      {form.frequency === 'cycle' && (
        <View style={styles.row2}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.label}>{t('daysOn')}</Text>
            <TextInput
              style={styles.input}
              value={form.cycle_on_days}
              onChangeText={(v) => onChange({ ...form, cycle_on_days: v })}
              placeholder="5"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>{t('daysOff')}</Text>
            <TextInput
              style={styles.input}
              value={form.cycle_off_days}
              onChangeText={(v) => onChange({ ...form, cycle_off_days: v })}
              placeholder="2"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
            />
          </View>
        </View>
      )}

      {form.frequency === 'as-needed' && (
        <Text style={styles.cadenceNote}>{t('asNeededNote')}</Text>
      )}
    </>
  );
}

export default function SupplementFields({
  form,
  onChange,
  renderTiming,
}: FieldProps & { renderTiming: () => React.ReactNode }) {
  return (
    <View style={styles.formBlock}>
      <Text style={[styles.label, { marginTop: 0 }]}>{t('supplementName')}</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(v) => onChange({ ...form, name: v })}
        placeholder={t('supPlaceholder')}
        placeholderTextColor={C.textMuted}
        autoCapitalize="words"
      />

      <Text style={styles.label}>{t('howYouTakeIt')}</Text>
      <View style={styles.chipRow}>
        {FORMS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, form.form === f && styles.chipActive]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange({ ...form, form: f }); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, form.form === f && styles.chipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.row2}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>{t('dose')}</Text>
          <TextInput
            style={styles.input}
            value={form.dose_amount}
            onChangeText={(v) => onChange({ ...form, dose_amount: v })}
            placeholder="400"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{t('unit')}</Text>
          <TextInput
            style={styles.input}
            value={form.dose_unit}
            onChangeText={(v) => onChange({ ...form, dose_unit: v })}
            placeholder={t('supUnitPlaceholder')}
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
          />
        </View>
      </View>

      {renderTiming()}

      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{t('flexibility')}</Text>
        <TextInput
          style={styles.input}
          value={form.tolerance_window}
          onChangeText={(v) => onChange({ ...form, tolerance_window: v })}
          placeholder="30"
          placeholderTextColor={C.textMuted}
          keyboardType="numeric"
        />
      </View>

      <View style={[styles.row2, { alignItems: 'center', marginTop: 14, marginBottom: 4 }]}>
        <Text style={[styles.label, { flex: 1, marginTop: 0, marginBottom: 0 }]}>{t('takeWithFood')}</Text>
        <Switch
          value={form.with_food}
          onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange({ ...form, with_food: v }); }}
          trackColor={{ false: C.border, true: C.primary }}
          thumbColor="#ffffff"
        />
      </View>

      <CadenceFields form={form} onChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  formBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: C.surface2,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
  },
  row2: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.primaryBg, borderColor: C.primary },
  chipText: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  chipTextActive: { color: C.primary, fontWeight: '600' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, gap: 6 },
  dayDot: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  dayDotOn: { backgroundColor: C.primary, borderColor: C.primary },
  dayDotText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  dayDotTextOn: { color: '#ffffff' },
  cadenceNote: { marginTop: 10, fontSize: 13, lineHeight: 19, color: C.textMuted },
});
