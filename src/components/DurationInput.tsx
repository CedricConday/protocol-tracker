import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { C, themed, useTheme } from '../theme/colors';
import { t } from '../i18n';
import { formatDuration } from '../utils/duration';

/**
 * How long after the last thing.
 *
 * This replaces a single numeric box the patient typed "240" into. The presets
 * carry almost every real answer — supplements are spaced in round numbers —
 * and the custom row asks for hours and minutes in two labelled fields rather
 * than one box measuring a quantity in a unit the patient does not think in.
 *
 * A gap is all this control states. It used to print a summary underneath —
 * "right away · about 07:47" — where the clock half was guessed from the
 * average of past start times. Nobody asked for that hour: in a T=0 protocol
 * the day starts when the patient starts it, so a predicted wall-clock time is
 * a promise the app cannot keep and a number the patient never entered.
 */

/** Round numbers, because that is how a protocol is actually spaced. */
const PRESETS = [0, 15, 30, 60, 120, 240] as const;

type Props = {
  /** Minutes after whatever this is being measured against. */
  value: number;
  onChange: (minutes: number) => void;
  label?: string;
  /**
   * What a gap of nothing is called here. "Same time" is right when this is
   * measured against another supplement and wrong when it is measured against
   * the start of the day, where the answer is "at start" - there is nothing to
   * be at the same time as.
   */
  zeroLabel?: string;
};

export default function DurationInput({ value, onChange, label, zeroLabel }: Props) {
  useTheme(); // re-render this component when the theme tier changes
  // Custom opens by itself for a value the chips cannot express, so an existing
  // supplement at 47 minutes shows 47 rather than silently reading as a preset.
  const [custom, setCustom] = useState(() => !PRESETS.includes(value as (typeof PRESETS)[number]));

  const hours = Math.floor(Math.max(0, value) / 60);
  const minutes = Math.max(0, value) % 60;

  const setParts = (h: number, m: number) => onChange(Math.max(0, h) * 60 + Math.max(0, m));

  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.chipRow}>
        {PRESETS.map((p) => {
          const active = !custom && value === p;
          const text = p === 0 ? (zeroLabel ?? t('timingPresetSame')) : formatDuration(p);
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
    </View>
  );
}

const styles = themed((C) => StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', color: C.textSub, marginBottom: 6, marginTop: 12 },
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
  customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  customField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: C.sunken,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: C.text,
  },
  unit: { fontSize: 13, color: C.textSub, fontWeight: '500' },
}));
