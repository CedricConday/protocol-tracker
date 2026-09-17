import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
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
  addSupplement,
  getAverageStartTime,
  getSupplementsWithRules,
  updateSupplementAndRule,
  localDateStr,
} from '../db/queries';
import { t, useLanguage } from '../i18n';
import { ChainLink, offsetsToGaps, reChainFrom } from '../engine/chain';
import { toFoodRelation } from '../engine/food';
import { clockPreview, formatDuration } from '../utils/duration';
import SupplementFields, { BLANK_SUPPLEMENT, SupplementFormState } from '../components/SupplementFields';
import DurationInput from '../components/DurationInput';

const { width } = Dimensions.get('window');

/**
 * Adding supplements, one after the other.
 *
 * The editor asks each supplement for its place in the day, measured from the
 * moment the day starts. That is the right question for one supplement and the
 * wrong one for a protocol: by pill #37 the patient is subtracting hours from a
 * moment this morning to answer it. What they know is the gap — "this one goes
 * thirty minutes after the magnesium" — so that is what this screen asks, every
 * time, naming the supplement before it.
 *
 * The gap is entry only. It is added to the last supplement's offset and stored
 * absolute, exactly as the editor stores it, because `startDay` resolves
 * `t0 + offset_minutes` and a stored chain would let one delete move every dose
 * after it.
 *
 * Each supplement is saved as the patient moves past it, not held to the end: a
 * wizard abandoned at #12 should have kept twelve supplements. The review step
 * is for the gaps, which is the part worth a second look.
 */

type SupRow = Awaited<ReturnType<typeof getSupplementsWithRules>>[number];

export default function SupplementWizardScreen() {
  useLanguage(); // re-render this screen when the language changes
  const navigation = useNavigation<any>();
  const [rules, setRules] = useState<SupRow[]>([]);
  const [t0, setT0] = useState<string | null>(null);
  const [form, setForm] = useState<SupplementFormState>(BLANK_SUPPLEMENT);
  const [gap, setGap] = useState(0);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [addedHere, setAddedHere] = useState(0);
  // What the last Save tap found missing. Empty until they actually tap, so the
  // card does not open already complaining about a field they have not reached.
  const [hint, setHint] = useState<string[]>([]);
  const translateX = useRef(new Animated.Value(0)).current;

  const reload = useCallback(async () => {
    const [rows, avg] = await Promise.all([getSupplementsWithRules(), getAverageStartTime()]);
    setRules(rows);
    setT0(avg);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: reviewing ? -width : 0,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [reviewing, translateX]);

  const chain: ChainLink<SupRow>[] = useMemo(() => offsetsToGaps(rules), [rules]);
  const last = chain.length > 0 ? chain[chain.length - 1] : null;
  const baseOffset = last?.offset_minutes ?? 0;

  /**
   * What is stopping this card, named — not just whether something is.
   *
   * Same rule the onboarding wizard settled on: never `disabled` the button. A
   * greyed-out control on a phone means the tap does nothing at all, with no
   * shake and no message, and the patient has no way to learn which field was
   * wanted.
   */
  const missingFields = (): string[] => (form.name.trim() ? [] : [t('supplementName')]);

  const handleSave = async () => {
    Keyboard.dismiss();
    const missing = missingFields();
    setHint(missing);
    if (missing.length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }

    setSaving(true);
    try {
      await addSupplement({
        name: form.name.trim(),
        form: form.form,
        dose_amount: form.dose_amount.trim(),
        dose_unit: form.dose_unit.trim(),
        offset_minutes: baseOffset + gap,
        food_relation: form.food_relation,
        tolerance_window: parseInt(form.tolerance_window, 10) || 30,
        frequency: form.frequency,
        days_of_week: form.days_of_week,
        day_of_month: parseInt(form.day_of_month, 10) || 0,
        cycle_on_days: parseInt(form.cycle_on_days, 10) || 0,
        cycle_off_days: parseInt(form.cycle_off_days, 10) || 0,
        cycle_start_date: localDateStr(new Date()),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reload();
      setForm(BLANK_SUPPLEMENT);
      // 30 minutes is the gap a protocol reaches for most often, and it is one
      // tap away from every other preset. Zero would quietly stack the next
      // pill on top of the one just entered.
      setGap(30);
      setAddedHere((n) => n + 1);
      setHint([]);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Restating a gap in the review moves everything after it, which is what the
   * patient means there: the chain was entered as gaps, so a later start for
   * one pill is a later start for the ones that follow it.
   *
   * Only the rows whose offset actually changed are written.
   */
  const changeGap = async (link: ChainLink<SupRow>, minutes: number) => {
    const next = reChainFrom(rules, link.id, minutes);
    const moved = next.filter((r) => {
      const before = rules.find((o) => o.id === r.id);
      return before && before.offset_minutes !== r.offset_minutes && r.rule_id != null;
    });
    if (moved.length === 0) return;

    setSaving(true);
    try {
      for (const row of moved) {
        await updateSupplementAndRule({
          supplementId: row.id,
          ruleId: row.rule_id ?? -1,
          name: row.name,
          form: row.form,
          dose_amount: row.dose_amount,
          dose_unit: row.dose_unit,
          offset_minutes: row.offset_minutes,
          food_relation: toFoodRelation(row.food_relation, row.with_food),
          tolerance_window: row.tolerance_window,
          frequency: row.frequency,
          days_of_week: row.days_of_week,
          day_of_month: row.day_of_month,
          cycle_on_days: row.cycle_on_days,
          cycle_off_days: row.cycle_off_days,
          cycle_start_date: row.cycle_start_date || localDateStr(new Date()),
        });
      }
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const timingQuestion = last
    ? t('timingAfterPrev', { name: last.name })
    : t('timingAfterStart');

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.dots}>
          <View style={[styles.dot, !reviewing && styles.dotActive]} />
          <View style={[styles.dot, reviewing && styles.dotActive]} />
        </View>

        <Animated.View style={[styles.pages, { transform: [{ translateX }] }]}>

          {/* ── Entry ─────────────────────────────────────────────────── */}
          <View style={styles.page}>
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {chain.length > 0 && (
                <View style={styles.chainCard}>
                  <Text style={styles.chainHeader}>{t('wizChainHeader')}</Text>
                  {chain.map((link) => (
                    <ChainRow key={link.id} link={link} t0={t0} />
                  ))}
                </View>
              )}

              <View style={styles.card}>
                <Text style={styles.cardTitle}>{t('wizSupplementNo', { n: chain.length + 1 })}</Text>
                <SupplementFields
                  // A new supplement is a new card: remounting drops the bubble
                  // that was left open on the last one, so #13 starts as a
                  // summary rather than mid-edit of #12's flexibility.
                  key={`supplement-${chain.length}`}
                  form={form}
                  onChange={setForm}
                  timingLabel={timingQuestion}
                  timingValue={gap === 0 && !last ? t('durAtStart') : `+${formatDuration(gap)}`}
                  renderTiming={() => (
                    <DurationInput
                      value={gap}
                      onChange={setGap}
                      t0={t0}
                      baseOffset={baseOffset}
                      zeroLabel={last ? undefined : t('durAtStart')}
                    />
                  )}
                />
                {hint.length > 0 && (
                  <Text style={styles.hint} accessibilityLiveRegion="polite">
                    {t('wizMissing', { fields: hint.join(', ') })}
                  </Text>
                )}
              </View>

              <View style={{ height: 24 }} />
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReviewing(true); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('wizReviewStep')}
              >
                <Text style={styles.secondaryBtnText}>{t('wizReviewStep')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.btnDisabled]}
                onPress={handleSave}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('wizNext')}
              >
                <Text style={styles.primaryBtnText}>{saving ? t('saving') : t('wizNext')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Review ────────────────────────────────────────────────── */}
          <View style={styles.page}>
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.reviewTitle}>{t('wizReviewTitle')}</Text>
              <Text style={styles.reviewIntro}>{t('wizReviewIntro')}</Text>

              {chain.length === 0 && <Text style={styles.reviewEmpty}>{t('wizReviewEmpty')}</Text>}

              {chain.map((link) => (
                <View key={link.id} style={styles.reviewCard}>
                  <View style={styles.reviewHead}>
                    <Text style={styles.reviewName}>{link.name}</Text>
                    {clockPreview(link.offset_minutes, t0) && (
                      <Text style={styles.reviewClock}>
                        {t('timingPreviewAt', { time: clockPreview(link.offset_minutes, t0) as string })}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.reviewGap}>
                    {link.prevName
                      ? t('timingAfterPrev', { name: link.prevName })
                      : t('wizStartsDay')}
                  </Text>
                  <DurationInput
                    value={link.gapFromPrev}
                    onChange={(minutes) => changeGap(link, minutes)}
                    t0={t0}
                    baseOffset={link.offset_minutes - link.gapFromPrev}
                    zeroLabel={link.prevName ? undefined : t('durAtStart')}
                  />
                </View>
              ))}

              {chain.length > 0 && (
                <View style={styles.noteRow}>
                  <Ionicons name="information-circle-outline" size={16} color={C.textMuted} />
                  <Text style={styles.note}>{t('wizTodayNote')}</Text>
                </View>
              )}

              <View style={{ height: 24 }} />
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReviewing(false); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('wizBack')}
              >
                <Text style={styles.secondaryBtnText}>{t('wizBack')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); navigation.goBack(); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('wizFinish')}
              >
                <Text style={styles.primaryBtnText}>
                  {addedHere > 0 ? t('wizDone', { count: addedHere }) : t('wizFinish')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChainRow({ link, t0 }: { link: ChainLink<{ id: string; name: string; offset_minutes: number }>; t0: string | null }) {
  const at = clockPreview(link.offset_minutes, t0);
  return (
    <View style={styles.chainRow}>
      <Text style={styles.chainName} numberOfLines={1}>{link.name}</Text>
      <Text style={styles.chainGap}>
        {link.prevName ? `+${formatDuration(link.gapFromPrev)}` : t('wizStartsDay')}
        {at ? ` · ${at}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  pages: { flex: 1, flexDirection: 'row', width: width * 2 },
  page: { width, flex: 1 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingTop: 12, paddingBottom: 4 },
  dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: C.border },
  dotActive: { backgroundColor: C.primary, width: 20 },

  card: { backgroundColor: C.surface, borderRadius: 14, marginBottom: 14, overflow: 'hidden' },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.primary,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 2,
  },
  hint: { paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8, fontSize: 13, color: C.danger },

  chainCard: {
    backgroundColor: C.surface,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chainHeader: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 8 },
  chainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 12 },
  chainName: { flex: 1, fontSize: 14, color: C.text },
  chainGap: { fontSize: 12, color: C.textMuted },

  reviewTitle: { fontSize: 20, fontWeight: '700', color: C.text, marginTop: 12 },
  reviewIntro: { fontSize: 13, color: C.textSub, marginTop: 6, marginBottom: 14, lineHeight: 19 },
  reviewEmpty: { fontSize: 14, color: C.textMuted, marginTop: 20 },
  reviewCard: { backgroundColor: C.surface, borderRadius: 14, padding: 16, marginBottom: 12 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  reviewName: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text },
  reviewClock: { fontSize: 12, color: C.primary, fontWeight: '600' },
  reviewGap: { fontSize: 12, color: C.textSub, marginTop: 4 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 4, paddingHorizontal: 2 },
  note: { flex: 1, fontSize: 12, color: C.textMuted, lineHeight: 17 },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
  },
  primaryBtn: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#F7F7F2', fontSize: 14, fontWeight: '600' },
  secondaryBtn: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: C.surface2,
    borderWidth: 1,
    borderColor: C.border,
  },
  secondaryBtnText: { color: C.textSub, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.55 },
});
