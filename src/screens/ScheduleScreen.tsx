import { useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DoseDetailModal from '../components/DoseDetailModal';
import DoseRow from '../components/DoseRow';
import { ScheduledDose } from '../types';

const mkDose = (
  id: number,
  name: string,
  amount: string,
  offsetMs: number,
  status: ScheduledDose['status'],
): ScheduledDose => {
  const t = new Date(Date.now() + offsetMs);
  return {
    id,
    supplement_id: id.toString(),
    supplementName: name,
    form: 'capsule',
    scheduledTime: t,
    earliestTime: new Date(t.getTime() - 30 * 60000),
    latestTime: new Date(t.getTime() + 30 * 60000),
    status,
    toleranceMinutes: 30,
    doseAmount: amount,
    withFood: true,
    logId: status === 'upcoming' || status === 'due' ? id : undefined,
  };
};

const placeholderDoses: ScheduledDose[] = [
  mkDose(1, 'Vitamin D3', '5000 IU', 0, 'due'),
  mkDose(2, 'Omega-3', '2000 mg', 3600000, 'upcoming'),
  mkDose(3, 'Magnesium Glycinate', '400 mg', 7200000, 'upcoming'),
  mkDose(4, 'Zinc Picolinate', '50 mg', -3600000, 'missed'),
  mkDose(5, 'CoQ10', '200 mg', -7200000, 'taken'),
];

export default function ScheduleScreen() {
  const [doses, setDoses] = useState<ScheduledDose[]>(placeholderDoses);
  const [selectedDose, setSelectedDose] = useState<ScheduledDose | null>(null);

  const updateDoseStatus = (
    doseId: number,
    newStatus: ScheduledDose['status'],
  ) => {
    setDoses((prev) =>
      prev.map((d) =>
        d.id === doseId ? { ...d, status: newStatus } : d,
      ),
    );
    setSelectedDose(null);
  };

  const renderItem = ({ item }: { item: ScheduledDose }) => {
    return (
      <DoseRow dose={item} onPress={setSelectedDose} />
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Today's Schedule</Text>
      <FlatList
        data={doses}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <DoseDetailModal
        visible={selectedDose !== null}
        dose={selectedDose}
        onClose={() => setSelectedDose(null)}
        onTook={(dose) => updateDoseStatus(dose.id, 'taken')}
        onSkip={(dose) => updateDoseStatus(dose.id, 'missed')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  heading: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },
  list: {
    paddingBottom: 20,
  },
});
