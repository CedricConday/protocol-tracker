import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C } from '../theme/colors';
import { t } from '../i18n';
import { clockPreview, formatDuration } from '../utils/duration';

/**
 * How long after the last thing.
 *
 * This replaces a single numeric box the patient typed "240" into. The presets
 * carry almost every real answer — supplements are spaced in round numbers —
 * and the custom row asks for hours and minutes in two labelled fields rather
 * than one box measuring a quantity in a unit the patient does not think in.
 *
 * The clock preview under it is the other half of the fix: "4 h" is readable,
 * but "about 11:00" is the thing they can check against their morning. It is a
 * hint and never a gate — a patient who has not started a day yet has no usual
 * start time, and entering supplements must not wait on a fortnight of history.
 */

/** Round numbers, because that is how a protocol is actually spaced. */
const PRESETS = [0, 15, 30, 60, 120, 240] as const;

type Props = {
  /** Minutes after whatever this is being measured against. */
  value: number;
  onChange: (minutes: number) => void;
  /** The patient's usual start time as "HH:MM", or null when there isn't one yet. */
  t0?: string | null;
  /** The offset of the thing before this one, so the preview shows a real clock time. */
  baseOffset?: number;
  label?: string;
};

export default function DurationInput({ value, onChange, t0 = null, baseOffset = 0, label }: Props) {
  // Custom opens by itself for a value the chips cannot express, so an existing
  // supplement at 47 minutes shows 47 rather than silently reading as a preset.
  const [custom, setCustom] = useState(() => !PRESETS.includes(value as (typeof PRESETS)[number]));

  const hours = Math.floor(Math.max(0, value) / 60);
  const minutes = Math.max(0, value) % 60;
  const preview = clockPreview(baseOffset + value, t0);

  const setParts = (h: number, m: number) => onChange(Math.max(0, h) * 60 + Math.max(0, m));

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.chipRow}>
        {PRESETS.map((p) => {
          const active = !custom && value === p;
          const text = p === 0 ? t('timingPresetSame') : formatDuration(p);
          return (
            <TouchableOpacity
              key={p}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => { setCustom(false); onChange(p); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={text}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{text}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, custom && styles.chipActive]}
          onPress={() => setCustom(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: custom }}
          accessibilityLabel={t('timingPresetCustom')}
        >
          <Text style={[styles.chipText, custom && styles.chipTextActive]}>{t('timingPresetCustom')}</Text>
        </TouchableOpacity>
      </View>

      {custom && (
        <View style={styles.customRow}>
          <View style={styles.customField}>
            <TextInput
              style={styles.input}
              value={hours ? String(hours) : ''}
              onChangeText={(v) => setParts(parseInt(v, 10) || 0, minutes)}
              placeholder="0"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              accessibilityLabel={t('timingCustomHours')}
            />
            <Text style={styles.unit}>{t('timingCustomHours')}</Text>
          </View>
          <View style={styles.customField}>
            <TextInput
              style={styles.input}
              value={minutes ? String(minutes) : ''}
              onChangeText={(v) => setParts(hours, parseInt(v, 10) || 0)}
              placeholder="0"
              placeholderTextColor={C.textMuted}
              keyboardType="numeric"
              accessibilityLabel={t('timingCustomMinutes')}
            />
            <Text style={styles.unit}>{t('timingCustomMinutes')}</Text>
          </View>
        </View>
      )}

      <Text style={styles.summary} accessibilityLiveRegion="polite">
        {formatDuration(value)}
        {preview ? ` · ${t('timingPreviewAt', { time: preview })}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 12 },
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
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  customField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: C.surface2,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
  },
  unit: { fontSize: 13, color: C.textSub, fontWeight: '500' },
  summary: { marginTop: 8, fontSize: 13, color: C.textMuted },
});
