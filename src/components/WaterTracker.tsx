import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOAL_ML = 2500;

interface Props {
  waterMl: number;
  onAdd: () => void;
}

export default function WaterTracker({ waterMl, onAdd }: Props) {
  const pct = Math.min((waterMl / GOAL_ML) * 100, 100);
  const goalReached = waterMl >= GOAL_ML;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Water</Text>
        <Text style={styles.amount}>
          {waterMl} ml / {GOAL_ML} ml
        </Text>
      </View>

      <View style={styles.barBg}>
        <View
          style={[styles.barFill, { width: `${pct}%` as unknown as number }]}
        />
      </View>

      {goalReached ? (
        <Text style={styles.goalText}>Goal reached!</Text>
      ) : (
        <TouchableOpacity style={styles.button} onPress={onAdd}>
          <Text style={styles.buttonText}>+250 ml</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
  amount: {
    color: '#22c55e',
    fontSize: 16,
    fontWeight: '700',
  },
  barBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#333333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: '100%',
    backgroundColor: '#22c55e',
    borderRadius: 4,
  },
  goalText: {
    color: '#22c55e',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#22c55e',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#0d0d0d',
    fontSize: 14,
    fontWeight: '700',
  },
});
