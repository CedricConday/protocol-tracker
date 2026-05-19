import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledDose } from '../types';

const statusBorderColors: Record<string, string> = {
  taken:    '#5A8A5A',
  due:      '#C96A50',
  upcoming: '#4A7A9B',
  missed:   '#C04040',
};

interface Props {
  dose: ScheduledDose;
  onPress?: (dose: ScheduledDose) => void;
}

export default function DoseRow({ dose, onPress }: Props) {
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
    dose.status === 'due'   ? '#C96A50' :
    dose.status === 'taken' ? '#B0A098' :
                              '#7A6A62';

  const cardBg = dose.status === 'due' ? '#FBF0ED' : '#F2EDE8';

  let rightEl: React.ReactElement | null = null;
  if (dose.status === 'taken') {
    rightEl = <Text style={styles.rightTaken}>✓</Text>;
  } else if (dose.status === 'due') {
    rightEl = <Text style={styles.rightDue}>NOW</Text>;
  } else if (dose.status === 'missed') {
    rightEl = <Text style={styles.rightMissed}>✕</Text>;
  } else {
    rightEl = <Text style={styles.rightUpcoming}>›</Text>;
  }

  const borderColor = statusBorderColors[dose.status] ?? '#3b82f6';

  const inner = (
    <Animated.View style={[styles.card, { backgroundColor: cardBg }, { paddingVertical: 22 }, { transform: [{ scale: confirmScale }] }]}>
      {/* Animated left accent border */}
      <Animated.View
        style={[styles.accentBorder, { backgroundColor: borderColor, opacity: pulseAnim }]}
      />

      {/* Left: time column */}
      <View style={styles.timeCol}>
        <Text style={[styles.timeHour, { color: timeColor }]}>{timeLabel}</Text>
        <Text style={[styles.timeAmPm, { color: timeColor === '#7A6A62' ? '#B0A098' : timeColor }]}>
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
          <Text style={styles.withFoodTag}>🍽 with food</Text>
        )}
      </View>

      {/* Right: status indicator */}
      <View style={styles.rightCol}>
        {rightEl}
      </View>
    </Animated.View>
  );

  if (onPress) {
    const a11yLabel = `${dose.supplementName}, ${dose.doseAmount}, scheduled at ${timeLabel} ${ampm}, status ${dose.status}`;
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

  return inner;
}

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
    backgroundColor: '#D8CFC8',
    marginHorizontal: 12,
  },
  center: {
    flex: 1,
  },
  name: {
    color: '#2C2420',
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: '#7A6A62',
    fontSize: 13,
    marginTop: 2,
  },
  withFoodTag: {
    color: '#C4882A',
    fontSize: 11,
    marginTop: 4,
  },
  rightCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightTaken: {
    color: '#5A8A5A',
    fontSize: 16,
    fontWeight: '700',
  },
  rightDue: {
    color: '#C96A50',
    fontSize: 11,
    fontWeight: '800',
  },
  rightMissed: {
    color: '#C04040',
    fontSize: 14,
    fontWeight: '700',
  },
  rightUpcoming: {
    color: '#B0A098',
    fontSize: 18,
  },
});
