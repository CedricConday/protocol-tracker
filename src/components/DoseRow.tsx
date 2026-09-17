import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledDose } from '../types';
import { t, useLanguage } from '../i18n';

const statusBorderColors: Record<string, string> = {
  taken:    '#2F8F5B',
  due:      '#F2603C',
  upcoming: '#2AA6B8',
  missed:   '#C0392B',
  skipped:  '#9AA3B2',
};

interface Props {
  dose: ScheduledDose;
  onPress?: (dose: ScheduledDose) => void;
}

const DoseRow = React.memo(function DoseRow({ dose, onPress }: Props) {
  useLanguage(); // memoised: without this the language switch never reaches it
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const confirmScale = useRef(new Animated.Value(1)).current;
  const prevStatus = useRef(dose.status);

  useEffect(() => {
    if (dose.status === 'due') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
      return undefined;
    }
  }, [dose.status, pulseAnim]);

  useEffect(() => {
    if (prevStatus.current !== 'taken' && dose.status === 'taken') {
      Animated.sequence([
        Animated.spring(confirmScale, { toValue: 1.06, useNativeDriver: true, friction: 8 }),
        Animated.spring(confirmScale, { toValue: 1, useNativeDriver: true, friction: 6 }),
      ]).start();
    }
    prevStatus.current = dose.status;
  }, [dose.status, confirmScale]);

  const hour   = dose.scheduledTime.getHours();
  const minute = dose.scheduledTime.getMinutes();
  const ampm   = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minStr = minute.toString().padStart(2, '0');
  const timeLabel = `${hour12}:${minStr}`;

  const timeColor =
    dose.status === 'due'   ? '#F2603C' :
    dose.status === 'taken' ? '#9AA3B2' :
                              '#5A6478';

  const cardBg = dose.status === 'due' ? '#E7EEFB' : '#ECEDE6';

  let rightEl: React.ReactElement | null = null;
  if (dose.status === 'taken') {
    rightEl = <Text style={styles.rightTaken}>✓</Text>;
  } else if (dose.status === 'due') {
    rightEl = <Text style={styles.rightDue}>{t('nowUpper')}</Text>;
  } else if (dose.status === 'missed') {
    rightEl = <Text style={styles.rightMissed}>✕</Text>;
  } else if (dose.status === 'skipped') {
    rightEl = <Text style={styles.rightSkipped}>—</Text>;
  } else {
    rightEl = <Text style={styles.rightUpcoming}>›</Text>;
  }

  const borderColor = statusBorderColors[dose.status] ?? '#2AA6B8';

  const inner = (
    <Animated.View style={[styles.card, { backgroundColor: cardBg }, { paddingVertical: 22 }, { transform: [{ scale: confirmScale }] }]}>
      {/* Animated left accent border */}
      <Animated.View
        style={[styles.accentBorder, { backgroundColor: borderColor, opacity: pulseAnim }]}
      />

      {/* Left: time column */}
      <View style={styles.timeCol}>
        <Text style={[styles.timeHour, { color: timeColor }]}>{timeLabel}</Text>
        <Text style={[styles.timeAmPm, { color: timeColor === '#5A6478' ? '#9AA3B2' : timeColor }]}>
          {ampm}
        </Text>
      </View>

      {/* Separator */}
      <View style={styles.separator} />

      {/* Center: supplement info */}
      <View style={styles.center}>
        <Text style={styles.name} numberOfLines={1}>{dose.supplementName}</Text>
        <Text style={styles.meta}>
          {dose.doseAmount}
          {dose.form ? ` · ${dose.form}` : ''}
        </Text>
        {dose.withFood && (
          <Text style={styles.withFoodTag}>🍽 {t('withFood')}</Text>
        )}
      </View>

      {/* Right: status indicator */}
      <View style={styles.rightCol}>
        {rightEl}
      </View>
    </Animated.View>
  );

  const a11yLabel = t('doseRowA11y', {
    supplement: dose.supplementName,
    amount: dose.doseAmount,
    time: `${timeLabel} ${ampm}`,
    status: t(STATUS_KEYS[dose.status] ?? 'doseUpcoming'),
  });

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={() => onPress(dose)}
        activeOpacity={0.75}
        style={{ marginVertical: 4 }}
        accessibilityLabel={a11yLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: dose.status === 'taken' }}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  // Not pressable, but still a row the user is meant to read. Without a name
  // here the expanded dose list exposed no accessible rows at all — screen
  // readers and name-based tests saw an unlabelled group.
  return (
    <View accessible accessibilityLabel={a11yLabel} accessibilityRole="text">
      {inner}
    </View>
  );
});

/** Shared with DoseDetailModal: the app's own word for each dose status. */
const STATUS_KEYS: Record<string, string> = {
  taken: 'taken', due: 'doseDue', upcoming: 'doseUpcoming', missed: 'missed', skipped: 'skipped',
};

export default DoseRow;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginBottom: 8,
    padding: 14,
    overflow: 'hidden',
  },
  accentBorder: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 3,
  },
  timeCol: {
    width: 64,
    alignItems: 'center',
    paddingLeft: 8,
  },
  timeHour: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeAmPm: {
    fontSize: 11,
    marginTop: 1,
  },
  separator: {
    width: 1,
    height: 36,
    backgroundColor: '#CFD2C6',
    marginHorizontal: 12,
  },
  center: {
    flex: 1,
  },
  name: {
    color: '#14213D',
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: '#5A6478',
    fontSize: 13,
    marginTop: 2,
  },
  withFoodTag: {
    color: '#F2B233',
    fontSize: 11,
    marginTop: 4,
  },
  rightCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightTaken: {
    color: '#2F8F5B',
    fontSize: 16,
    fontWeight: '700',
  },
  rightDue: {
    color: '#F2603C',
    fontSize: 11,
    fontWeight: '800',
  },
  rightMissed: {
    color: '#C0392B',
    fontSize: 14,
    fontWeight: '700',
  },
  rightSkipped: {
    color: '#9AA3B2',
    fontSize: 14,
    fontWeight: '700',
  },
  rightUpcoming: {
    color: '#9AA3B2',
    fontSize: 18,
  },
});
