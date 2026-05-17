import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScheduledDose } from '../types';

interface Props {
  visible: boolean;
  dose: ScheduledDose | null;
  onClose: () => void;
  onTook: (dose: ScheduledDose) => void;
  onSkip: (dose: ScheduledDose) => void;
}

export default function DoseDetailModal({
  visible,
  dose,
  onClose,
  onTook,
  onSkip,
}: Props) {
  if (!dose) return null;

  const timeStr = dose.scheduledTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const earliestStr = dose.earliestTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  const latestStr = dose.latestTime.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <Text style={styles.name}>{dose.supplementName}</Text>
          <Text style={styles.form}>{dose.form}</Text>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Dose</Text>
            <Text style={styles.value}>{dose.doseAmount}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Scheduled</Text>
            <Text style={styles.value}>{timeStr}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Window</Text>
            <Text style={styles.value}>
              {earliestStr} - {latestStr}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Tolerance</Text>
            <Text style={styles.value}>{dose.toleranceMinutes} min</Text>
          </View>

          {dose.withFood && (
            <View style={styles.foodWarning}>
              <Text style={styles.foodWarningText}>
                Take with food
              </Text>
            </View>
          )}

          {dose.notes ? (
            <View style={styles.notesStyle}>
              <Text style={styles.notesTextStyle}>{dose.notes}</Text>
            </View>
          ) : null}

          {dose.logId != null && dose.status === 'upcoming' || dose.status === 'due' ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.tookButton}
                onPress={() => onTook(dose)}
              >
                <Text style={styles.tookButtonText}>Took it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => onSkip(dose)}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.statusText}>
              Status: {dose.status}
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#444444',
    alignSelf: 'center',
    marginBottom: 20,
  },
  name: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  form: {
    color: '#888888',
    fontSize: 14,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  label: {
    color: '#888888',
    fontSize: 14,
  },
  value: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  foodWarning: {
    backgroundColor: '#2a1f00',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  foodWarningText: {
    color: '#eab308',
    fontSize: 13,
    fontWeight: '600',
  },
  notesStyle: {
    backgroundColor: '#111111',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  notesTextStyle: {
    color: '#888888',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  tookButton: {
    flex: 1,
    backgroundColor: '#22c55e',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tookButtonText: {
    color: '#0d0d0d',
    fontSize: 16,
    fontWeight: '800',
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '700',
  },
  statusText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
