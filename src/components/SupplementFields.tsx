import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { StyleSheet, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C } from '../theme/colors';
import { t, locale } from '../i18n';
import { weekdaysShortSundayFirst } from '../i18n/dates';
import { FREQUENCIES, parseDaysOfWeek } from '../engine/cadence';
import { FOOD_KEYS, FOOD_RELATIONS, FoodRelation } from '../engine/food';

/**
 * The supplement form, in one place.
 *
 * Lifted out of SupplementEditorScreen on 2026-09-17 when the wizard needed the
 * same fields. Two copies of this would drift the moment one of them gained a
 * column, and the drift would be silent — both screens write the same row.
 *
 * Laid out as bubbles on 2026-09-17: a name box, then one bubble per field
 * showing what that field currently says, and the controls for exactly one of
 * them underneath. Every field open at once was eight stacked controls and two
 * phone screens of scrolling to enter what is, for most supplements, a name and
 * a dose. A bubble carries its own answer, so the form reads as a summary until
 * you tap the part you came to change.
 *
 * Timing is the one field the two screens ask for differently: the editor asks
 * for a supplement's place in the day, the wizard asks how long after the last
 * one. So it is a slot, not a field — `renderTiming` supplies the control and
 * `timingLabel`/`timingValue` what its bubble says, and neither caller has to
 * reason about the other's phrasing.
 */

export type SupplementFormState = {
  name: string;
  form: string;
  dose_amount: string;
  dose_unit: string;
  offset_minutes: string;
  food_relation: FoodRelation;
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
  food_relation: 'none',
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

const FORM_KEYS: Record<string, string> = {
  capsule: 'formCapsule',
  tablet: 'formTablet',
  powder: 'formPowder',
  liquid: 'formLiquid',
};

function formLabel(form: string): string {
  return FORM_KEYS[form] ? t(FORM_KEYS[form]) : form;
}

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

/** The fields that open one at a time, in the order they are asked for. */
type FieldKey = 'form' | 'dose' | 'when' | 'food' | 'cadence' | 'tolerance';

/**
 * One bubble: what the field is called, and what it currently says.
 *
 * Both lines are always there. A bubble that shows only its value stops
 * explaining itself the moment the value is a bare number, and a bubble that
 * shows only its name makes you open all six to read back what you entered.
 */
function FieldBubble({
  label,
  value,
  open,
  onPress,
}: { label: string; value: string; open: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.bubble, open && styles.bubbleOpen]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={[styles.bubbleLabel, open && styles.bubbleLabelOpen]}>{label}</Text>
      <Text style={[styles.bubbleValue, open && styles.bubbleValueOpen]} numberOfLines={1}>{value}</Text>
    </TouchableOpacity>
  );
}

export default function SupplementFields({
  form,
  onChange,
  renderTiming,
  timingLabel,
  timingValue,
}: FieldProps & {
  renderTiming: () => React.ReactNode;
  /** What the When bubble is called — the editor's "When", the wizard's question. */
  timingLabel: string;
  /** What it currently says: "2 h after start", "+30 min", "at start". */
  timingValue: string;
}) {
  const [open, setOpen] = useState<FieldKey | null>(null);
  const toggle = (key: FieldKey) => setOpen((prev) => (prev === key ? null : key));

  const doseValue = form.dose_amount.trim()
    ? `${form.dose_amount.trim()}${form.dose_unit.trim() ? ` ${form.dose_unit.trim()}` : ''}`
    : '—';
  const toleranceValue = `±${(form.tolerance_window || '0').trim()} min`;

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

      <View style={styles.bubbleRow}>
        <FieldBubble label={t('fieldForm')} value={formLabel(form.form)} open={open === 'form'} onPress={() => toggle('form')} />
        <FieldBubble label={t('dose')} value={doseValue} open={open === 'dose'} onPress={() => toggle('dose')} />
        <FieldBubble label={timingLabel} value={timingValue} open={open === 'when'} onPress={() => toggle('when')} />
        <FieldBubble label={t('fieldFood')} value={t(FOOD_KEYS[form.food_relation])} open={open === 'food'} onPress={() => toggle('food')} />
        <FieldBubble label={t('howOften')} value={t(FREQ_KEYS[form.frequency] ?? 'freqDaily')} open={open === 'cadence'} onPress={() => toggle('cadence')} />
        <FieldBubble label={t('fieldFlex')} value={toleranceValue} open={open === 'tolerance'} onPress={() => toggle('tolerance')} />
      </View>

      {open !== null && (
        <View style={styles.panel}>
          {open === 'form' && (
            <>
              <Text style={[styles.label, { marginTop: 0 }]}>{t('howYouTakeIt')}</Text>
              <View style={styles.chipRow}>
                {FORMS.map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.chip, form.form === f && styles.chipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onChange({ ...form, form: f });
                      // One choice, and it is made — the bubble now says it.
                      setOpen(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, form.form === f && styles.chipTextActive]}>{formLabel(f)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {open === 'dose' && (
            <View style={styles.row2}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.label, { marginTop: 0 }]}>{t('dose')}</Text>
                <TextInput
                  style={styles.input}
                  value={form.dose_amount}
                  onChangeText={(v) => onChange({ ...form, dose_amount: v })}
                  placeholder="400"
                  placeholderTextColor={C.textMuted}
                  keyboardType="numeric"
                  autoFocus
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { marginTop: 0 }]}>{t('unit')}</Text>
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
          )}

          {open === 'when' && renderTiming()}

          {open === 'food' && (
            <>
              <Text style={[styles.label, { marginTop: 0 }]}>{t('fieldFoodQuestion')}</Text>
              <View style={styles.chipRow}>
                {FOOD_RELATIONS.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.chip, form.food_relation === r && styles.chipActive]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      onChange({ ...form, food_relation: r });
                      setOpen(null);
                    }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: form.food_relation === r }}
                  >
                    <Text style={[styles.chipText, form.food_relation === r && styles.chipTextActive]}>
                      {t(FOOD_KEYS[r])}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* A meal is not the moment the day starts, and the schedule only
                  knows that moment. Said once, here, rather than left for the
                  patient to discover from a reminder at the wrong hour. */}
              {form.food_relation !== 'none' && (
                <Text style={styles.cadenceNote}>{t('fieldFoodNote')}</Text>
              )}
            </>
          )}

          {open === 'cadence' && (
            <>
              <Text style={[styles.label, { marginTop: 0 }]}>{t('howOften')}</Text>
              <CadenceFields form={form} onChange={onChange} />
            </>
          )}

          {open === 'tolerance' && (
            <>
              <Text style={[styles.label, { marginTop: 0 }]}>{t('flexibility')}</Text>
              <TextInput
                style={styles.input}
                value={form.tolerance_window}
                onChangeText={(v) => onChange({ ...form, tolerance_window: v })}
                placeholder="30"
                placeholderTextColor={C.textMuted}
                keyboardType="numeric"
                autoFocus
              />
            </>
          )}
        </View>
      )}
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

  bubbleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  bubbleOpen: { backgroundColor: C.primaryBg, borderColor: C.primary },
  bubbleLabel: { fontSize: 10, fontWeight: '600', color: C.textMuted, letterSpacing: 0.3 },
  bubbleLabelOpen: { color: C.primary },
  bubbleValue: { fontSize: 14, fontWeight: '600', color: C.text, marginTop: 1 },
  bubbleValueOpen: { color: C.primary },

  panel: { marginTop: 14 },

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
