import type {
  SeatbeltDetailed, Machine, DashboardData, AuditLogItem, User, Operator, UserRecord, Paged, SeatbeltSummary,
  PendingReview, Certificate, RunResponse, AdapterTestResult, ParameterDefinition,
} from '../types';

/**
 * API base URL.
 * - Default `/api/v1` = same origin (Vercel project with frontend + serverless API, or the Vite dev proxy).
 * - Set VITE_API_BASE_URL (e.g. https://my-api.example.com/api/v1) only if the API lives on another origin.
 */
export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/+$/, '');

const TOKEN_KEY = 'seatbelt.token';
const REQUEST_TIMEOUT_MS = 20000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type FastApiDetail = string | { msg?: string; loc?: (string | number)[] }[] | undefined;

export function formatDetail(detail: FastApiDetail, fallback: string): string {
  if (!detail) return fallback;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = d.loc ? d.loc.filter((p) => p !== 'body' && p !== 'query').join('.') : '';
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .filter(Boolean)
      .join('; ') || fallback;
  }
  return fallback;
}

type UnauthorizedListener = () => void;
let onUnauthorized: UnauthorizedListener | null = null;

export class ApiService {
  private static token: string | null = (() => {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  })();

  static hasToken(): boolean {
    return !!this.token;
  }

  static setUnauthorizedHandler(fn: UnauthorizedListener | null) {
    onUnauthorized = fn;
  }

  static setToken(token: string) {
    this.token = token;
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable */ }
  }

  static clearToken() {
    this.token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  }

  private static async send(endpoint: string, options: RequestInit = {}, auth = true): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json', ...(options.headers as Record<string, string>) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    if (auth && this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers, signal: options.signal ?? controller.signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        if (options.signal?.aborted) throw err; // caller cancelled intentionally
        throw new ApiError('The server took too long to respond. Please try again.', 0);
      }
      throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail: FastApiDetail;
      try { detail = (await response.json()).detail; } catch { /* non-JSON error body */ }
      if (response.status === 401 && auth && endpoint !== '/auth/login') {
        this.clearToken();
        onUnauthorized?.();
      }
      throw new ApiError(formatDetail(detail, `Request failed (HTTP ${response.status})`), response.status);
    }
    return response;
  }

  private static async request<T>(endpoint: string, options: RequestInit = {}, auth = true): Promise<T> {
    const res = await this.send(endpoint, options, auth);
    return (await res.json()) as T;
  }

  private static json(body: unknown): RequestInit {
    return { method: 'POST', body: JSON.stringify(body) };
  }

  // --- Auth -------------------------------------------------------------
  static async login(employee_id: string, password: string): Promise<User> {
    const data = await this.request<{ access_token: string; user: User }>('/auth/login', this.json({ employee_id, password }), false);
    this.setToken(data.access_token);
    return data.user;
  }

  static logout() {
    this.clearToken();
  }

  static getMe() { return this.request<User>('/auth/me'); }
  static getOperators() { return this.request<Operator[]>('/auth/operators'); }
  static changePassword(current_password: string, new_password: string) {
    return this.request<{ success: boolean }>('/auth/change-password', this.json({ current_password, new_password }));
  }

  // --- QR & seatbelts -----------------------------------------------------
  static scanQR(qr_code: string, signal?: AbortSignal) {
    return this.request<SeatbeltDetailed>('/qr/scan', { ...this.json({ qr_code }), signal });
  }
  static generateQR(model: string, batch = 'BATCH-2026-OCT') {
    return this.request<SeatbeltDetailed>(
      `/qr/generate?model=${encodeURIComponent(model)}&batch_number=${encodeURIComponent(batch)}`, { method: 'POST' });
  }
  static searchSeatbelts(params: { q?: string; status?: string; machine_id?: number; limit?: number; offset?: number }, signal?: AbortSignal) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v)); });
    return this.request<Paged<SeatbeltSummary>>(`/seatbelt/search?${qs.toString()}`, { signal });
  }
  static getCertificate(id: number) { return this.request<Certificate>(`/seatbelt/${id}/certificate`); }
  static getSeatbeltAudit(id: number) { return this.request<AuditLogItem[]>(`/audit/${id}`); }

  // --- Machines / workflow ------------------------------------------------
  static getMachines() { return this.request<Machine[]>('/machine'); }
  static runStation(seatbelt_id: number, machine_id: number, simulateFailure = false) {
    return this.request<RunResponse>('/machine/run', this.json({ seatbelt_id, machine_id, result: simulateFailure ? 'FAIL' : undefined }));
  }
  static rerunStation(seatbelt_id: number, machine_id: number, simulateFailure = false) {
    return this.request<RunResponse>('/rework/rerun', this.json({ seatbelt_id, machine_id, result: simulateFailure ? 'FAIL' : undefined }));
  }
  static initiateRework(seatbelt_id: number, machine_id: number, reason: string, notes?: string) {
    return this.request<{ success: boolean; message: string }>('/rework', this.json({ seatbelt_id, machine_id, reason, notes: notes || undefined }));
  }
  static flagMissing(seatbelt_id: number, machine_id: number) {
    return this.request<{ success: boolean }>('/machine/flag-missing', this.json({ seatbelt_id, machine_id }));
  }
  static submitManualData(payload: {
    seatbelt_id: number; machine_id: number; operator_id?: number; run_at: string;
    machine_parameters: Record<string, string | number>; result: 'PASS' | 'FAIL'; reason: string; notes?: string;
  }) {
    return this.request<{ success: boolean; message: string }>('/machine/manual-data', this.json(payload));
  }
  static submitQualityReview(payload: { seatbelt_id: number; machine_id: number; run_id: number; decision: 'APPROVED' | 'REJECTED'; comments: string }) {
    return this.request<{ success: boolean; message: string }>('/quality/review', this.json(payload));
  }
  static getPendingReviews() { return this.request<PendingReview[]>('/quality/pending'); }

  // --- Dashboard / audit / reports -----------------------------------------
  static getDashboard(signal?: AbortSignal) { return this.request<DashboardData>('/dashboard/stats', { signal }); }
  static async getAuditLogs(limit = 200, offset = 0, action?: string) {
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (action) qs.set('action', action);
    return this.request<Paged<AuditLogItem>>(`/audit/logs?${qs.toString()}`);
  }

  /** Authenticated CSV download (a plain <a href> cannot send the Bearer token). */
  static async downloadReport(kind: 'production' | 'rework' | 'missing-data'): Promise<void> {
    const res = await this.send(`/reports/export-${kind}`);
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] || `seatbelt_${kind}_report.csv`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- Admin -----------------------------------------------------------------
  static getUsers() { return this.request<UserRecord[]>('/admin/users'); }
  static createUser(u: { employee_id: string; name: string; role: string; language: string; password: string }) {
    return this.request<UserRecord>('/admin/users', this.json(u));
  }
  static updateUser(id: number, patch: Partial<{ name: string; role: string; language: string; status: string; password: string }>) {
    return this.request<UserRecord>(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }
  static getAdapterTypes() { return this.request<string[]>('/admin/adapter-types'); }
  static testAdapter(machineId: number) { return this.request<AdapterTestResult>(`/machine/${machineId}/test-adapter`, { method: 'POST' }); }
  static updateMachineConfig(id: number, patch: { adapter_type?: string; adapter_config?: Record<string, unknown>; parameters_schema?: ParameterDefinition[] }) {
    return this.request<Machine>(`/admin/machines/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
  }
}
