import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledDose } from '../types';

const statusBorderColors: Record<string, string> = {
  taken:    '#22c55e',
  due:      '#f97316',
  upcoming: '#3b82f6',
  missed:   '#ef4444',
};

interface Props {
  dose: ScheduledDose;
  onPress?: (dose: ScheduledDose) => void;
  isSimple?: boolean;
}

export default function DoseRow({ dose, onPress, isSimple }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

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

  const hour   = dose.scheduledTime.getHours();
  const minute = dose.scheduledTime.getMinutes();
  const ampm   = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const minStr = minute.toString().padStart(2, '0');
  const timeLabel = `${hour12}:${minStr}`;

  const timeColor =
    dose.status === 'due'   ? '#f97316' :
    dose.status === 'taken' ? '#444444' :
                              '#888888';

  const cardBg = dose.status === 'due' ? '#1a1200' : '#111111';

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
    <View style={[styles.card, { backgroundColor: cardBg }, isSimple && { paddingVertical: 22 }]}>
      {/* Animated left accent border */}
      <Animated.View
        style={[styles.accentBorder, { backgroundColor: borderColor, opacity: pulseAnim }]}
      />

      {/* Left: time column */}
      <View style={styles.timeCol}>
        <Text style={[styles.timeHour, { color: timeColor }]}>{timeLabel}</Text>
        <Text style={[styles.timeAmPm, { color: timeColor === '#888888' ? '#555555' : timeColor }]}>
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
    </View>
  );

  if (onPress) {
    const a11yLabel = `${dose.supplementName}, ${dose.doseAmount}, scheduled at ${timeLabel} ${ampm}, status ${dose.status}`;
    return (
      <TouchableOpacity
        onPress={() => onPress(dose)}
        activeOpacity={0.75}
        style={isSimple ? { marginVertical: 4 } : null}
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
    backgroundColor: '#2a2a2a',
    marginHorizontal: 12,
  },
  center: {
    flex: 1,
  },
  name: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  meta: {
    color: '#888888',
    fontSize: 13,
    marginTop: 2,
  },
  withFoodTag: {
    color: '#eab308',
    fontSize: 11,
    marginTop: 4,
  },
  rightCol: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightTaken: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
  },
  rightDue: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '800',
  },
  rightMissed: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
  },
  rightUpcoming: {
    color: '#333333',
    fontSize: 18,
  },
});
