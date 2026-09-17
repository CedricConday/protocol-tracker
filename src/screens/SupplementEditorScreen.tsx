import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Pressable,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme/colors';
import {
  getSupplementsWithRules,
  addSupplement,
  updateSupplementAndRule,
  deleteSupplement,
  localDateStr,
} from '../db/queries';
import { t, useLanguage, locale } from '../i18n';
import { weekdaysShortSundayFirst } from '../i18n/dates';
import { FREQUENCIES, parseDaysOfWeek, describeCadence } from '../engine/cadence';

type SupRow = {
  id: string;
  name: string;
  form: string;
  dose_amount: string;
  dose_unit: string;
  offset_minutes: number;
  with_food: number;
  tolerance_window: number;
  rule_id: number | null;
  frequency: string;
  days_of_week: string;
  day_of_month: number;
  cycle_on_days: number;
  cycle_off_days: number;
  cycle_start_date: string;
};

type FormState = {
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

const BLANK: FormState = {
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

const FORMS = ['capsule', 'tablet', 'powder', 'liquid'] as const;

const FREQ_KEYS: Record<string, string> = {
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

/**
 * Cadence picker. Only the sub-control the chosen frequency actually reads is
 * shown — a weekday row under "Monthly" would be dead UI the user still has to
 * reason about.
 */
function CadenceFields({ form, onChange }: { form: FormState; onChange: (f: FormState) => void }) {
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

function FormFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
}) {
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

      <View style={styles.row2}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>{t('minutesAfterFirst')}</Text>
          <TextInput
            style={styles.input}
            value={form.offset_minutes}
            onChangeText={(v) => onChange({ ...form, offset_minutes: v })}
            placeholder="0"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
          />
        </View>
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

export default function SupplementEditorScreen() {
  useLanguage(); // re-render this screen when the language changes
  const [supplements, setSupplements] = useState<SupRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForms, setEditForms] = useState<Record<string, FormState>>({});
  const [addForm, setAddForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await getSupplementsWithRules();
    setSupplements(rows);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const toggleExpand = (id: string, row: SupRow) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setEditForms((prev) => ({
      ...prev,
      [id]: {
        name: row.name,
        form: row.form || 'capsule',
        dose_amount: row.dose_amount,
        dose_unit: row.dose_unit,
        offset_minutes: String(row.offset_minutes),
        with_food: row.with_food === 1,
        tolerance_window: String(row.tolerance_window),
        frequency: row.frequency || 'daily',
        days_of_week: row.days_of_week || '',
        day_of_month: row.day_of_month ? String(row.day_of_month) : '',
        cycle_on_days: row.cycle_on_days ? String(row.cycle_on_days) : '',
        cycle_off_days: row.cycle_off_days ? String(row.cycle_off_days) : '',
        cycle_start_date: row.cycle_start_date || '',
      },
    }));
    setExpandedId(id);
    setShowAddForm(false);
  };

  const handleSave = async (row: SupRow) => {
    const f = editForms[row.id];
    if (!f?.name.trim()) { Alert.alert(t('supNameRequired'), t('supNameBody')); return; }
    setSaving(row.id);
    try {
      await updateSupplementAndRule({
        supplementId: row.id,
        ruleId: row.rule_id ?? -1,
        name: f.name.trim(),
        form: f.form,
        dose_amount: f.dose_amount.trim(),
        dose_unit: f.dose_unit.trim(),
        offset_minutes: parseInt(f.offset_minutes, 10) || 0,
        with_food: f.with_food,
        tolerance_window: parseInt(f.tolerance_window, 10) || 30,
        frequency: f.frequency,
        days_of_week: f.days_of_week,
        day_of_month: parseInt(f.day_of_month, 10) || 0,
        cycle_on_days: parseInt(f.cycle_on_days, 10) || 0,
        cycle_off_days: parseInt(f.cycle_off_days, 10) || 0,
        // A cycle counts from the day it was set up unless one is already stored.
        cycle_start_date: f.cycle_start_date || localDateStr(new Date()),
      });
      await reload();
      setExpandedId(null);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = (row: SupRow) => {
    Alert.alert(
      t('supDelete'),
      t('supDeleteConfirm', { name: row.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            await deleteSupplement(row.id);
            await reload();
            if (expandedId === row.id) setExpandedId(null);
          },
        },
      ],
    );
  };

  const handleAdd = async () => {
    if (!addForm.name.trim()) { Alert.alert(t('supNameRequired'), t('supNameBody')); return; }
    setSaving('__add__');
    try {
      await addSupplement({
        name: addForm.name.trim(),
        form: addForm.form,
        dose_amount: addForm.dose_amount.trim(),
        dose_unit: addForm.dose_unit.trim(),
        offset_minutes: parseInt(addForm.offset_minutes, 10) || 0,
        with_food: addForm.with_food,
        tolerance_window: parseInt(addForm.tolerance_window, 10) || 30,
        frequency: addForm.frequency,
        days_of_week: addForm.days_of_week,
        day_of_month: parseInt(addForm.day_of_month, 10) || 0,
        cycle_on_days: parseInt(addForm.cycle_on_days, 10) || 0,
        cycle_off_days: parseInt(addForm.cycle_off_days, 10) || 0,
        cycle_start_date: localDateStr(new Date()),
      });
      setAddForm(BLANK);
      setShowAddForm(false);
      await reload();
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('supplements')}</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowAddForm((v) => !v); setExpandedId(null); }}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={showAddForm ? t('supCloseAddA11y') : t('supAddA11y')}
          >
            <Ionicons name={showAddForm ? 'close' : 'add'} size={22} color="#F7F7F2" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {showAddForm && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('newSupplement')}</Text>
              <FormFields form={addForm} onChange={setAddForm} />
              <TouchableOpacity
                style={[styles.saveBtn, saving === '__add__' && styles.saveBtnDisabled]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleAdd().then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); }}
                disabled={saving === '__add__'}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('supAdd')}
              >
                <Text style={styles.saveBtnText}>{saving === '__add__' ? t('saving') : t('supAdd')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {supplements.length === 0 && !showAddForm && (
            <View style={styles.emptyState}>
              <Ionicons name="flask-outline" size={40} color={C.textMuted} />
              <Text style={styles.emptyText}>{t('protocolStartsHere')}</Text>
              <Text style={styles.emptySub}>{t('tapPlusToAdd')}</Text>
            </View>
          )}

          {supplements.map((row) => {
            const isOpen = expandedId === row.id;
            const f = editForms[row.id];
            const doseLabel = row.dose_amount && row.dose_unit
              ? `${row.dose_amount} ${row.dose_unit}`
              : row.dose_amount || '—';
            const timingLabel = row.offset_minutes === 0 ? 'At T0' : `T0 +${row.offset_minutes} min`;
            // 'daily' is the overwhelming default — printing it on every row
            // would bury the two that are not.
            const cadenceLabel = row.frequency && row.frequency !== 'daily'
              ? ` · ${describeCadence(row, t)}`
              : '';

            return (
              <View key={row.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardRow}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleExpand(row.id, row); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{row.name}</Text>
                    <Text style={styles.cardSub}>
                      {doseLabel} · {timingLabel}{cadenceLabel}{row.with_food ? ' · with food' : ''}
                    </Text>
                  </View>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={C.textMuted}
                  />
                </TouchableOpacity>

                {isOpen && f && (
                  <>
                    <View style={styles.divider} />
                    <FormFields
                      form={f}
                      onChange={(next) => setEditForms((prev) => ({ ...prev, [row.id]: next }))}
                    />
                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleDelete(row); }} activeOpacity={0.7}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                        <Text style={styles.deleteBtnText}>{t('delete')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveBtnInline, saving === row.id && styles.saveBtnDisabled]}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleSave(row).then(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)); }}
                        disabled={saving === row.id}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.saveBtnText}>{saving === row.id ? 'Saving…' : 'Save'}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  addBtn: {
    backgroundColor: C.primary,
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    marginBottom: 14,
    overflow: 'hidden',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  cardName: { fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 2 },
  cardSub: { fontSize: 12, color: C.textSub },
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
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
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 10,
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  deleteBtnText: { fontSize: 13, color: C.danger, fontWeight: '500' },
  saveBtn: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 14,
    marginTop: 8,
  },
  saveBtnInline: {
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: '#F7F7F2', fontSize: 14, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, color: C.text, fontWeight: '600' },
  emptySub: { fontSize: 13, color: C.textSub },
});
