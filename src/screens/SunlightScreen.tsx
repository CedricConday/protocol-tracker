import { useCallback, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import SunTracker from '../components/SunTracker';
import { clearSunLog, correctSunLog, getTodaySunLog, logSunExposure } from '../db/queries';

/**
 * The Sunlight screen (PT-trio round 3, C2).
 *
 * Same shape as Water, with one structural difference that changes the whole
 * screen: `sun_log.date` is UNIQUE, so a day is ONE aggregated row, not a list
 * of entries. There is no "remove the last 20 minutes" — the day itself is the
 * unit of correction. So this screen offers add (`logSunExposure`, which sums),
 * set-outright (`correctSunLog`) and clear (`clearSunLog`), and no entry list,
 * because there are no entries to list.
 *
 * THE 7-DAY STRIP IS NOT BUILT, and says so on the screen rather than drawing
 * zeroes. `getTodaySunLog` computes its own `todayStr()` and takes no date, so
 * nothing in the app can read a past day's sun at all — the gap Build C's B3
 * note flagged when `correctSunLog` landed. Reading it needs a query in
 * `src/db/**`, which is Build A's in round 3; filed as handoff H13. Drawing an
 * empty week in the meantime would have said "you were never outside", which is
 * a different and worse claim than "not built".
 */

const MAX_MIN = 600;

export default function SunlightScreen() {
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState(0);
  const [notes, setNotes] = useState('');
  const [savedNotes, setSavedNotes] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [correctDraft, setCorrectDraft] = useState('0');

  const load = useCallback(async () => {
    try {
      const today = await getTodaySunLog();
      setMinutes(today?.minutes ?? 0);
      setNotes(today?.notes ?? '');
      setSavedNotes(today?.notes ?? '');
      setCorrectDraft(String(today?.minutes ?? 0));
    } catch (e) {
      console.error('[Sunlight] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleLog = async (mins: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await logSunExposure(mins);
    await load();
  };

  const commitCorrection = async () => {
    const parsed = parseInt(correctDraft.replace(/[^0-9]/g, ''), 10);
    setCorrecting(false);
    if (!Number.isFinite(parsed)) { setCorrectDraft(String(minutes)); return; }
    const next = Math.max(0, Math.min(MAX_MIN, parsed));
    // `notes` is deliberately omitted: `correctSunLog` keeps the existing note
    // when it is undefined, and correcting the minutes must not silently wipe
    // the note explaining the day.
    await correctSunLog(next);
    await load();
  };

  const commitNotes = async () => {
    if (notes === savedNotes) return;
    // Passing the note explicitly IS the erase path when it is empty — that is
    // the documented difference between `undefined` and `''` in correctSunLog.
    await correctSunLog(minutes, undefined, notes);
    setSavedNotes(notes);
  };

  const handleClear = () => {
    if (minutes === 0 && savedNotes === '') return;
    Alert.alert(
      'Clear today’s sun?',
      'This removes the whole day, minutes and note together. There is one row per day, so there is nothing smaller to remove.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearSunLog();
            await load();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#F2B233" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <SunTracker sunMinutes={minutes} onLog={handleLog} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Correct today&apos;s total</Text>
        <Text style={styles.sectionBody}>
          Logging adds to the day. This sets it outright — use it when the minutes on the
          card are wrong, not when you were outside again.
        </Text>
        <View style={styles.correctRow}>
          {correcting ? (
            <TextInput
              style={styles.correctField}
              value={correctDraft}
              onChangeText={setCorrectDraft}
              onBlur={commitCorrection}
              onSubmitEditing={commitCorrection}
              keyboardType="number-pad"
              autoFocus
              accessibilityLabel="Set today's sun minutes"
            />
          ) : (
            <TouchableOpacity
              style={styles.correctValue}
              onPress={() => setCorrecting(true)}
              accessibilityRole="button"
              accessibilityLabel={`Today is ${minutes} minutes. Tap to set it to something else.`}
            >
              <Text style={styles.correctValueText}>{minutes} min</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.clearBtn}
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Clear today's sun log"
          >
            <Text style={styles.clearBtnText}>Clear day</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Note</Text>
        <TextInput
          style={styles.noteField}
          value={notes}
          onChangeText={setNotes}
          onBlur={commitNotes}
          placeholder="Where, what the weather was, anything worth remembering"
          placeholderTextColor="#9AA3B2"
          multiline
          accessibilityLabel="Note about today's sun exposure"
        />
      </View>

      <View style={styles.stub}>
        <Text style={styles.stubTitle}>Last 7 days — not built</Text>
        <Text style={styles.stubBody}>
          Sun is stored one row per day and the only reader,
          <Text style={styles.mono}> getTodaySunLog</Text>, is hardcoded to today — so no
          past day can be read yet. The query belongs in the data layer, which another
          build owns this round. Filed as handoff H13.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F2' },
  content: { padding: 20, paddingBottom: 40 },
  loading: { flex: 1, backgroundColor: '#F7F7F2', alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 22 },
  sectionTitle: { color: '#14213D', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  sectionBody: { color: '#5A6478', fontSize: 13, lineHeight: 19, marginBottom: 10 },

  correctRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  correctValue: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', alignItems: 'center', justifyContent: 'center' },
  correctValueText: { color: '#14213D', fontSize: 17, fontWeight: '700' },
  correctField: { flex: 1, height: 46, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F2B233', textAlign: 'center', color: '#14213D', fontSize: 17, fontWeight: '700' },
  clearBtn: { paddingHorizontal: 16, height: 46, borderRadius: 12, backgroundColor: '#FBEAEA', borderWidth: 1, borderColor: '#E7C6C6', alignItems: 'center', justifyContent: 'center' },
  clearBtnText: { color: '#B3453E', fontSize: 13, fontWeight: '700' },

  noteField: { minHeight: 84, borderRadius: 12, backgroundColor: '#ECEDE6', borderWidth: 1, borderColor: '#CFD2C6', padding: 12, color: '#14213D', fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },

  stub: { marginTop: 26, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CFD2C6', backgroundColor: '#F2F2EC', padding: 16 },
  stubTitle: { color: '#5A6478', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  stubBody: { color: '#9AA3B2', fontSize: 12, lineHeight: 18 },
  mono: { fontFamily: 'monospace', color: '#5A6478' },
});
