export type DoseStatus = 'upcoming' | 'due' | 'taken' | 'missed';
export type AnchorType = 't0' | 'meal' | 'fixed';
export type MedicalEventType = 'bloodwork' | 'mri' | 'appointment' | 'urine';

export interface MedicalEvent {
  id: number;
  type: MedicalEventType;
  title: string;
  scheduled_date: string;
  scheduled_time?: string;
  location?: string;
  notes?: string;
  reminder_7d: boolean;
  reminder_3d: boolean;
  reminder_1d: boolean;
  reminder_2h: boolean;
  completed: boolean;
  created_at: string;
}

export interface UserProfile {
  id: number;
  name: string;
  weight_kg: number;
  start_date: string;
  timezone: string;
  bedtime_hour: number;
  bedtime_minute: number;
}

export interface Supplement {
  id: string;
  name: string;
  form: string;
  category: string;
  notes: string;
}

export interface ScheduleRule {
  id: number;
  supplement_id: string;
  anchor_type: AnchorType;
  offset_minutes: number;
  tolerance_window: number;
  with_food: boolean;
  dose_amount: string;
  dose_unit: string;
  display_order: number;
}

export interface ScheduledDose {
  id: number;
  supplement_id: string;
  supplementName: string;
  form: string;
  scheduledTime: Date;
  earliestTime: Date;
  latestTime: Date;
  status: DoseStatus;
  toleranceMinutes: number;
  doseAmount: string;
  withFood: boolean;
  notes?: string;
  logId?: number;
  skipReason?: string;
}

export interface DailyAnchor {
  id: number;
  date: string;
  t0_timestamp: number | null;
  water_ml: number;
}

export interface DoseLog {
  id: number;
  date: string;
  supplement_id: string;
  scheduled_time: number;
  logged_time: number | null;
  status: DoseStatus;
  rule_id: number;
}

export interface DaySummary {
  totalDoses: number;
  takenDoses: number;
  missedDoses: number;
  compliancePct: number;
  waterMl: number;
  t0: Date | null;
}

export interface DayState {
  t0: Date | null;
  doses: ScheduledDose[];
  waterMl: number;
}

export interface JournalEntry {
  id: number;
  date: string;
  mood: string;
  note: string;
  compliance_pct: number;
  doses_taken: number;
  doses_total: number;
  created_at: string;
  updated_at: string;
}

export interface RelapseEvent {
  id: number;
  date: string;
  type: 'relapse' | 'cortisone' | 'symptom' | 'pain';
  cortisone_dose_mg: number | null;
  notes: string;
  severity: number | null;
  pain_type: string | null;
  lasted_24h: number | null;
  has_fever: number | null;
  created_at: string;
}
