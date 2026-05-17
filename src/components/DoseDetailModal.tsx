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
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 0,
    overflow: 'hidden',
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
    backgroundColor: '#444444',
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
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  formBadge: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  formBadgeText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '600',
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
  foodPairingContainer: {
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 14,
    marginTop: 12,
  },
  foodPairingTitle: {
    color: '#555555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  foodPairingGreen: {
    color: '#22c55e',
    fontSize: 13,
    marginBottom: 4,
  },
  foodPairingRed: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 4,
  },
  foodPairingTip: {
    color: '#888888',
    fontSize: 12,
    fontStyle: 'italic',
  },
  skipReasonsContainer: {
    marginTop: 20,
  },
  skipReasonsTitle: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  skipReasonButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  skipReasonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelReasonButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelReasonText: {
    color: '#555555',
    fontSize: 14,
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
  takenBanner: {
    backgroundColor: '#0d2a1a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  takenBannerText: {
    color: '#22c55e',
    fontSize: 15,
    fontWeight: '700',
  },
  missedBanner: {
    backgroundColor: '#2a0d0d',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  missedBannerText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
  },
  statusText: {
    color: '#888888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
