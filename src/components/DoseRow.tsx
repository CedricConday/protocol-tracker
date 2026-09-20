import React, { useEffect, useRef } from 'react';
import { C, themed, useTheme } from '../theme/colors';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledDose } from '../types';
import { t, useLanguage } from '../i18n';
import { clockParts } from '../i18n/dates';

const statusBorderColors: Record<string, string> = {
  taken:    C.success,
  due:      C.due,
  upcoming: C.teal,
  missed:   C.danger,
  skipped:  C.textMuted,
};

interface Props {
  dose: ScheduledDose;
  onPress?: (dose: ScheduledDose) => void;
}

const DoseRow = React.memo(function DoseRow({ dose, onPress }: Props) {
  useLanguage(); // memoised: without this the language switch never reaches it
  useTheme(); // ...and when the theme tier changes
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

  /**
   * The anchor dose has no clock time.
   *
   * A dose at offset 0 is T=0 itself: the day starts when it is taken, and the
   * patient never gave it an hour. Printing the moment they happened to tap
   * "Start My Day" in the time column read as a schedule they had set and did
   * not keep — a 7:47 they never chose, wrong by a minute every morning after.
   * The offset is the honest answer, so the column says "at start".
   */
  const isAnchor = dose.offsetMinutes === 0;

  // The clock follows the locale, like every other time in the app. This row
  // used to build 12-hour AM/PM by hand, so a German user read "2:30 PM" here
  // and "14:30" everywhere else.
  const { time: timeLabel, dayPeriod } = clockParts(dose.scheduledTime);

  const timeColor =
    dose.status === 'due'   ? C.due :
    dose.status === 'taken' ? C.textMuted :
                              C.textSub;

  const cardBg = dose.status === 'due' ? C.primaryBg : C.surface;

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

  const borderColor = statusBorderColors[dose.status] ?? C.teal;

  const inner = (
    <Animated.View style={[styles.card, { backgroundColor: cardBg }, { paddingVertical: 22 }, { transform: [{ scale: confirmScale }] }]}>
      {/* Animated left accent border */}
      <Animated.View
        style={[styles.accentBorder, { backgroundColor: borderColor, opacity: pulseAnim }]}
      />

      {/* Left: time column */}
      <View style={styles.timeCol}>
        {isAnchor ? (
          <Text style={[styles.timeAnchor, { color: timeColor }]}>{t('durAtStart')}</Text>
        ) : (
          <>
            <Text style={[styles.timeHour, { color: timeColor }]}>{timeLabel}</Text>
            {dayPeriod ? (
              <Text style={[styles.timeAmPm, { color: timeColor === C.textSub ? C.textMuted : timeColor }]}>
                {dayPeriod}
              </Text>
            ) : null}
          </>
        )}
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

  const a11yLabel = isAnchor
    ? t('doseRowAtStartA11y', {
        supplement: dose.supplementName,
        amount: dose.doseAmount,
        status: t(STATUS_KEYS[dose.status] ?? 'doseUpcoming'),
      })
    : t('doseRowA11y', {
        supplement: dose.supplementName,
        amount: dose.doseAmount,
        time: dayPeriod ? `${timeLabel} ${dayPeriod}` : timeLabel,
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

const styles = themed((C) => StyleSheet.create({
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
  // Two words in the width one clock time had: smaller, centred, wrapping.
  timeAnchor: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  separator: {
    width: 1,
    height: 36,
    backgroundColor: C.sunken,
    marginHorizontal: 12,
  },
  center: {
    flex: 1,
  },
  name: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: C.textSub,
    fontSize: 13,
    marginTop: 2,
  },
  withFoodTag: {
    color: C.warning,
    fontSize: 11,
    marginTop: 4,
  },
  rightCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightTaken: {
    color: C.success,
    fontSize: 16,
    fontWeight: '700',
  },
  rightDue: {
    color: C.due,
    fontSize: 11,
    fontWeight: '800',
  },
  rightMissed: {
    color: C.danger,
    fontSize: 14,
    fontWeight: '700',
  },
  rightSkipped: {
    color: C.textMuted,
    fontSize: 14,
    fontWeight: '700',
  },
  rightUpcoming: {
    color: C.textMuted,
    fontSize: 18,
  },
}));
