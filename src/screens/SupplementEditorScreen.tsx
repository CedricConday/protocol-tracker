import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { C } from '../theme/colors';
import {
  getSupplementsWithRules,
  getAverageStartTime,
  addSupplement,
  updateSupplementAndRule,
  deleteSupplement,
  localDateStr,
} from '../db/queries';
import { t, useLanguage } from '../i18n';
import { describeCadence } from '../engine/cadence';
import SupplementFields, { BLANK_SUPPLEMENT, SupplementFormState } from '../components/SupplementFields';
import DurationInput from '../components/DurationInput';
import { clockPreview, formatOffsetLabel } from '../utils/duration';

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

export default function SupplementEditorScreen() {
  useLanguage(); // re-render this screen when the language changes
  const navigation = useNavigation<any>();
  const [supplements, setSupplements] = useState<SupRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editForms, setEditForms] = useState<Record<string, SupplementFormState>>({});
  const [addForm, setAddForm] = useState<SupplementFormState>(BLANK_SUPPLEMENT);
  const [saving, setSaving] = useState<string | null>(null);
  // The patient's usual start time, for the "about 11:00" hint beside a gap.
  // Null until they have started a day or two, and the hint simply hides.
  const [t0, setT0] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [rows, avg] = await Promise.all([getSupplementsWithRules(), getAverageStartTime()]);
    setSupplements(rows);
    setT0(avg);
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', reload);
    reload();
    return unsubscribe;
  }, [navigation, reload]);

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

  /**
   * The timing slot. Here it is the supplement's own place in the day, measured
   * from the moment it starts — the wizard is the screen that asks in gaps.
   */
  const timingFor = (form: SupplementFormState, onChange: (f: SupplementFormState) => void) => () => (
    <DurationInput
      label={t('timingLabel')}
      value={parseInt(form.offset_minutes, 10) || 0}
      onChange={(minutes) => onChange({ ...form, offset_minutes: String(minutes) })}
      t0={t0}
      zeroLabel={t('durAtStart')}
    />
  );

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
      setAddForm(BLANK_SUPPLEMENT);
      setShowAddForm(false);
      await reload();
    } finally {
      setSaving(null);
    }
  };

  const openWizard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowAddForm(false);
    setExpandedId(null);
    navigation.navigate('SupplementWizard');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('supplements')}</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.severalBtn}
              onPress={openWizard}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('wizAddSeveralA11y')}
            >
              <Ionicons name="list-outline" size={16} color={C.primary} />
              <Text style={styles.severalBtnText}>{t('wizAddSeveral')}</Text>
            </TouchableOpacity>
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
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {showAddForm && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{t('newSupplement')}</Text>
              <SupplementFields
                form={addForm}
                onChange={setAddForm}
                renderTiming={timingFor(addForm, setAddForm)}
              />
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
              <TouchableOpacity
                style={styles.emptyWizardBtn}
                onPress={openWizard}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('wizAddSeveralA11y')}
              >
                <Text style={styles.emptyWizardBtnText}>{t('wizAddSeveral')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {supplements.map((row) => {
            const isOpen = expandedId === row.id;
            const f = editForms[row.id];
            const doseLabel = row.dose_amount && row.dose_unit
              ? `${row.dose_amount} ${row.dose_unit}`
              : row.dose_amount || '—';
            // "4 h after start", not "T0 +240 min". The clock hint rides along
            // when there is a usual start time to measure it against.
            const at = clockPreview(row.offset_minutes, t0);
            const timingLabel = formatOffsetLabel(row.offset_minutes)
              + (at ? ` · ${t('timingPreviewAt', { time: at })}` : '');
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
                      {doseLabel} · {timingLabel}{cadenceLabel}{row.with_food ? ` · ${t('withFoodShort')}` : ''}
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
                    <SupplementFields
                      form={f}
                      onChange={(next) => setEditForms((prev) => ({ ...prev, [row.id]: next }))}
                      renderTiming={timingFor(f, (next) => setEditForms((prev) => ({ ...prev, [row.id]: next })))}
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
                        <Text style={styles.saveBtnText}>{saving === row.id ? t('saving') : t('save')}</Text>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: C.text },
  severalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: C.primaryBg,
    borderWidth: 1,
    borderColor: C.primary,
  },
  severalBtnText: { fontSize: 13, color: C.primary, fontWeight: '600' },
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
  emptyWizardBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: C.primary,
  },
  emptyWizardBtnText: { color: '#F7F7F2', fontSize: 14, fontWeight: '600' },
});
