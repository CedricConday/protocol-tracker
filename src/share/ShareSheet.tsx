import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { t, useLanguage } from '../i18n';
import { C, space, radius, text as T, themed, useTheme } from '../theme';
import { collectShareData, countSections, resolveRange } from './data';
import { shareFromConfig } from './send';
import {
  DEFAULT_SECTIONS, LEGACY_SECTIONS, SECTION_LABEL, SECTION_ORDER,
  type RangePreset, type SectionCounts, type SectionKey, type ShareFormat,
} from './types';

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: '7d', label: 'shRange7d' },
  { key: '30d', label: 'shRange30d' },
  { key: '3m', label: 'shRange3m' },
  { key: 'all', label: 'shRangeAll' },
  { key: 'custom', label: 'shRangeCustom' },
];

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface ShareSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Where the dials start. The press decides this and nothing else. */
  initialPreset?: RangePreset;
  initialRange?: { from: string; to: string };
  initialFormat?: ShareFormat;
}

/**
 * Ask before sending.
 *
 * Every share button in the app opens this, so what leaves the device is chosen
 * once, in one place, by the person whose data it is. Before this the four
 * buttons each shipped a fixed window and a fixed set of fields, and none of
 * them said what they were about to include.
 */
export default function ShareSheet({
  visible, onClose, initialPreset = '30d', initialRange, initialFormat = 'pdf',
}: ShareSheetProps) {
  useLanguage();
  useTheme(); // ...and when the theme tier changes
  const [preset, setPreset] = useState<RangePreset>(initialPreset);
  const [custom, setCustom] = useState({ from: initialRange?.from ?? '', to: initialRange?.to ?? '' });
  const [range, setRange] = useState<{ from: string; to: string } | null>(initialRange ?? null);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({ ...DEFAULT_SECTIONS });
  const [format, setFormat] = useState<ShareFormat>(initialFormat);
  const [counts, setCounts] = useState<SectionCounts | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  // Reopening must not inherit the last press's dials: a sheet opened from the
  // Home banner should say "this week" even if it was last used for everything.
  useEffect(() => {
    if (!visible) return;
    setPreset(initialPreset);
    setFormat(initialFormat);
    setSections({ ...DEFAULT_SECTIONS });
    setCustom({ from: initialRange?.from ?? '', to: initialRange?.to ?? '' });
  }, [visible, initialPreset, initialFormat, initialRange?.from, initialRange?.to]);

  const customReady = DAY_KEY.test(custom.from) && DAY_KEY.test(custom.to) && custom.from <= custom.to;

  // The counts are the point of the dialog: what a section would contribute for
  // THIS range, before it is ticked. A blank heading discovered in a document
  // already sent to a doctor is the thing this exists to prevent.
  useEffect(() => {
    if (!visible) return;
    if (preset === 'custom' && !customReady) { setCounts(null); return; }
    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const r = preset === 'custom'
          ? { from: custom.from, to: custom.to }
          : await resolveRange(preset);
        const bundle = await collectShareData(r.from, r.to);
        if (cancelled) return;
        setRange(r);
        setCounts(countSections(bundle));
      } catch {
        if (!cancelled) setCounts(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, preset, custom.from, custom.to, customReady]);

  const toggle = useCallback((key: SectionKey) => {
    setSections((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      // Notes cannot outlive the section that carries them: untick Journal and
      // the text goes with it, rather than lying in wait for the next open.
      if (key === 'journal' && !next.journal) next.journalNotes = false;
      return next;
    });
  }, []);

  const send = async () => {
    if (!range) return;
    setSending(true);
    try {
      await shareFromConfig({ preset, from: range.from, to: range.to, sections, format });
      onClose();
    } catch (e: any) {
      Alert.alert(t('shFailed'), e?.message ?? t('pleaseTryAgain'));
    } finally {
      setSending(false);
    }
  };

  const visibleSections = SECTION_ORDER.filter((k) => {
    if (k === 'journalNotes') return sections.journal;
    // Nothing writes these any more — offer them only where rows survive.
    if (LEGACY_SECTIONS.includes(k)) return (counts?.[k] ?? 0) > 0;
    return true;
  });

  const nothingChosen = !visibleSections.some((k) => sections[k] && k !== 'journalNotes');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('close')} accessibilityRole="button" />
        <View style={styles.card}>
          <Text style={styles.title}>{t('shTitle')}</Text>
          <Text style={styles.subtitle}>{t('shSubtitle')}</Text>

          <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: space.md }}>
            <Text style={styles.groupLabel}>{t('shHowMuch')}</Text>
            <View style={styles.presetRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.preset, preset === p.key && styles.presetOn]}
                  onPress={() => setPreset(p.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: preset === p.key }}
                  accessibilityLabel={t(p.label)}
                >
                  <Text style={[styles.presetText, preset === p.key && styles.presetTextOn]}>{t(p.label)}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {preset === 'custom' ? (
              <View style={styles.customRow}>
                <TextInput
                  style={styles.dateInput} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted}
                  value={custom.from} onChangeText={(v) => setCustom((c) => ({ ...c, from: v }))}
                  autoCapitalize="none" accessibilityLabel={t('shFrom')}
                />
                <Text style={styles.toJoiner}>{t('toJoiner')}</Text>
                <TextInput
                  style={styles.dateInput} placeholder="YYYY-MM-DD" placeholderTextColor={C.textMuted}
                  value={custom.to} onChangeText={(v) => setCustom((c) => ({ ...c, to: v }))}
                  autoCapitalize="none" accessibilityLabel={t('shTo')}
                />
              </View>
            ) : null}
            {preset === 'custom' && !customReady ? (
              <Text style={styles.hint}>{t('shCustomHint')}</Text>
            ) : null}

            <Text style={styles.groupLabel}>{t('shWhat')}</Text>
            {visibleSections.map((key) => {
              const count = counts?.[key] ?? 0;
              const isNotes = key === 'journalNotes';
              return (
                <View key={key} style={[styles.row, isNotes && styles.rowIndented]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{t(SECTION_LABEL[key])}</Text>
                    <Text style={styles.rowCount}>
                      {busy ? t('shCounting') : count > 0 ? t('shRowCount', { count }) : t('shNothingHere')}
                    </Text>
                  </View>
                  <Switch
                    value={sections[key]}
                    onValueChange={() => toggle(key)}
                    disabled={count === 0}
                    accessibilityLabel={t(SECTION_LABEL[key])}
                  />
                </View>
              );
            })}
            {sections.journal && !sections.journalNotes ? (
              <Text style={styles.hint}>{t('shNotesOptIn')}</Text>
            ) : null}

            <Text style={styles.groupLabel}>{t('shFormat')}</Text>
            <View style={styles.presetRow}>
              {(['pdf', 'json'] as ShareFormat[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.preset, format === f && styles.presetOn]}
                  onPress={() => setFormat(f)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: format === f }}
                  accessibilityLabel={t(f === 'pdf' ? 'shFormatPdf' : 'shFormatJson')}
                >
                  <Text style={[styles.presetText, format === f && styles.presetTextOn]}>
                    {t(f === 'pdf' ? 'shFormatPdf' : 'shFormatJson')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>{t(format === 'pdf' ? 'shFormatPdfHint' : 'shFormatJsonHint')}</Text>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('commonCancel')}>
              <Text style={styles.btnGhostText}>{t('commonCancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (nothingChosen || !range || sending) && styles.btnDisabled]}
              onPress={send}
              disabled={nothingChosen || !range || sending}
              accessibilityRole="button"
              accessibilityLabel={t('shSend')}
            >
              {sending ? <ActivityIndicator color={C.onPrimary} /> : <Text style={styles.btnPrimaryText}>{t('shSend')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed((C) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(20,33,61,0.45)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: space.lg, maxHeight: '88%',
  },
  title: { ...T.h2, color: C.text },
  subtitle: { ...T.small, color: C.textSub, marginTop: 2, marginBottom: space.md },
  // `flex: 1` so the list takes the space the card has left and scrolls inside
  // it. With `flexGrow: 0` it sized to its content and pushed Format and the
  // buttons past the card's maxHeight, where nothing could reach them.
  scroll: { flex: 1 },
  groupLabel: {
    color: C.textMuted, fontSize: 11, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', marginTop: space.md, marginBottom: space.sm,
  },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  preset: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.md,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
  },
  presetOn: { backgroundColor: C.primaryBg, borderColor: C.primary },
  presetText: { ...T.small, color: C.textSub, fontWeight: '700' },
  presetTextOn: { color: C.primary },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  dateInput: {
    flex: 1,
    // RN Web gives a flex child an auto min-width, so a date wider than the
    // share left it overflowed the card instead of shrinking into it.
    minWidth: 0, backgroundColor: C.surface, borderRadius: radius.md, borderWidth: 1,
    borderColor: C.border, paddingHorizontal: 12, paddingVertical: 10, color: C.text,
  },
  toJoiner: { ...T.small, color: C.textSub },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  rowIndented: { paddingLeft: space.lg },
  rowLabel: { ...T.body, color: C.text },
  rowCount: { ...T.small, color: C.textMuted, fontSize: 12 },
  hint: { ...T.small, color: C.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  btn: { flex: 1, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  btnGhostText: { ...T.body, color: C.textSub, fontWeight: '700' },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { ...T.body, color: C.onPrimary, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },
}));
