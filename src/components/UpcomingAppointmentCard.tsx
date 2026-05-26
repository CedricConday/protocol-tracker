import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { MedicalEvent } from '../types';

interface Props {
  event: MedicalEvent;
  onViewDetails?: () => void;
}

function daysAway(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatEventDate(dateStr: string, timeStr?: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  return timeStr ? `${day} · ${timeStr}` : day;
}

function awayLabel(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return `${days} days away`;
  const weeks = Math.round(days / 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} away`;
}

const UpcomingAppointmentCard = React.memo(function UpcomingAppointmentCard({ event, onViewDetails }: Props) {
  const [expanded, setExpanded] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: expanded ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [expanded, expandAnim]);

  const days = daysAway(event.scheduled_date);

  const handleCardPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded(v => !v);
  };

  const handleViewDetails = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onViewDetails?.();
  };

  const expandHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 130],
  });

  const expandOpacity = expandAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const pulseScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.6],
  });

  const pulseOpacity = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.8, 0.3, 0],
  });

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handleCardPress}
      activeOpacity={0.97}
      accessibilityRole="button"
      accessibilityLabel={`Next appointment: ${event.title}, ${formatEventDate(event.scheduled_date, event.scheduled_time)}`}
      accessibilityState={{ expanded }}
    >
      {/* pulse dot + label */}
      <View style={styles.labelRow}>
        <View style={styles.dotWrap}>
          <Animated.View
            style={[styles.dotPulse, { transform: [{ scale: pulseScale }], opacity: pulseOpacity }]}
          />
          <View style={styles.dot} />
        </View>
        <Text style={styles.label}>NEXT APPOINTMENT</Text>
      </View>

      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.date}>{formatEventDate(event.scheduled_date, event.scheduled_time)}</Text>

      <View style={styles.footer}>
        <Text style={styles.away}>{awayLabel(days)}</Text>
        <TouchableOpacity onPress={handleViewDetails} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.link}>View Details →</Text>
        </TouchableOpacity>
      </View>

      {/* expanded detail */}
      <Animated.View style={[styles.expandWrap, { height: expandHeight, opacity: expandOpacity }]}>
        <View style={styles.expandInner}>
          {event.location ? (
            <View style={styles.meta}>
              <Text style={styles.metaKey}>LOCATION</Text>
              <Text style={styles.metaVal}>{event.location}</Text>
            </View>
          ) : null}
          {event.notes ? (
            <View style={styles.meta}>
              <Text style={styles.metaKey}>NOTES</Text>
              <Text style={styles.metaVal}>{event.notes}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={() => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
            activeOpacity={0.85}
          >
            <Text style={styles.completeBtnText}>Mark Complete</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

export default UpcomingAppointmentCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FBF0ED',
    borderRadius: 14,
    padding: 16,
    paddingLeft: 19,
    borderLeftWidth: 3,
    borderLeftColor: '#C96A50',
    marginBottom: 14,
    overflow: 'hidden',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dotWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C96A50',
    position: 'absolute',
  },
  dotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C96A50',
    position: 'absolute',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.4,
    color: '#C96A50',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2A1F1B',
    marginTop: 8,
    lineHeight: 22,
  },
  date: {
    fontSize: 13,
    color: '#5B4A43',
    marginTop: 4,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  away: {
    fontSize: 12,
    fontWeight: '600',
    color: '#C96A50',
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5B4A43',
  },
  expandWrap: {
    overflow: 'hidden',
  },
  expandInner: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(201, 106, 80, 0.18)',
    paddingTop: 12,
    marginTop: 14,
    gap: 8,
  },
  meta: {
    gap: 2,
  },
  metaKey: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: '#8B7B73',
    textTransform: 'uppercase',
  },
  metaVal: {
    fontSize: 13,
    color: '#2A1F1B',
    fontWeight: '500',
    lineHeight: 19,
  },
  completeBtn: {
    backgroundColor: '#C96A50',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
