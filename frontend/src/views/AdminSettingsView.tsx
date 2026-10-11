import React, { useCallback, useEffect, useState } from 'react';
import type { Machine, User, AuditLogItem, UserRecord, AdapterTestResult } from '../types';
import { translations, type Language } from '../services/i18n';
import { ApiService } from '../services/api';
import { errorMessage, formatDateTime } from '../services/format';
import { Notice, type NoticeKind } from '../components/Notice';
import { ConfigureMachineModal } from '../components/ConfigureMachineModal';
import { UserModal } from '../components/UserModal';
import { Settings, Cpu, Users, History, RefreshCw, Activity, Sliders, Loader2, UserPlus, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';

interface Props { currentUser: User; currentLang: Language }
type Tab = 'adapters' | 'users' | 'audit';
const AUDIT_PAGE = 25;

export const AdminSettingsView: React.FC<Props> = ({ currentUser, currentLang }) => {
  const t = translations[currentLang];
  const isAdmin = currentUser.role === 'ADMIN';
  const [tab, setTab] = useState<Tab>('adapters');
  const [flash, setFlash] = useState<{ kind: NoticeKind; message: string } | null>(null);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [adapterTypes, setAdapterTypes] = useState<string[]>([]);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<AdapterTestResult | null>(null);
  const [configuring, setConfiguring] = useState<Machine | null>(null);

  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userModal, setUserModal] = useState<{ open: boolean; user: UserRecord | null }>({ open: false, user: null });

  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(0);
  const [loading, setLoading] = useState(false);

  const fail = (err: unknown) => setFlash({ kind: 'error', message: errorMessage(err) });

  const loadMachines = useCallback(() => ApiService.getMachines().then(setMachines).catch(fail), []);
  const loadUsers = useCallback(() => (isAdmin ? ApiService.getUsers().then(setUsers).catch(fail) : Promise.resolve()), [isAdmin]);
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ApiService.getAuditLogs(AUDIT_PAGE, logPage * AUDIT_PAGE);
      setLogs(r.items); setLogTotal(r.total);
    } catch (err) { fail(err); } finally { setLoading(false); }
  }, [logPage]);

  useEffect(() => { void loadMachines(); void loadUsers(); if (isAdmin) ApiService.getAdapterTypes().then(setAdapterTypes).catch(() => setAdapterTypes(['SIMULATOR'])); }, [loadMachines, loadUsers, isAdmin]);
  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const testAdapter = async (m: Machine) => {
    setTesting(m.id); setTestResult(null);
    try { setTestResult(await ApiService.testAdapter(m.id)); } catch (err) { fail(err); } finally { setTesting(null); }
  };

  const toggleUser = async (u: UserRecord) => {
    try {
      await ApiService.updateUser(u.id, { status: u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' });
      setFlash({ kind: 'success', message: `${u.employee_id} is now ${u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'}.` });
      await loadUsers();
    } catch (err) { fail(err); }
  };

  const tabs: { id: Tab; label: string; Icon: typeof Cpu; show: boolean }[] = [
    { id: 'adapters', label: 'Machine Adapters (PLC)', Icon: Cpu, show: true },
    { id: 'users', label: 'Users & Roles', Icon: Users, show: isAdmin },
    { id: 'audit', label: 'Audit Trail', Icon: History, show: true },
  ];
  const pages = Math.max(1, Math.ceil(logTotal / AUDIT_PAGE));

  return (
    <div className="max-w-7xl mx-auto safe-x py-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[var(--border-subtle)]">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-extrabold flex items-center gap-2"><Settings className="w-6 h-6 text-emerald-400 shrink-0" aria-hidden="true" /><span>System Administration &amp; PLC Configuration</span></h2>
          <p className="text-xs text-[var(--text-dim)] font-mono">Machine adapters, parameter tolerances, user access and the immutable audit trail</p>
        </div>
      </div>

      {flash && <Notice kind={flash.kind} message={flash.message} onDismiss={() => setFlash(null)} />}

      <div role="tablist" className="flex gap-1 border-b border-[var(--border-subtle)] overflow-x-auto">
        {tabs.filter((x) => x.show).map(({ id, label, Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 border-b-2 whitespace-nowrap ${tab === id ? 'border-emerald-400 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
            <Icon className="w-4 h-4" aria-hidden="true" />{label}
          </button>
        ))}
      </div>

      {tab === 'adapters' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {machines.map((m) => (
              <div key={m.id} className="glass-panel p-4 flex flex-col gap-3 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><span className="font-mono font-black text-cyan-400">{m.machine_code}</span><div className="font-semibold text-sm break-words">{m.machine_name}</div></div>
                  <span className="badge badge-progress shrink-0">{m.adapter_type}</span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 break-all">{m.adapter_config && Object.keys(m.adapter_config).length ? JSON.stringify(m.adapter_config) : 'No adapter configuration'}</div>
                <div className="flex gap-2 mt-auto">
                  <button type="button" className="btn btn-secondary btn-sm flex-1" onClick={() => testAdapter(m)} disabled={testing === m.id}>
                    {testing === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Activity className="w-3.5 h-3.5" aria-hidden="true" />}{t.test_plc}
                  </button>
                  {isAdmin && <button type="button" className="btn btn-outline btn-sm flex-1" onClick={() => setConfiguring(m)}><Sliders className="w-3.5 h-3.5" aria-hidden="true" />Configure</button>}
                </div>
              </div>
            ))}
          </div>
          {testResult && (
            <div role="status" className={`glass-panel p-4 text-xs ${testResult.test_result.connected ? 'border-emerald-500/40' : 'border-red-500/40'}`}>
              <div className={`flex items-center gap-2 font-bold ${testResult.test_result.connected ? 'text-emerald-400' : 'text-red-400'}`}>
                {testResult.test_result.connected ? <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> : <XCircle className="w-4 h-4" aria-hidden="true" />}
                {testResult.machine_code} ({testResult.adapter_type}): {testResult.test_result.connected ? 'Connection OK' : 'Not connected'}
              </div>
              <pre className="mt-2 font-mono text-[11px] text-slate-300 whitespace-pre-wrap break-all">{JSON.stringify(testResult.test_result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && isAdmin && (
        <div className="glass-panel overflow-hidden">
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-mono text-slate-400">{users.length} users</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setUserModal({ open: true, user: null })}><UserPlus className="w-4 h-4" aria-hidden="true" />Add user</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px]"><tr><th className="p-3">Employee ID</th><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Lang</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono font-bold text-cyan-400">{u.employee_id}</td><td className="p-3">{u.name}</td><td className="p-3 font-mono">{u.role}</td><td className="p-3 font-mono">{u.language}</td>
                    <td className="p-3"><span className={`badge ${u.status === 'ACTIVE' ? 'badge-completed' : 'badge-blocked'}`}>{u.status}</span></td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button type="button" className="btn btn-outline btn-sm mr-2" onClick={() => setUserModal({ open: true, user: u })}>Edit</button>
                      <button type="button" className="btn btn-outline btn-sm" disabled={u.id === currentUser.id} onClick={() => toggleUser(u)}>{u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="glass-panel overflow-hidden" aria-busy={loading}>
          <div className="flex items-center justify-between p-3 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-mono text-slate-400">{logTotal} immutable records</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void loadLogs()}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead className="bg-slate-900/80 text-slate-400 font-mono uppercase text-[10px]"><tr><th className="p-3">Time</th><th className="p-3">User</th><th className="p-3">Action</th><th className="p-3">Seatbelt</th><th className="p-3">Stn</th><th className="p-3">Status change</th><th className="p-3">Reason</th><th className="p-3">IP</th></tr></thead>
              <tbody className="divide-y divide-[var(--border-subtle)] align-top">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-slate-400 whitespace-nowrap">{formatDateTime(l.created_at, currentLang)}</td>
                    <td className="p-3 whitespace-nowrap">{l.user_name} <span className="text-slate-500 font-mono">({l.user_employee_id})</span></td>
                    <td className="p-3 font-mono font-bold text-cyan-300 whitespace-nowrap">{l.action}</td>
                    <td className="p-3 font-mono">{l.seatbelt_qr ?? '—'}</td><td className="p-3 font-mono">{l.machine_code ?? '—'}</td>
                    <td className="p-3 font-mono whitespace-nowrap">{l.old_status ?? '—'} → {l.new_status ?? '—'}</td>
                    <td className="p-3 max-w-xs break-words text-slate-300">{l.reason ?? ''}</td><td className="p-3 font-mono text-slate-500">{l.ip_address ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.length === 0 && !loading && <p className="py-8 text-center text-xs text-slate-500 font-mono">{t.no_data}</p>}
          <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--border-subtle)] text-xs font-mono text-slate-400">
            <button type="button" className="btn btn-outline btn-sm" disabled={logPage === 0 || loading} onClick={() => setLogPage((p) => p - 1)}><ChevronLeft className="w-4 h-4" aria-hidden="true" />{t.previous}</button>
            <span>{logPage + 1} / {pages}</span>
            <button type="button" className="btn btn-outline btn-sm" disabled={logPage + 1 >= pages || loading} onClick={() => setLogPage((p) => p + 1)}>{t.next}<ChevronRight className="w-4 h-4" aria-hidden="true" /></button>
          </div>
        </div>
      )}

      {configuring && <ConfigureMachineModal isOpen onClose={() => setConfiguring(null)} machine={configuring} adapterTypes={adapterTypes.length ? adapterTypes : ['SIMULATOR']}
        onSaved={() => { setFlash({ kind: 'success', message: `${configuring.machine_code} configuration saved.` }); void loadMachines(); }} />}
      <UserModal isOpen={userModal.open} user={userModal.user} onClose={() => setUserModal({ open: false, user: null })}
        onSaved={() => { setFlash({ kind: 'success', message: 'User saved.' }); void loadUsers(); }} />
    </div>
  );
};
