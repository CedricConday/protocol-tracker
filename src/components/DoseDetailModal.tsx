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
import { t, useLanguage, locale } from '../i18n';

interface Props {
  visible: boolean;
  dose: ScheduledDose | null;
  onClose: () => void;
  onTook: (dose: ScheduledDose) => void;
  onSkip: (dose: ScheduledDose, reason?: string) => void;
  /** Offer the actions whatever the dose's status is — the calendar opens this
   *  sheet against a day that is already over, where the point is to correct
   *  what was recorded rather than to act on a dose that is still live. */
  correctable?: boolean;
}

const SKIP_REASONS = ['Forgot', 'Felt unwell', 'No food available', 'Other'];

function getStatusAccentColor(status: ScheduledDose['status']): string {
  switch (status) {
    case 'taken': return '#22c55e';
    case 'due': return '#f97316';
    case 'upcoming': return '#3b82f6';
    case 'missed': return '#ef4444';
    case 'skipped': return '#94a3b8';
    default: return '#555555';
  }
}

export default function DoseDetailModal({
  visible,
  dose,
  onClose,
  onTook,
  onSkip,
  correctable = false,
}: Props) {
  useLanguage(); // re-render this screen when the language changes
  const [showSkipReasons, setShowSkipReasons] = useState(false);

  if (!dose) return null;

  const timeStr = dose.scheduledTime.toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const earliestStr = dose.earliestTime.toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
  });
  const latestStr = dose.latestTime.toLocaleTimeString(locale(), {
    hour: '2-digit',
    minute: '2-digit',
  });

  const accentColor = getStatusAccentColor(dose.status);
  const isTaken = dose.status === 'taken';
  const isMissed = dose.status === 'missed';
  const isSkipped = dose.status === 'skipped';
  // Every actionable path needs a real dose_logs row id. Without it onTook and
  // onSkip are no-ops, so offering the buttons is worse than hiding them.
  const canAct = dose.logId != null && (dose.status === 'upcoming' || dose.status === 'due');
  // Correcting needs the same row id and nothing else: confirmDose/skipDose have
  // never had a date guard, so the data layer was always willing — the id simply
  // never reached this sheet from a past day (round 3, A4).
  const canCorrect = correctable && dose.logId != null;

  // One tap skips: the write happens here, with no reason, and the parent
  // closes the sheet. The reason picker is an optional second step behind
  // "Add a reason" and never gates the write — Cedric's call, 2026-09-13
  // (PT-trio round 3, A1). It was the gate that made the audit read "Skip
  // does not persist".
  const handleSkipPress = () => {
    onSkip(dose);
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
            <Text style={styles.label}>{t('dose')}</Text>
            <Text style={styles.value}>{dose.doseAmount}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>{t('scheduled')}</Text>
            <Text style={styles.value}>{timeStr}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>{t('window')}</Text>
            <Text style={styles.value}>
              {earliestStr} - {latestStr}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>{t('tolerance')}</Text>
            <Text style={styles.value}>{dose.toleranceMinutes} min</Text>
          </View>

          {dose.withFood && (
            <View style={styles.foodWarning}>
              <Text style={styles.foodWarningText}>{t('takeWithFood')}</Text>
            </View>
          )}

          {dose.notes ? (
            <View style={styles.notesStyle}>
              <Text style={styles.notesTextStyle}>{dose.notes}</Text>
            </View>
          ) : null}

          {/* Pure-tracker build: the food-pairing guidance (take with / avoid)
              was advice, not tracking. Removed 2026-09-10. */}

          {showSkipReasons ? (
            <View style={styles.skipReasonsContainer}>
              <Text style={styles.skipReasonsTitle}>{t('whySkipping')}</Text>
              {SKIP_REASONS.map((reason) => (
                <TouchableOpacity
                  key={reason}
                  style={styles.skipReasonButton}
                  onPress={() => handleReasonSelect(reason)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Skip this dose: ${reason}`}
                >
                  <Text style={styles.skipReasonText}>{reason}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.cancelReasonButton}
                onPress={() => setShowSkipReasons(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel skipping this dose"
              >
                <Text style={styles.cancelReasonText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          ) : canAct || canCorrect ? (
            <View>
              {canCorrect && !canAct ? (
                <Text style={styles.correctionHint}>
                  Recorded as {dose.status}{dose.skipReason ? ` (${dose.skipReason})` : ''}. Tap what actually happened.
                </Text>
              ) : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.tookButton}
                  onPress={() => onTook(dose)}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${dose.supplementName} as taken`}
                >
                  <Text style={styles.tookButtonText}>✓ Took it</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkipPress}
                  accessibilityRole="button"
                  accessibilityLabel={`Skip ${dose.supplementName}`}
                >
                  <Text style={styles.skipButtonText}>{t('skip')}</Text>
                </TouchableOpacity>
              </View>
              {/* Literal, not t() — i18n/ is nobody's lane this round, and the
                  strings around it ("✓ Took it") are already literal. */}
              <TouchableOpacity
                style={styles.addReasonButton}
                onPress={() => setShowSkipReasons(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Add a reason for skipping ${dose.supplementName}`}
              >
                <Text style={styles.addReasonText}>Add a reason</Text>
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
          ) : isSkipped ? (
            <View style={styles.skippedBanner}>
              <Text style={styles.skippedBannerText}>
                — {t('skipped')}{dose.skipReason ? `: ${dose.skipReason}` : ''}
              </Text>
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
    backgroundColor: '#F7F7F2',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 0,
    overflow: 'hidden',
    shadowColor: '#14213D',
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
    backgroundColor: '#CFD2C6',
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
    color: '#14213D',
    fontSize: 22,
    fontWeight: '700',
  },
  formBadge: {
    backgroundColor: '#ECEDE6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  formBadgeText: {
    color: '#5A6478',
    fontSize: 12,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#DBDDD3',
  },
  label: {
    color: '#5A6478',
    fontSize: 14,
  },
  value: {
    color: '#14213D',
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
    borderColor: '#F2B233',
  },
  foodWarningText: {
    color: '#8A5A10',
    fontSize: 13,
    fontWeight: '600',
  },
  notesStyle: {
    backgroundColor: '#ECEDE6',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  notesTextStyle: {
    color: '#5A6478',
    fontSize: 13,
    lineHeight: 18,
  },
  skipReasonsContainer: {
    marginTop: 20,
  },
  skipReasonsTitle: {
    color: '#5A6478',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  skipReasonButton: {
    backgroundColor: '#ECEDE6',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  skipReasonText: {
    color: '#14213D',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelReasonButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelReasonText: {
    color: '#9AA3B2',
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  tookButton: {
    flex: 1,
    backgroundColor: '#1B58B8',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tookButtonText: {
    color: '#F7F7F2',
    fontSize: 16,
    fontWeight: '800',
  },
  skipButton: {
    flex: 1,
    backgroundColor: '#ECEDE6',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  skipButtonText: {
    color: '#C0392B',
    fontSize: 16,
    fontWeight: '700',
  },
  correctionHint: {
    color: '#5A6478',
    fontSize: 13,
    marginTop: 20,
    marginBottom: -8,
    textAlign: 'center',
  },
  addReasonButton: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addReasonText: {
    color: '#5A6478',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  skippedBanner: {
    backgroundColor: '#ECEDE6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#CFD2C6',
  },
  skippedBannerText: {
    color: '#5A6478',
    fontSize: 15,
    fontWeight: '700',
  },
  takenBanner: {
    backgroundColor: '#F0F7F0',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#2F8F5B',
  },
  takenBannerText: {
    color: '#2F8F5B',
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
    borderColor: '#C0392B',
  },
  missedBannerText: {
    color: '#C0392B',
    fontSize: 15,
    fontWeight: '700',
  },
  statusText: {
    color: '#5A6478',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
});
