import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { LayoutAnimation, StyleSheet, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, themed, useTheme } from '../theme/colors';
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
 * Laid out as four rows on 2026-09-18: name, then Form, Dose, When and Food,
 * one under the other in a single card, each showing what it currently says and
 * opening its controls in place. It replaces six pill-shaped bubbles that
 * wrapped across two ragged rows — the eye had no column to follow, the widths
 * moved as the values changed, and "how often" and "flexibility" sat beside the
 * four real questions as though they were peers of them.
 *
 * They are not. Both are part of *when* a supplement is taken, so they live
 * inside the When section under their own captions: the gap first, then how
 * often, then how much slack. Four questions on the card, three answers behind
 * the one that has more than one.
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

/**
 * No `useTheme()` in here, ever.
 *
 * It had one, and this is a plain function, not a component: its hook belonged
 * to whatever was rendering at the time. Called once per render for the Form
 * row's value, that was survivable. Opening the Form section called it four
 * more times — once per option — so the render had five hooks where the last
 * had one, React threw "rendered more hooks than during the previous render",
 * and the error boundary told the patient to restart the app. Tapping Form on a
 * new supplement crashed the sheet every time. The component below calls
 * `useTheme()` once, which is what keeps the palette live for all of this.
 */
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

/** The four questions on the card. Cadence and flexibility live inside 'when'. */
type FieldKey = 'form' | 'dose' | 'when' | 'food';

/** Slack presets, in the round numbers a tolerance is ever actually set to. */
const TOLERANCE_PRESETS = [15, 30, 60] as const;

/**
 * One row of the card: what is being asked, what it says now, and a chevron.
 *
 * The value sits on the right edge of every row, so the answers line up in a
 * column the eye can run down — the thing the wrapped bubbles could not do,
 * because each one was as wide as its own contents. The controls open directly
 * under the row they belong to rather than in a panel below the whole set: with
 * six bubbles it was never obvious which one the panel was for.
 */
function Section({
  label,
  value,
  hint,
  open,
  onPress,
  last,
  children,
}: {
  label: string;
  value: string;
  /** A second line under the label, for a section that answers more than one thing. */
  hint?: string;
  open: boolean;
  onPress: () => void;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, !last && styles.sectionDivided]}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}
      >
        <View style={styles.rowLabelCol}>
          <Text style={[styles.rowLabel, open && styles.rowLabelOpen]}>{label}</Text>
          {hint ? <Text style={styles.rowHint} numberOfLines={1}>{hint}</Text> : null}
        </View>
        <Text style={[styles.rowValue, open && styles.rowValueOpen]} numberOfLines={1}>{value}</Text>
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={open ? C.primary : C.textFaint}
          style={styles.rowChevron}
        />
      </TouchableOpacity>

      {open ? <View style={styles.panel}>{children}</View> : null}
    </View>
  );
}

/**
 * How late a dose may be and still count.
 *
 * Presets and a custom box, the same shape as the gap control above it, because
 * they are the same kind of answer — a number of minutes that is almost always
 * round. It was a bare numeric input labelled "Flexibility (±min)", which asks
 * the patient to know what the ± is measured from.
 */
function ToleranceField({ form, onChange }: FieldProps) {
  const current = parseInt(form.tolerance_window, 10);
  const [custom, setCustom] = useState(
    () => !TOLERANCE_PRESETS.includes(current as (typeof TOLERANCE_PRESETS)[number]),
  );

  const pick = (minutes: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCustom(false);
    onChange({ ...form, tolerance_window: String(minutes) });
  };

  return (
    <>
      <View style={styles.chipRow}>
        {TOLERANCE_PRESETS.map((p) => {
          const active = !custom && current === p;
          return (
            <Pressable
              key={p}
              onPress={() => pick(p)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('toleranceChip', { min: p })}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t('toleranceChip', { min: p })}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCustom(true); }}
          style={[styles.chip, custom && styles.chipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: custom }}
          accessibilityLabel={t('timingPresetCustom')}
        >
          <Text style={[styles.chipText, custom && styles.chipTextActive]}>{t('timingPresetCustom')}</Text>
        </Pressable>
      </View>

      {custom && (
        <View style={styles.customRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={form.tolerance_window}
            onChangeText={(v) => onChange({ ...form, tolerance_window: v.replace(/[^0-9]/g, '') })}
            placeholder="30"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            accessibilityLabel={t('timingCustomMinutes')}
          />
          <Text style={styles.unit}>{t('timingCustomMinutes')}</Text>
        </View>
      )}

      <Text style={styles.note}>{t('fieldFlexNote')}</Text>
    </>
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
  /** What the When row is called — the editor's "When", the wizard's question. */
  timingLabel: string;
  /** What it currently says: "2 h after start", "+30 min", "at start". */
  timingValue: string;
}) {
  useTheme(); // the one call that keeps every palette read in this file live
  const [open, setOpen] = useState<FieldKey | null>(null);
  const toggle = (key: FieldKey) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => (prev === key ? null : key));
  };

  const doseValue = form.dose_amount.trim()
    ? `${form.dose_amount.trim()}${form.dose_unit.trim() ? ` ${form.dose_unit.trim()}` : ''}`
    : '—';

  // The two answers that moved inside When, said on the row so nobody has to
  // open it to find out what they are.
  const whenHint = `${t(FREQ_KEYS[form.frequency] ?? 'freqDaily')} · ${t('toleranceChip', {
    min: (form.tolerance_window || '0').trim(),
  })}`;

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

      <View style={styles.card}>
        <Section
          label={t('fieldForm')}
          value={formLabel(form.form)}
          open={open === 'form'}
          onPress={() => toggle('form')}
        >
          <Text style={styles.caption}>{t('howYouTakeIt')}</Text>
          <View style={styles.chipRow}>
            {FORMS.map((f) => (
              <Pressable
                key={f}
                style={[styles.chip, form.form === f && styles.chipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange({ ...form, form: f });
                  // One choice, and it is made — the row now says it.
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpen(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: form.form === f }}
              >
                <Text style={[styles.chipText, form.form === f && styles.chipTextActive]}>{formLabel(f)}</Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section
          label={t('dose')}
          value={doseValue}
          open={open === 'dose'}
          onPress={() => toggle('dose')}
        >
          <View style={styles.row2}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.caption}>{t('dose')}</Text>
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
              <Text style={styles.caption}>{t('unit')}</Text>
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
        </Section>

        {/* Everything about placing the supplement in the day, in the order it
            is decided: how far into the day, on which days, how much slack. */}
        <Section
          label={timingLabel}
          value={timingValue}
          hint={whenHint}
          open={open === 'when'}
          onPress={() => toggle('when')}
        >
          <Text style={styles.caption}>{t('timingLabel')}</Text>
          {renderTiming()}

          <View style={styles.subDivider} />
          <Text style={styles.caption}>{t('howOften')}</Text>
          <CadenceFields form={form} onChange={onChange} />

          <View style={styles.subDivider} />
          <Text style={styles.caption}>{t('fieldFlex')}</Text>
          <ToleranceField form={form} onChange={onChange} />
        </Section>

        <Section
          label={t('fieldFood')}
          value={t(FOOD_KEYS[form.food_relation])}
          open={open === 'food'}
          onPress={() => toggle('food')}
          last
        >
          <Text style={styles.caption}>{t('fieldFoodQuestion')}</Text>
          <View style={styles.chipRow}>
            {FOOD_RELATIONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.chip, form.food_relation === r && styles.chipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onChange({ ...form, food_relation: r });
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setOpen(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: form.food_relation === r }}
              >
                <Text style={[styles.chipText, form.food_relation === r && styles.chipTextActive]}>
                  {t(FOOD_KEYS[r])}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* A meal is not the moment the day starts, and the schedule only
              knows that moment. Said once, here, rather than left for the
              patient to discover from a reminder at the wrong hour. */}
          {form.food_relation !== 'none' && (
            <Text style={styles.note}>{t('fieldFoodNote')}</Text>
          )}
        </Section>
      </View>
    </View>
  );
}

const styles = themed((C) => StyleSheet.create({
  formBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  label: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: C.sunken,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
  },
  row2: { flexDirection: 'row' },

  // One card, four rows, hairlines between them: the form reads as a list of
  // what has been answered, not as a scatter of pills.
  card: {
    marginTop: 16,
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.borderSoft,
    overflow: 'hidden',
  },
  section: {},
  sectionDivided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.borderSoft },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 56,
    paddingVertical: 10,
  },
  // Shrinks before the value does on a narrow phone; the hint is one line.
  rowLabelCol: { flexShrink: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: C.text },
  rowLabelOpen: { color: C.primary },
  rowHint: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  rowValue: { flex: 1, flexShrink: 1, textAlign: 'right', fontSize: 15, color: C.textSub },
  rowValueOpen: { color: C.primary, fontWeight: '600' },
  rowChevron: { marginLeft: 8 },

  // The open controls, inset and on the sunken tone so the row above still
  // reads as the heading of what is under it.
  panel: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 16,
    backgroundColor: C.surfaceAlt,
  },
  caption: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginTop: 12,
    marginBottom: 8,
  },
  subDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    opacity: 0.35,
    marginTop: 16,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  unit: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  note: { marginTop: 10, fontSize: 13, lineHeight: 19, color: C.textMuted },

  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: C.sunken,
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
    backgroundColor: C.sunken,
    borderWidth: 1,
    borderColor: C.border,
  },
  dayDotOn: { backgroundColor: C.primary, borderColor: C.primary },
  dayDotText: { fontSize: 13, fontWeight: '600', color: C.textSub },
  dayDotTextOn: { color: C.onPrimary },
  cadenceNote: { marginTop: 10, fontSize: 13, lineHeight: 19, color: C.textMuted },
}));
