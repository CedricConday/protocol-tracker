import { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { saveCalciumLog } from '../db/queries';

export default function CalciumLogScreen() {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [day1Mg, setDay1Mg] = useState(200);
  const [day1Notes, setDay1Notes] = useState('');
  const [day2Mg, setDay2Mg] = useState(200);
  const [day2Notes, setDay2Notes] = useState('');
  const [day3Mg, setDay3Mg] = useState(200);
  const [day3Notes, setDay3Notes] = useState('');

  const DAYS = [
    { label: 'Day 1', mg: day1Mg, setMg: setDay1Mg, notes: day1Notes, setNotes: setDay1Notes },
    { label: 'Day 2', mg: day2Mg, setMg: setDay2Mg, notes: day2Notes, setNotes: setDay2Notes },
    { label: 'Day 3', mg: day3Mg, setMg: setDay3Mg, notes: day3Notes, setNotes: setDay3Notes },
  ];

  const getCaColor = (mg: number) => {
    if (mg < 400) return '#22c55e';
    if (mg <= 600) return '#eab308';
    return '#ef4444';
  };

  const handleSubmit = async () => {
    for (let i = 0; i < 3; i++) {
      await saveCalciumLog({
        testStartDate: startDate,
        day: i + 1,
        calciumMg: [day1Mg, day2Mg, day3Mg][i],
        notes: [day1Notes, day2Notes, day3Notes][i],
      });
    }
    Alert.alert('Saved', 'Calcium reintroduction test logged.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.heading}>Calcium Reintroduction Test</Text>


        <Text style={styles.inputLabel}>Test start date</Text>
        <TextInput
          style={styles.dateInput}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#B0A098"
          value={startDate}
          onChangeText={setStartDate}
          autoCapitalize="none"
        />

        {DAYS.map((d, i) => (
          <View key={i} style={styles.dayCard}>
            <Text style={styles.dayLabel}>{d.label}</Text>
            <Text style={styles.sliderLabel}>
              Estimated calcium intake: <Text style={{ color: getCaColor(d.mg), fontWeight: '700' }}>{d.mg} mg</Text>
            </Text>
            <View style={styles.sliderRow}>
              {[0, 100, 200, 300, 400, 500, 600, 700, 800].map((val) => (
                <TouchableOpacity
                  key={val}
                  style={[
                    styles.sliderTick,
                    d.mg >= val && { backgroundColor: getCaColor(val) },
                  ]}
                  onPress={() => d.setMg(val)}
                  activeOpacity={0.7}
                />
              ))}
            </View>
            <View style={styles.sliderLabels}>
              <Text style={styles.sliderLabelText}>0</Text>
              <Text style={styles.sliderLabelText}>800mg</Text>
            </View>
            <TextInput
              style={styles.notesInput}
              placeholder="Symptom notes (optional)"
              placeholderTextColor="#B0A098"
              value={d.notes}
              onChangeText={d.setNotes}
              multiline
            />
          </View>
        ))}

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.8}>
          <Text style={styles.submitBtnText}>Submit Test Log</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F4' },
  content: { padding: 24, paddingTop: 60, paddingBottom: 40 },
  heading: { color: '#2C2420', fontSize: 24, fontWeight: '800', marginBottom: 16 },
  inputLabel: { color: '#7A6A62', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  dateInput: { backgroundColor: '#F2EDE8', borderRadius: 10, padding: 14, color: '#2C2420', fontSize: 16, marginBottom: 20 },
  dayCard: { backgroundColor: '#F2EDE8', borderRadius: 14, padding: 16, marginBottom: 12 },
  dayLabel: { color: '#2C2420', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sliderLabel: { color: '#7A6A62', fontSize: 13, marginBottom: 8 },
  sliderRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  sliderTick: { flex: 1, height: 8, borderRadius: 4, backgroundColor: '#D8CFC8' },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  sliderLabelText: { color: '#B0A098', fontSize: 11 },
  notesInput: { backgroundColor: '#FAF7F4', borderRadius: 10, padding: 12, color: '#2C2420', fontSize: 14, minHeight: 60, borderWidth: 1, borderColor: '#D8CFC8' },
  submitBtn: { backgroundColor: '#C96A50', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#FAF7F4', fontSize: 16, fontWeight: '800' },
});
