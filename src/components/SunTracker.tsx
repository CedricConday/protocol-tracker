import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOAL_MIN = 30;

interface Props {
  sunMinutes: number;
  onLog: (minutes: number) => void;
}

export default function SunTracker({ sunMinutes, onLog }: Props) {
  const goalReached = sunMinutes >= GOAL_MIN;
  const pct = Math.min(sunMinutes / GOAL_MIN, 1);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={styles.icon}>☀️</Text>
          <Text style={styles.label}>Sun Exposure</Text>
        </View>
        <Text style={[styles.amount, goalReached ? styles.amountDone : null]}>
          {sunMinutes}
          <Text style={styles.goal}> / {GOAL_MIN} min</Text>
        </Text>
      </View>

      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct * 100}%` as `${number}%` }]} />
      </View>

      {goalReached ? (
        <View style={styles.goalBanner}>
          <Text style={styles.goalBannerText}>Goal reached ✓</Text>
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={() => onLog(10)} activeOpacity={0.8}>
            <Text style={styles.buttonText}>+10</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => onLog(20)} activeOpacity={0.8}>
            <Text style={styles.buttonText}>+20</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => onLog(30)} activeOpacity={0.8}>
            <Text style={styles.buttonText}>+30</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111111',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 16,
  },
  label: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
  amount: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  amountDone: {
    color: '#22c55e',
  },
  goal: {
    color: '#444444',
    fontSize: 14,
    fontWeight: '400',
  },
  barBg: {
    height: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: 8,
    backgroundColor: '#eab308',
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eab30844',
  },
  buttonText: {
    color: '#eab308',
    fontSize: 15,
    fontWeight: '700',
  },
  goalBanner: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  goalBannerText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '600',
  },
});
