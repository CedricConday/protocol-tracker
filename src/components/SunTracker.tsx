import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOAL_MIN = 30;

interface Props {
  sunMinutes: number;
  onLog: (minutes: number) => void;
}

const SunTracker = React.memo(function SunTracker({ sunMinutes, onLog }: Props) {
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
});

export default SunTracker;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E8E0D8',
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
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
    color: '#7A6A62',
    fontSize: 14,
    fontWeight: '600',
  },
  amount: {
    color: '#2C2420',
    fontSize: 16,
    fontWeight: '700',
  },
  amountDone: {
    color: '#5A8A5A',
  },
  goal: {
    color: '#B0A098',
    fontSize: 14,
    fontWeight: '400',
  },
  barBg: {
    height: 8,
    backgroundColor: '#E8E0D8',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  barFill: {
    height: 8,
    backgroundColor: '#C4882A',
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    backgroundColor: '#FFF8EC',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C4882A30',
  },
  buttonText: {
    color: '#C4882A',
    fontSize: 15,
    fontWeight: '700',
  },
  goalBanner: {
    backgroundColor: '#F0F7F0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#5A8A5A30',
  },
  goalBannerText: {
    color: '#5A8A5A',
    fontSize: 14,
    fontWeight: '600',
  },
});
