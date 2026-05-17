export type DoseStatus = 'upcoming' | 'due' | 'taken' | 'missed';
export type AnchorType = 't0' | 'meal' | 'fixed';

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
