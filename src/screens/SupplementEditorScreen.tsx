import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
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
import { FOOD_KEYS, toFoodRelation } from '../engine/food';
import { BLANK_SUPPLEMENT, SupplementFormState } from '../components/SupplementFields';
import SupplementSheet from '../components/SupplementSheet';
import { clockPreview, formatOffsetLabel } from '../utils/duration';

type SupRow = {
  id: string;
  name: string;
  form: string;
  dose_amount: string;
  dose_unit: string;
  offset_minutes: number;
  with_food: number;
  food_relation: string;
  tolerance_window: number;
  rule_id: number | null;
  frequency: string;
  days_of_week: string;
  day_of_month: number;
  cycle_on_days: number;
  cycle_off_days: number;
  cycle_start_date: string;
};

/** Which supplement the sheet is standing over, if any. */
type Editing = { mode: 'add' } | { mode: 'edit'; row: SupRow };

function formFor(row: SupRow): SupplementFormState {
  return {
    name: row.name,
    form: row.form || 'capsule',
    dose_amount: row.dose_amount,
    dose_unit: row.dose_unit,
    offset_minutes: String(row.offset_minutes),
    food_relation: toFoodRelation(row.food_relation, row.with_food),
    tolerance_window: String(row.tolerance_window),
    frequency: row.frequency || 'daily',
    days_of_week: row.days_of_week || '',
    day_of_month: row.day_of_month ? String(row.day_of_month) : '',
    cycle_on_days: row.cycle_on_days ? String(row.cycle_on_days) : '',
    cycle_off_days: row.cycle_off_days ? String(row.cycle_off_days) : '',
    cycle_start_date: row.cycle_start_date || '',
  };
}

/**
 * The protocol, as a handful of bubbles.
 *
 * A supplement is a bubble carrying its name and, under it, the line that
 * answers what a patient actually checks the list for: how much, and when.
 * Everything else about it — form, flexibility, food, cadence — lives one tap
 * away in the sheet, because it is entered once and re-read almost never.
 *
 * Dose and unit were already on that line. The rest of the row's old contents
 * were the form itself, unfolded in place, which turned a twelve-supplement
 * protocol into a scroll nobody could hold in their head.
 */
export default function SupplementEditorScreen() {
  useLanguage(); // re-render this screen when the language changes
  const navigation = useNavigation<any>();
  const [supplements, setSupplements] = useState<SupRow[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState<SupplementFormState>(BLANK_SUPPLEMENT);
  const [saving, setSaving] = useState(false);
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

  const openAdd = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setForm(BLANK_SUPPLEMENT);
    setEditing({ mode: 'add' });
  };

  const openEdit = (row: SupRow) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm(formFor(row));
    setEditing({ mode: 'edit', row });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.name.trim()) { Alert.alert(t('supNameRequired'), t('supNameBody')); return; }
    setSaving(true);
    try {
      const fields = {
        name: form.name.trim(),
        form: form.form,
        dose_amount: form.dose_amount.trim(),
        dose_unit: form.dose_unit.trim(),
        offset_minutes: parseInt(form.offset_minutes, 10) || 0,
        food_relation: form.food_relation,
        tolerance_window: parseInt(form.tolerance_window, 10) || 30,
        frequency: form.frequency,
        days_of_week: form.days_of_week,
        day_of_month: parseInt(form.day_of_month, 10) || 0,
        cycle_on_days: parseInt(form.cycle_on_days, 10) || 0,
        cycle_off_days: parseInt(form.cycle_off_days, 10) || 0,
      };
      if (editing.mode === 'add') {
        await addSupplement({ ...fields, cycle_start_date: localDateStr(new Date()) });
      } else {
        await updateSupplementAndRule({
          ...fields,
          supplementId: editing.row.id,
          ruleId: editing.row.rule_id ?? -1,
          // A cycle counts from the day it was set up unless one is already stored.
          cycle_start_date: form.cycle_start_date || localDateStr(new Date()),
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reload();
      setEditing(null);
    } finally {
      setSaving(false);
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
            setEditing(null);
          },
        },
      ],
    );
  };

  const openWizard = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setEditing(null);
    navigation.navigate('SupplementWizard');
  };

  /**
   * The bubble's second line: dose, then when it is taken — "4 h after start",
   * not "T0 +240 min". The clock hint rides along when there is a usual start
   * time to measure it against. 'daily' is the overwhelming default, so it is
   * left off; printing it on every bubble would bury the two that are not.
   */
  const noteFor = (row: SupRow): string => {
    const dose = row.dose_amount && row.dose_unit
      ? `${row.dose_amount} ${row.dose_unit}`
      : row.dose_amount || '—';
    const at = clockPreview(row.offset_minutes, t0);
    const timing = formatOffsetLabel(row.offset_minutes)
      + (at ? ` · ${t('timingPreviewAt', { time: at })}` : '');
    const cadence = row.frequency && row.frequency !== 'daily'
      ? ` · ${describeCadence(row, t)}`
      : '';
    const relation = toFoodRelation(row.food_relation, row.with_food);
    const food = relation === 'none' ? '' : ` · ${t(FOOD_KEYS[relation])}`;
    return `${dose} · ${timing}${cadence}${food}`;
  };

  return (
    <SafeAreaView style={styles.container}>
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
            onPress={openAdd}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('supAddA11y')}
          >
            <Ionicons name="add" size={22} color="#F7F7F2" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {supplements.length === 0 && (
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

        <View style={styles.bubbles}>
          {supplements.map((row) => (
            <TouchableOpacity
              key={row.id}
              style={styles.bubble}
              onPress={() => openEdit(row)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('supEditA11y', { name: row.name })}
            >
              <Text style={styles.bubbleName} numberOfLines={1}>{row.name}</Text>
              <Text style={styles.bubbleNote} numberOfLines={2}>{noteFor(row)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <SupplementSheet
        visible={editing !== null}
        mode={editing?.mode ?? 'add'}
        title={editing?.mode === 'edit' ? editing.row.name : t('newSupplement')}
        form={form}
        t0={t0}
        saving={saving}
        onChange={setForm}
        onClose={() => setEditing(null)}
        onSave={handleSave}
        onDelete={editing?.mode === 'edit' ? () => handleDelete(editing.row) : undefined}
      />
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

  // A wrap, not a column: a short protocol then reads as a handful of bubbles
  // rather than a stack of near-empty full-width rows.
  bubbles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
  bubble: {
    maxWidth: '100%',
    backgroundColor: C.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  bubbleName: { fontSize: 15, fontWeight: '600', color: C.text },
  bubbleNote: { fontSize: 12, color: C.textSub, marginTop: 2 },

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
