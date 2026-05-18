import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const GOAL_ML = 2500;
const SEGMENT_ML = 500;
const SEGMENTS = GOAL_ML / SEGMENT_ML;

interface Props {
  waterMl: number;
  onAdd: () => void;
}

export default function WaterTracker({ waterMl, onAdd }: Props) {
  const goalReached = waterMl >= GOAL_ML;
  const fullSegments = Math.floor(waterMl / SEGMENT_ML);
  const partialRatio = (waterMl % SEGMENT_ML) / SEGMENT_ML;

  const tapScale = useRef(new Animated.Value(1)).current;
  const goalAnim = useRef(new Animated.Value(goalReached ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(goalAnim, {
      toValue: goalReached ? 1 : 0,
      useNativeDriver: true,
      friction: 6,
    }).start();
  }, [goalReached, goalAnim]);

  function handleAdd() {
    Animated.sequence([
      Animated.spring(tapScale, { toValue: 0.93, useNativeDriver: true, friction: 10 }),
      Animated.spring(tapScale, { toValue: 1, useNativeDriver: true, friction: 6 }),
    ]).start();
    onAdd();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.labelRow}>
          <Text style={styles.droplet}>💧</Text>
          <Text style={styles.label}>Water</Text>
        </View>
        <Text style={[styles.amount, goalReached ? styles.amountDone : null]}>
          {waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)}L` : `${waterMl}ml`}
          {' '}
          <Text style={styles.goal}>/ 2.5L</Text>
        </Text>
      </View>

      <View style={styles.segmentRow}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const isFull = i < fullSegments;
          const isPartial = i === fullSegments && partialRatio > 0;
          return (
            <View key={i} style={styles.segmentTrack}>
              {isFull ? (
                <View style={[styles.segmentFill, styles.segmentFull]} />
              ) : isPartial ? (
                <View style={styles.segmentPartialContainer}>
                  <View style={[styles.segmentFill, styles.segmentPartial, { width: `${partialRatio * 100}%` }]} />
                </View>
              ) : (
                <View style={[styles.segmentFill, styles.segmentEmpty]} />
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.tickRow}>
        <Text style={styles.tick}>0</Text>
        <Text style={styles.tick}>0.5L</Text>
        <Text style={styles.tick}>1L</Text>
        <Text style={styles.tick}>1.5L</Text>
        <Text style={styles.tick}>2L</Text>
        <Text style={styles.tickGoal}>2.5L</Text>
      </View>

      {goalReached ? (
        <Animated.View style={[styles.goalBanner, { transform: [{ scale: goalAnim }] }]}>
          <Text style={styles.goalBannerText}>Goal reached — great work!</Text>
        </Animated.View>
      ) : (
        <Animated.View style={{ transform: [{ scale: tapScale }] }}>
          <TouchableOpacity style={styles.button} onPress={handleAdd} activeOpacity={1}>
            <Text style={styles.buttonText}>+ 250 ml</Text>
            <Text style={styles.buttonSub}>{GOAL_ML - waterMl} ml to go</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#E8E0D8', shadowColor: '#2C2420', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  droplet: { fontSize: 16 },
  label: { color: '#7A6A62', fontSize: 14, fontWeight: '600' },
  amount: { color: '#2C2420', fontSize: 16, fontWeight: '700' },
  amountDone: { color: '#5A8A5A' },
  goal: { color: '#B0A098', fontSize: 14, fontWeight: '400' },
  segmentRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  segmentTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: '#E8E0D8' },
  segmentFill: { height: '100%', borderRadius: 5 },
  segmentFull: { width: '100%', backgroundColor: '#4A7A9B' },
  segmentPartialContainer: { width: '100%', height: '100%', flexDirection: 'row' },
  segmentPartial: { backgroundColor: '#6A9AB5' },
  segmentEmpty: { width: '100%', backgroundColor: 'transparent' },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  tick: { color: '#B0A098', fontSize: 10 },
  tickGoal: { color: '#4A7A9B', fontSize: 10, fontWeight: '600' },
  button: {
    backgroundColor: '#EBF0F5', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#4A7A9B30',
  },
  buttonText: { color: '#4A7A9B', fontSize: 15, fontWeight: '700' },
  buttonSub: { color: '#7A9BB5', fontSize: 12 },
  goalBanner: { backgroundColor: '#F0F7F0', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#5A8A5A30' },
  goalBannerText: { color: '#5A8A5A', fontSize: 14, fontWeight: '600' },
});
