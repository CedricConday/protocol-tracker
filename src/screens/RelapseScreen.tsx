import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { logRelapseEvent, getRelapseEvents, todayStr } from '../db/queries';
import type { RelapseEvent } from '../types';

const TYPE_COLORS: Record<string, string> = {
  relapse: '#ef4444',
  cortisone: '#eab308',
  symptom: '#888888',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export default function RelapseScreen() {
  const [eventType, setEventType] = useState<string>('relapse');
  const [eventDate, setEventDate] = useState(todayStr());
  const [cortisoneDose, setCortisoneDose] = useState('');
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [events, setEvents] = useState<RelapseEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [logged, setLogged] = useState(false);

  const loadEvents = useCallback(async () => {
    const data = await getRelapseEvents();
    setEvents(data);
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadEvents();
    setRefreshing(false);
  };

  const handleLog = async () => {
    await logRelapseEvent({
      date: eventDate,
      type: eventType,
      cortisone_dose_mg: eventType === 'cortisone' && cortisoneDose ? parseInt(cortisoneDose, 10) : undefined,
      notes,
      severity: severity ?? undefined,
    });
    setEventType('relapse');
    setEventDate(todayStr());
    setCortisoneDose('');
    setSeverity(null);
    setNotes('');
    setLogged(true);
    setTimeout(() => setLogged(false), 2000);
    await loadEvents();
  };

  const placeholderText = eventType === 'cortisone'
    ? 'Pulse dose details...'
    : eventType === 'symptom'
      ? 'What symptoms?'
      : 'Describe what happened...';

  const typeLabels: Record<string, string> = {
    relapse: 'Relapse',
    cortisone: 'Cortisone',
    symptom: 'Symptom',
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22c55e" />
      }
    >
      <Text style={styles.heading}>Log Event</Text>

      <Text style={styles.sectionTitle}>Type</Text>
      <View style={styles.typeRow}>
        {['relapse', 'cortisone', 'symptom'].map((t) => {
          const selected = eventType === t;
          const color = TYPE_COLORS[t];
          return (
            <TouchableOpacity
              key={t}
              style={[
                styles.typeButton,
                selected
                  ? { backgroundColor: color, borderColor: color }
                  : { backgroundColor: 'transparent', borderColor: color },
              ]}
              onPress={() => setEventType(t)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeButtonText,
                  { color: selected ? '#0d0d0d' : color },
                ]}
              >
                {typeLabels[t]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Date</Text>
      <View style={styles.sectionCard}>
        <TextInput
          style={styles.input}
          value={eventDate}
          onChangeText={setEventDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#555555"
          autoCapitalize="none"
        />
        <Text style={styles.datePreview}>{formatDate(eventDate)}</Text>
      </View>

      {eventType === 'cortisone' ? (
        <>
          <Text style={styles.sectionTitle}>Cortisone Dose (mg)</Text>
          <View style={styles.sectionCard}>
            <TextInput
              style={[styles.input, styles.inputLast]}
              value={cortisoneDose}
              onChangeText={setCortisoneDose}
              placeholder="e.g. 1000"
              placeholderTextColor="#555555"
              keyboardType="numeric"
            />
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>
        Severity
        {eventType !== 'cortisone' ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View style={styles.severityRow}>
        {[1, 2, 3, 4, 5].map((s) => {
          const selected = severity === s;
          const hue = 120 - (s - 1) * 30;
          const color = selected ? `hsl(${hue}, 80%, 50%)` : '#555555';
          return (
            <TouchableOpacity
              key={s}
              style={[
                styles.severityCircle,
                { borderColor: color },
                selected ? { backgroundColor: color } : null,
              ]}
              onPress={() => setSeverity(s)}
              activeOpacity={0.7}
            >
              <Text style={[styles.severityText, { color: selected ? '#0d0d0d' : '#555555' }]}>
                {s}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>Notes</Text>
      <View style={styles.sectionCard}>
        <TextInput
          style={[styles.input, styles.inputMultiline, styles.inputLast]}
          value={notes}
          onChangeText={setNotes}
          placeholder={placeholderText}
          placeholderTextColor="#555555"
          multiline
        />
      </View>

      <TouchableOpacity
        style={[styles.logButton, eventType !== 'cortisone' && severity === null ? styles.logButtonDisabled : null]}
        onPress={handleLog}
        disabled={eventType !== 'cortisone' && severity === null}
        activeOpacity={0.8}
      >
        <Text style={styles.logButtonText}>
          {logged ? 'Logged ✓' : 'Log Event'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Event History</Text>
      {events.length === 0 ? (
        <Text style={styles.emptyText}>No events logged. This is good news.</Text>
      ) : (
        events.map((e) => {
          const color = TYPE_COLORS[e.type] ?? '#888888';
          return (
            <View key={e.id} style={styles.eventCard}>
              <View style={styles.eventTop}>
                <View style={[styles.eventBadge, { backgroundColor: color + '30' }]}>
                  <Text style={[styles.eventBadgeText, { color }]}>
                    {typeLabels[e.type] ?? e.type}
                  </Text>
                </View>
                <Text style={styles.eventDateText}>{formatDate(e.date)}</Text>
                {e.severity != null ? (
                  <View style={styles.severityDots}>
                    {Array.from({ length: e.severity }, (_, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: color }]} />
                    ))}
                  </View>
                ) : null}
              </View>
              {e.notes ? (
                <Text style={styles.eventNotes}>{e.notes}</Text>
              ) : null}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#555555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  required: {
    color: '#ef4444',
  },
  sectionCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 12,
    color: '#ffffff',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    marginBottom: 2,
  },
  inputLast: {
    borderBottomWidth: 0,
    marginBottom: 10,
  },
  inputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  datePreview: {
    color: '#888888',
    fontSize: 13,
    marginBottom: 8,
  },
  severityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  severityCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityText: {
    fontSize: 16,
    fontWeight: '700',
  },
  logButton: {
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  logButtonDisabled: {
    opacity: 0.4,
  },
  logButtonText: {
    color: '#0d0d0d',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#555555',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  eventCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  eventTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  eventBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  eventBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  eventDateText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  severityDots: {
    flexDirection: 'row',
    gap: 3,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  eventNotes: {
    color: '#888888',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
});
