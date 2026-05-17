import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ScheduledDose } from '../types';

const statusColors: Record<string, string> = {
  upcoming: '#3b82f6',
  due: '#f97316',
  taken: '#22c55e',
  missed: '#ef4444',
};

interface Props {
  dose: ScheduledDose;
  onPress?: (dose: ScheduledDose) => void;
}

export default function DoseRow({ dose, onPress }: Props) {
  const timeStr = dose.scheduledTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const inner = (
    <View style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.name}>{dose.supplementName}</Text>
        <Text style={styles.meta}>
          {timeStr} &middot; {dose.doseAmount}
        </Text>
      </View>
      <View
        style={[
          styles.badge,
          { backgroundColor: statusColors[dose.status] },
        ]}
      >
        <Text style={styles.badgeText}>{dose.status}</Text>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={() => onPress(dose)} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  info: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: '#888888',
    fontSize: 13,
    marginTop: 4,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
