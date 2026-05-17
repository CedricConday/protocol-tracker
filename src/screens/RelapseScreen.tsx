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
  pain: '#a855f7',
};

const PAIN_SUBTYPES = [
  'Dysesthetic (burning/tingling)',
  'Spasticity (muscle)',
  'Musculoskeletal',
  'Headache',
];

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
  const [painSubtype, setPainSubtype] = useState<string | null>(null);
  const [lasted24h, setLasted24h] = useState<boolean | null>(null);
  const [hasFever, setHasFever] = useState<boolean | null>(null);
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
      pain_type: eventType === 'pain' ? (painSubtype ?? undefined) : undefined,
      lasted_24h: lasted24h !== null ? (lasted24h ? 1 : 0) : undefined,
      has_fever: hasFever !== null ? (hasFever ? 1 : 0) : undefined,
    });
    setEventType('relapse');
    setEventDate(todayStr());
    setCortisoneDose('');
    setSeverity(null);
    setNotes('');
    setPainSubtype(null);
    setLasted24h(null);
    setHasFever(null);
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
    pain: 'Pain',
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C96A50" />
      }
    >
      <Text style={styles.heading}>Log Event</Text>

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

      <Text style={styles.sectionTitle}>Type</Text>
      <View style={styles.typeRow}>
        {['relapse', 'cortisone', 'symptom', 'pain'].map((t) => {
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
                  { color: selected ? '#FAF7F4' : color },
                ]}
              >
                {typeLabels[t]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {eventType === 'pain' ? (
        <>
          <Text style={styles.sectionTitle}>Pain Type</Text>
          <View style={styles.painSubtypeContainer}>
            {PAIN_SUBTYPES.map((subtype) => {
              const selected = painSubtype === subtype;
              return (
                <TouchableOpacity
                  key={subtype}
                  style={[styles.painSubtypeButton, selected ? styles.painSubtypeSelected : null]}
                  onPress={() => setPainSubtype(subtype)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.painSubtypeText, selected ? styles.painSubtypeTextSelected : null]}>
                    {subtype}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

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

      {eventType === 'relapse' || eventType === 'symptom' ? (
        <>
          <Text style={styles.sectionTitle}>24-Hour Rule</Text>
          <View style={styles.yesNoRow}>
            {([true, false] as const).map((val) => (
              <TouchableOpacity
                key={String(val)}
                style={[styles.yesNoBtn, lasted24h === val ? styles.yesNoBtnActive : null]}
                onPress={() => setLasted24h(val)}
                activeOpacity={0.7}
              >
                <Text style={[styles.yesNoBtnText, lasted24h === val ? styles.yesNoBtnTextActive : null]}>
                  {val ? 'Yes — lasted >24h' : 'No — resolved sooner'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.sectionTitle}>Fever Present?</Text>
          <View style={styles.yesNoRow}>
            {([true, false] as const).map((val) => (
              <TouchableOpacity
                key={String(val)}
                style={[styles.yesNoBtn, hasFever === val ? styles.yesNoBtnActive : null]}
                onPress={() => setHasFever(val)}
                activeOpacity={0.7}
              >
                <Text style={[styles.yesNoBtnText, hasFever === val ? styles.yesNoBtnTextActive : null]}>
                  {val ? 'Yes' : 'No'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {hasFever === true ? (
            <View style={styles.feverWarning}>
              <Text style={styles.feverWarningText}>Fever can mimic or mask a relapse. Contact your neurologist if symptoms persist beyond 48h after fever resolves.</Text>
            </View>
          ) : null}
        </>
      ) : null}

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
        style={[styles.logButton, (eventType !== 'cortisone' && severity === null) || (eventType === 'pain' && painSubtype === null) ? styles.logButtonDisabled : null]}
        onPress={handleLog}
        disabled={(eventType !== 'cortisone' && severity === null) || (eventType === 'pain' && painSubtype === null)}
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
              {e.pain_type ? (
                <Text style={styles.painTypeTag}>{e.pain_type}</Text>
              ) : null}
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
    backgroundColor: '#FAF7F4',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  heading: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#B0A098',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  required: {
    color: '#C04040',
  },
  sectionCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D8CFC8',
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
    color: '#2C2420',
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#D8CFC8',
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
    color: '#7A6A62',
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
    backgroundColor: '#C96A50',
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
    color: '#FAF7F4',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: '#B0A098',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  eventCard: {
    backgroundColor: '#F2EDE8',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#D8CFC8',
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
    color: '#2C2420',
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
    color: '#7A6A62',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 18,
  },
  painSubtypeContainer: {
    gap: 8,
  },
  painSubtypeButton: {
    borderWidth: 1,
    borderColor: '#D8CFC8',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F2EDE8',
  },
  painSubtypeSelected: {
    borderColor: '#9B7FC0',
    backgroundColor: '#F0EBF7',
  },
  painSubtypeText: {
    color: '#7A6A62',
    fontSize: 14,
    fontWeight: '500',
  },
  painSubtypeTextSelected: {
    color: '#7B56A8',
    fontWeight: '700',
  },
  painTypeTag: {
    color: '#7B56A8',
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  yesNoBtn: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: '#D8CFC8', paddingVertical: 10, alignItems: 'center' },
  yesNoBtnActive: { borderColor: '#5A8A5A', backgroundColor: '#EFF7EF' },
  yesNoBtnText: { color: '#7A6A62', fontSize: 13, fontWeight: '600' },
  yesNoBtnTextActive: { color: '#5A8A5A' },
  feverWarning: { backgroundColor: '#FDF3E0', borderRadius: 10, padding: 12, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#C4882A' },
  feverWarningText: { color: '#C4882A', fontSize: 12, lineHeight: 18 },
});
