import { useState } from 'react';
import { C, themed, useTheme } from '../theme/colors';
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

/**
 * The VALUE is what goes in `dose_logs.skip_reason` and it stays English: rows
 * written before this screen spoke German are still in the table, and a reason
 * that changes with the phone's language is not a record. Only the label moves.
 */
const SKIP_REASONS: { value: string; key: string }[] = [
  { value: 'Forgot', key: 'doseSkipForgot' },
  { value: 'Felt unwell', key: 'doseSkipUnwell' },
  { value: 'No food available', key: 'doseSkipNoFood' },
  { value: 'Other', key: 'doseSkipOther' },
];

/** A stored reason, translated if it is one of ours and shown as-is if not. */
function skipReasonLabel(stored: string): string {
  const known = SKIP_REASONS.find((r) => r.value === stored);
  return known ? t(known.key) : stored;
}

/** Status words the app already owns, for the sentences that quote one. */
const STATUS_KEYS: Record<string, string> = {
  taken: 'taken', due: 'doseDue', upcoming: 'doseUpcoming', missed: 'missed', skipped: 'skipped',
};

function statusLabel(status: string): string {
  return STATUS_KEYS[status] ? t(STATUS_KEYS[status]) : status;
}

function getStatusAccentColor(status: ScheduledDose['status']): string {
  switch (status) {
    case 'taken': return C.successBright;
    case 'due': return C.orange;
    case 'upcoming': return C.blueBright;
    case 'missed': return C.danger;
    case 'skipped': return C.textFaint;
    default: return C.textMuted;
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
  useTheme(); // ...and when the theme tier changes
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
                  key={reason.value}
                  style={styles.skipReasonButton}
                  onPress={() => handleReasonSelect(reason.value)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('doseSkipReasonA11y', { reason: t(reason.key) })}
                >
                  <Text style={styles.skipReasonText}>{t(reason.key)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.cancelReasonButton}
                onPress={() => setShowSkipReasons(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('doseCancelSkip')}
              >
                <Text style={styles.cancelReasonText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </View>
          ) : canAct || canCorrect ? (
            <View>
              {canCorrect && !canAct ? (
                <Text style={styles.correctionHint}>
                  {t('doseRecordedAs', {
                    status: statusLabel(dose.status),
                    reason: dose.skipReason ? ` (${skipReasonLabel(dose.skipReason)})` : '',
                  })}
                </Text>
              ) : null}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.tookButton}
                  onPress={() => onTook(dose)}
                  accessibilityRole="button"
                  accessibilityLabel={t('doseMarkTakenA11y', { supplement: dose.supplementName })}
                >
                  <Text style={styles.tookButtonText}>{t('tookIt')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.skipButton}
                  onPress={handleSkipPress}
                  accessibilityRole="button"
                  accessibilityLabel={t('doseSkipA11y', { supplement: dose.supplementName })}
                >
                  <Text style={styles.skipButtonText}>{t('skip')}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.addReasonButton}
                onPress={() => setShowSkipReasons(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('doseAddReasonA11y', { supplement: dose.supplementName })}
              >
                <Text style={styles.addReasonText}>{t('doseAddReason')}</Text>
              </TouchableOpacity>
            </View>
          ) : isTaken ? (
            <View style={styles.takenBanner}>
              <Text style={styles.takenBannerText}>{t('doseLoggedBanner')}</Text>
            </View>
          ) : isMissed ? (
            <View style={styles.missedBanner}>
              <Text style={styles.missedBannerText}>{t('doseMissedBanner')}</Text>
            </View>
          ) : isSkipped ? (
            <View style={styles.skippedBanner}>
              <Text style={styles.skippedBannerText}>
                — {t('skipped')}{dose.skipReason ? `: ${skipReasonLabel(dose.skipReason)}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.statusText}>
              {t('doseStatusLine', { status: statusLabel(dose.status) })}
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed((C) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(44,36,32,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 0,
    overflow: 'hidden',
    shadowColor: C.text,
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
    backgroundColor: C.sunken,
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
    color: C.text,
    fontSize: 22,
    fontWeight: '700',
  },
  formBadge: {
    backgroundColor: C.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  formBadgeText: {
    color: C.textSub,
    fontSize: 12,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.borderSoft,
  },
  label: {
    color: C.textSub,
    fontSize: 14,
  },
  value: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  foodWarning: {
    backgroundColor: C.warningBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: C.warning,
  },
  foodWarningText: {
    color: C.warningInk,
    fontSize: 13,
    fontWeight: '600',
  },
  notesStyle: {
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  notesTextStyle: {
    color: C.textSub,
    fontSize: 13,
    lineHeight: 18,
  },
  skipReasonsContainer: {
    marginTop: 20,
  },
  skipReasonsTitle: {
    color: C.textSub,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  skipReasonButton: {
    backgroundColor: C.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  skipReasonText: {
    color: C.text,
    fontSize: 15,
    fontWeight: '600',
  },
  cancelReasonButton: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelReasonText: {
    color: C.textMuted,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  tookButton: {
    flex: 1,
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tookButtonText: {
    color: C.bg,
    fontSize: 16,
    fontWeight: '800',
  },
  skipButton: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  skipButtonText: {
    color: C.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  correctionHint: {
    color: C.textSub,
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
    color: C.textSub,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  skippedBanner: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  skippedBannerText: {
    color: C.textSub,
    fontSize: 15,
    fontWeight: '700',
  },
  takenBanner: {
    backgroundColor: C.successBg,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: C.success,
  },
  takenBannerText: {
    color: C.success,
    fontSize: 15,
    fontWeight: '700',
  },
  missedBanner: {
    backgroundColor: C.dangerBg,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
    borderWidth: 1,
    borderColor: C.danger,
  },
  missedBannerText: {
    color: C.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  statusText: {
    color: C.textSub,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
}));
