import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
} from '../db/queries';

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
};

type FormState = {
  name: string;
  form: string;
  dose_amount: string;
  dose_unit: string;
  offset_minutes: string;
  with_food: boolean;
  tolerance_window: string;
};

const BLANK: FormState = {
  name: '',
  form: 'capsule',
  dose_amount: '',
  dose_unit: '',
  offset_minutes: '0',
  with_food: false,
  tolerance_window: '30',
};

const FORMS = ['capsule', 'tablet', 'powder', 'liquid'] as const;

function FormFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (f: FormState) => void;
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={[styles.label, { marginTop: 0 }]}>Name</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(v) => onChange({ ...form, name: v })}
        placeholder="e.g. Magnesium Glycinate"
        placeholderTextColor={C.textMuted}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Form</Text>
      <View style={styles.chipRow}>
        {FORMS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.chip, form.form === f && styles.chipActive]}
            onPress={() => onChange({ ...form, form: f })}
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
          <Text style={styles.label}>Dose Amount</Text>
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
          <Text style={styles.label}>Unit</Text>
          <TextInput
            style={styles.input}
            value={form.dose_unit}
            onChangeText={(v) => onChange({ ...form, dose_unit: v })}
            placeholder="mg · IU · mcg"
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.row2}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>Offset (min after T0)</Text>
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
          <Text style={styles.label}>Window (±min)</Text>
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
        <Text style={[styles.label, { flex: 1, marginTop: 0, marginBottom: 0 }]}>Take with food</Text>
        <Switch
          value={form.with_food}
          onValueChange={(v) => onChange({ ...form, with_food: v })}
          trackColor={{ false: C.border, true: C.primary }}
          thumbColor="#ffffff"
        />
      </View>
    </View>
  );
}

export default function SupplementEditorScreen() {
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
      },
    }));
    setExpandedId(id);
    setShowAddForm(false);
  };

  const handleSave = async (row: SupRow) => {
    const f = editForms[row.id];
    if (!f?.name.trim()) { Alert.alert('Name required', 'Please enter a supplement name.'); return; }
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
      });
      await reload();
      setExpandedId(null);
    } finally {
      setSaving(null);
    }
  };

  const handleDelete = (row: SupRow) => {
    Alert.alert(
      'Delete Supplement',
      `Remove "${row.name}" and all its dose history? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
    if (!addForm.name.trim()) { Alert.alert('Name required', 'Please enter a supplement name.'); return; }
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
          <Text style={styles.title}>Supplements</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => { setShowAddForm((v) => !v); setExpandedId(null); }}
            activeOpacity={0.8}
          >
            <Ionicons name={showAddForm ? 'close' : 'add'} size={22} color="#FAF7F4" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {showAddForm && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>New Supplement</Text>
              <FormFields form={addForm} onChange={setAddForm} />
              <TouchableOpacity
                style={[styles.saveBtn, saving === '__add__' && styles.saveBtnDisabled]}
                onPress={handleAdd}
                disabled={saving === '__add__'}
                activeOpacity={0.8}
              >
                <Text style={styles.saveBtnText}>{saving === '__add__' ? 'Saving…' : 'Add Supplement'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {supplements.length === 0 && !showAddForm && (
            <View style={styles.emptyState}>
              <Ionicons name="flask-outline" size={40} color={C.textMuted} />
              <Text style={styles.emptyText}>No supplements yet.</Text>
              <Text style={styles.emptySub}>Tap + to add your first one.</Text>
            </View>
          )}

          {supplements.map((row) => {
            const isOpen = expandedId === row.id;
            const f = editForms[row.id];
            const doseLabel = row.dose_amount && row.dose_unit
              ? `${row.dose_amount} ${row.dose_unit}`
              : row.dose_amount || '—';
            const timingLabel = row.offset_minutes === 0 ? 'At T0' : `T0 +${row.offset_minutes} min`;

            return (
              <View key={row.id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardRow}
                  onPress={() => toggleExpand(row.id, row)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{row.name}</Text>
                    <Text style={styles.cardSub}>
                      {doseLabel} · {timingLabel}{row.with_food ? ' · with food' : ''}
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
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(row)} activeOpacity={0.7}>
                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                        <Text style={styles.deleteBtnText}>Delete</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.saveBtnInline, saving === row.id && styles.saveBtnDisabled]}
                        onPress={() => handleSave(row)}
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
    marginBottom: 10,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
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
    paddingVertical: 11,
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
  saveBtnText: { color: '#FAF7F4', fontSize: 14, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, color: C.text, fontWeight: '600' },
  emptySub: { fontSize: 13, color: C.textSub },
});
