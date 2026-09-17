import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, themed, useTheme } from '../theme/colors';
import { t, useLanguage } from '../i18n';
import SupplementFields, { SupplementFormState } from './SupplementFields';
import DurationInput from './DurationInput';
import { formatOffsetLabel } from '../utils/duration';

/**
 * The supplement form, on a screen of its own.
 *
 * It used to unfold inside the row it belonged to. One open supplement is a
 * name, a form picker, dose, unit, timing, flexibility, a food switch and a
 * cadence block — roughly two phone screens — so the list it was sitting in
 * stopped being a list: the supplements below it were pushed out of reach, and
 * scrolling through the form to get back to them cost more than the edit did.
 *
 * So the list keeps only what is worth reading at a glance and the form comes
 * up over it. Add and edit are the same sheet; only the title, the primary
 * button and whether Delete is offered differ.
 */

type Props = {
  visible: boolean;
  mode: 'add' | 'edit';
  /** The supplement being edited, or the "New supplement" heading when adding. */
  title: string;
  form: SupplementFormState;
  /** The patient's usual start time, for the "about 11:00" hint beside a gap. */
  t0: string | null;
  saving: boolean;
  onChange: (f: SupplementFormState) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
};

export default function SupplementSheet({
  visible,
  mode,
  title,
  form,
  t0,
  saving,
  onChange,
  onClose,
  onSave,
  onDelete,
}: Props) {
  useLanguage(); // re-render this sheet when the language changes
  useTheme(); // ...and when the theme tier changes

  /**
   * The timing slot. Here it is the supplement's own place in the day, measured
   * from the moment it starts — the wizard is the screen that asks in gaps.
   *
   * No label on the control: the When bubble above it is the label, and the
   * question does not need asking twice on one screen.
   */
  const offset = parseInt(form.offset_minutes, 10) || 0;
  const renderTiming = () => (
    <DurationInput
      value={offset}
      onChange={(minutes) => onChange({ ...form, offset_minutes: String(minutes) })}
      t0={t0}
      zeroLabel={t('durAtStart')}
    />
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('close')}
            >
              <Ionicons name="close" size={22} color={C.textSub} />
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            {/* Balances the close button so the title sits centred. */}
            <View style={styles.iconBtn} />
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <SupplementFields
              form={form}
              onChange={onChange}
              renderTiming={renderTiming}
              timingLabel={t('fieldWhen')}
              timingValue={formatOffsetLabel(offset)}
            />
            <View style={{ height: 24 }} />
          </ScrollView>

          <View style={styles.footer}>
            {mode === 'edit' && onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDelete}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('supDelete')}
              >
                <Ionicons name="trash-outline" size={16} color={C.danger} />
                <Text style={styles.deleteBtnText}>{t('delete')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={onSave}
              disabled={saving}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={mode === 'add' ? t('supAdd') : t('save')}
            >
              <Text style={styles.saveBtnText}>
                {saving ? t('saving') : mode === 'add' ? t('supAdd') : t('save')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = themed((C) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
  scroll: { flex: 1 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6 },
  deleteBtnText: { fontSize: 13, color: C.danger, fontWeight: '500' },
  saveBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnText: { color: C.bg, fontSize: 14, fontWeight: '600' },
}));
