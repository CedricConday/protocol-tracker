import { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ScheduledDose } from '../types';
import { FOOD_PAIRINGS } from '../data/foodPairings';

interface Props {
  visible: boolean;
  dose: ScheduledDose | null;
  onClose: () => void;
  onTook: (dose: ScheduledDose) => void;
  onSkip: (dose: ScheduledDose, reason?: string) => void;
}

const SKIP_REASONS = ['Forgot', 'Felt unwell', 'No food available', 'Other'];

function getStatusAccentColor(status: ScheduledDose['status']): string {
  switch (status) {
    case 'taken': return '#22c55e';
    case 'due': return '#f97316';
    case 'upcoming': return '#3b82f6';
    case 'missed': return '#ef4444';
    default: return '#555555';
  }
}

export default function DoseDetailModal({
  visible,
  dose,
  onClose,
  onTook,
  onSkip,
}: Props) {
  const [showSkipReasons, setShowSkipReasons] = useState(false);

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

  const accentColor = getStatusAccentColor(dose.status);
  const isTaken = dose.status === 'taken';
  const isMissed = dose.status === 'missed';
  const canAct = (dose.logId != null && dose.status === 'upcoming') || dose.status === 'due';

  const handleSkipPress = () => {
    setShowSkipReasons(true);
  };

  const handleReasonSelect = (reason: string) => {
    setShowSkipReasons(false);
    onSkip(dose, reason);
  };

  const handleDismiss = () => {
    setShowSkipReasons(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={[styles.accentLine, { backgroundColor: accentColor }]} />

          <View style={styles.handle} />

          <View style={styles.nameRow}>
            <Text style={styles.name}>{dose.supplementName}</Text>
            <View style={styles.formBadge}>
              <Text style={styles.formBadgeText}>{dose.form}</Text>
            </View>
          </View>

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

          {(() => {
            const pairing = FOOD_PAIRINGS.find(p => p.supplement_id === dose.supplement_id);
            if (!pairing) return null;
            return (
              <View style={styles.foodPairingContainer}>
                <Text style={styles.foodPairingTitle}>Food Pairing</Text>
                <Text style={styles.foodPairingGreen}>✓ {pairing.pairs_with}</Text>
                <Text style={styles.foodPairingRed}>✗ {pairing.avoid}</Text>
                <Text style={styles.foodPairingTip}>{pairing.tip}</Text>
              </View>
            );
          })()}

          {showSkipReasons ? (
            <View style={styles.skipReasonsContainer}>
              <Text style={styles.skipReasonsTitle}>Why are you skipping?</Text>
              {SKIP_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={styles.skipReasonButton}
                  onPress={() => handleReasonSelect(reason)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.skipReasonText}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.cancelReasonButton}
                onPress={() => setShowSkipReasons(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelReasonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : canAct ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.tookButton}
                onPress={() => onTook(dose)}
              >
                <Text style={styles.tookButtonText}>✓ Took it</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.skipButton}
                onPress={handleSkipPress}
              >
                <Text style={styles.skipButtonText}>Skip</Text>
              </TouchableOpacity>
            </View>
          ) : isTaken ? (
            <View style={styles.takenBanner}>
              <Text style={styles.takenBannerText}>✓ Dose logged</Text>
            </View>
          ) : isMissed ? (
            <View style={styles.missedBanner}>
              <Text style={styles.missedBannerText}>✕ Marked as missed</Text>
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
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FAF7F4',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 0,
    overflow: 'hidden',
    shadowColor: '#2C2420',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 8,
  },
  accentLine: {
    height: 2,
    width: '100%',
    marginBottom: 0,
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D8CFC8',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  name: {
    color: '#2C2420',
    fontSize: 22,
    fontWeight: '700',
  },
  formBadge: {
    backgroundColor: '#F2EDE8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  formBadgeText: {
    color: '#7A6A62',
    fontSize: 12,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E0D8',
  },
  label: {
    color: '#7A6A62',
    fontSize: 14,
  },
  value: {
    color: '#2C2420',
    fontSize: 14,
    fontWeight: '600',
  },
  foodWarning: {
    backgroundColor: '#FFF8EC',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#C4882A',
  },
  foodWarningText: {
    color: '#8A5A10',
    fontSize: 13,
    fontWeight: '600',
  },
  notesStyle: {
    backgroundColor: '#F2EDE8',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  notesTextStyle: {
    color: '#7A6A62',
    fontSize: 13,
    lineHeight: 18,
  },
  foodPairingContainer: {
    backgroundColor: '#F2EDE8',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  foodPairingTitle: {
    color: '#7A6A62',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  foodPairingGreen: {
    color: '#5A8A5A',
    fontSize: 13,
    marginBottom: 4,
  },
  foodPairingRed: {
    color: '#C04040',
    fontSize: 13,
    marginBottom: 4,
  },
  foodPairingTip: {
    color: '#B0A098',
    fontSize: 12,
    fontStyle: 'italic',
  },
  skipReasonsContainer: {
    marginTop: 20,
  },
  skipReasonsTitle: {
    color: '#7A6A62',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  skipReasonButton: {
    backgroundColor: '#F2EDE8',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  skipReasonText: {
    color: '#2C2420',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelReasonButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelReasonText: {
    color: '#B0A098',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  tookButton: {
    flex: 1,
    backgroundColor: '#C96A50',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tookButtonText: {
    color: '#FAF7F4',
    fontSize: 16,
    fontWeight: '800',
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#F2EDE8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D8CFC8',
  },
  skipButtonText: {
    color: '#C04040',
    fontSize: 16,
    fontWeight: '700',
  },
  takenBanner: {
    backgroundColor: '#F0F7F0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#5A8A5A',
  },
  takenBannerText: {
    color: '#5A8A5A',
    fontSize: 15,
    fontWeight: '700',
  },
  missedBanner: {
    backgroundColor: '#FDF0F0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#C04040',
  },
  missedBannerText: {
    color: '#C04040',
    fontSize: 15,
    fontWeight: '700',
  },
  statusText: {
    color: '#7A6A62',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
