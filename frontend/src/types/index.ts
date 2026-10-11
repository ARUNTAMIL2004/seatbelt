export type UserRole = 'PRODUCTION' | 'QUALITY' | 'SUPERVISOR' | 'ADMIN';

export type RunType = 'MACHINE_RUN' | 'REWORK_RUN' | 'MANUAL_DATA_ENTRY';

export type RunResult = 'PASS' | 'FAIL' | 'REWORK' | 'PENDING';

export type MachineStatus = 
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DATA_MISSING'
  | 'REWORK_REQUIRED'
  | 'READY_FOR_RERUN'
  | 'QUALITY_PENDING'
  | 'QUALITY_APPROVED'
  | 'QUALITY_REJECTED'
  | 'BLOCKED';

export interface User {
  id: number;
  employee_id: string;
  name: string;
  role: UserRole;
  language: 'en' | 'ta';
  status: 'ACTIVE' | 'INACTIVE';
}

export interface ParameterDefinition {
  name: string;
  label: string;
  label_ta?: string;
  type: 'number' | 'string' | 'boolean';
  unit?: string;
  nominal?: number | string;
  min_value?: number;
  max_value?: number;
  std_dev?: number;
  required?: boolean;
}

export interface Machine {
  id: number;
  machine_code: string;
  machine_name: string;
  sequence_number: number;
  status: string;
  description?: string;
  parameters_schema?: ParameterDefinition[];
  adapter_type: 'SIMULATOR' | 'PLC_MODBUS' | 'REST_API' | 'SQL_DB' | 'CSV_WATCHER';
  adapter_config?: Record<string, unknown> | null;
  created_at: string;
}

export interface MachineRun {
  id: number;
  seatbelt_id: number;
  machine_id: number;
  run_number: number;
  operator_id: number;
  operator_name?: string;
  operator_employee_id?: string;
  run_type: RunType;
  machine_data: Record<string, string | number | boolean | null>;
  result: RunResult;
  status: MachineStatus;
  is_current: boolean;
  reason?: string;
  data_source: string;
  started_at: string;
  completed_at: string;
  created_at: string;
}

export interface ReworkRecord {
  id: number;
  reason: string;
  notes?: string;
  rework_by_name: string;
  rework_by_emp_id: string;
  status: string;
  created_at: string;
}

export interface QAReview {
  id: number;
  decision: 'APPROVED' | 'REJECTED';
  comments: string;
  reviewer_name: string;
  reviewer_employee_id: string;
  reviewed_at: string;
}

export interface MachineProgressItem {
  machine_id: number;
  machine_code: string;
  machine_name: string;
  sequence_number: number;
  status: MachineStatus;
  is_current_machine: boolean;
  is_unlocked: boolean;
  current_run?: MachineRun | null;
  awaiting_qa: boolean;
  qa_reviews: QAReview[];
  run_count: number;
  history: MachineRun[];
  rework_history: ReworkRecord[];
}

export interface SeatbeltDetailed {
  id: number;
  qr_code: string;
  seatbelt_number: string;
  model: string;
  batch_number: string;
  current_machine_id: number | null;
  current_machine_code: string | null;
  current_machine_name: string | null;
  current_status: MachineStatus;
  created_at: string;
  updated_at: string;
  machines_progress: MachineProgressItem[];
  total_runs: number;
  rework_count: number;
  missing_data_count: number;
  quality_pending_count: number;
}

export interface DashboardKPISummary {
  total_production: number;
  completed: number;
  in_progress: number;
  rework_required: number;
  data_missing: number;
  quality_pending: number;
  rejected: number;
  first_pass_yield: number | null;
  active_operators_count: number;
}

export interface MachineThroughputItem {
  machine_id: number;
  machine_code: string;
  machine_name: string;
  sequence_number: number;
  total_processed: number;
  pass_count: number;
  rework_count: number;
  missing_data_count: number;
  current_in_queue: number;
  avg_cycle_time_sec: number | null;
}

export interface ReworkReasonPareto {
  reason: string;
  count: number;
  percentage: number;
}

export interface MissingDataByMachine {
  machine_code: string;
  machine_name: string;
  count: number;
}

export interface RecentFloorActivity {
  id: number;
  timestamp: string;
  seatbelt_qr: string;
  machine_code: string;
  action: string;
  user_name: string;
  user_role: string;
  run_type?: string;
  result?: string;
  status: string;
}

export interface DashboardData {
  kpi_summary: DashboardKPISummary;
  machine_throughput: MachineThroughputItem[];
  rework_pareto: ReworkReasonPareto[];
  missing_data_stats: MissingDataByMachine[];
  recent_activities: RecentFloorActivity[];
}

export interface AuditLogItem {
  id: number;
  user_id?: number;
  user_name?: string;
  user_employee_id?: string;
  user_role?: string;
  seatbelt_id?: number;
  seatbelt_qr?: string;
  machine_id?: number;
  machine_code?: string;
  action: string;
  old_status?: string;
  new_status?: string;
  old_data?: unknown;
  new_data?: unknown;
  reason?: string;
  ip_address?: string;
  created_at: string;
}

export interface SeatbeltSummary {
  id: number;
  qr_code: string;
  seatbelt_number: string;
  model: string;
  batch_number: string;
  current_machine_id: number | null;
  current_machine_code: string | null;
  current_status: MachineStatus;
  total_runs: number;
  rework_count: number;
  created_at: string;
  updated_at: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Operator {
  id: number;
  employee_id: string;
  name: string;
  role: UserRole;
}

export interface UserRecord extends User {
  created_at: string;
}

export interface PendingReview {
  run_id: number;
  seatbelt_id: number;
  seatbelt_qr: string;
  seatbelt_model: string;
  machine_id: number;
  machine_code: string;
  machine_name: string;
  run_number: number;
  run_type: RunType;
  operator_id: number;
  operator_name: string;
  machine_data: Record<string, string | number | boolean | null>;
  result: RunResult;
  reason?: string | null;
  created_at: string;
}

export interface Certificate {
  qr_code: string;
  model: string;
  batch_number: string;
  created_at: string;
  current_status: MachineStatus;
  certified: boolean;
  blockers: string[];
  stations: {
    machine_code: string;
    machine_name: string;
    status: MachineStatus;
    run_number: number | null;
    run_type: RunType | null;
    result: RunResult | null;
    operator: string | null;
    completed_at: string | null;
    machine_data: Record<string, string | number | boolean | null> | null;
    reworks: number;
  }[];
  qa_signoffs: { name: string; employee_id: string; reviewed_at: string }[];
  rework_count: number;
  genealogy_sha256: string;
  generated_at: string;
}

export interface RunResponse {
  success: boolean;
  message: string;
  run_id: number;
  run_number: number;
  result: RunResult;
  machine_status: MachineStatus;
  unlocked_next_machine_code: string | null;
}

export interface AdapterTestResult {
  machine_id: number;
  machine_code: string;
  machine_name: string;
  adapter_type: string;
  test_result: { connected: boolean; status?: string; message?: string; protocol?: string; simulated?: boolean; latency_ms?: number; endpoint?: string };
}
