import React, { useMemo, useState } from 'react';
import { AuditLog, User } from '../../types';

interface DirectorActivityLogViewProps {
  auditLogs: AuditLog[];
  users: User[];
}

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value || '-'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export const DirectorActivityLogView: React.FC<DirectorActivityLogViewProps> = ({ auditLogs, users }) => {
  const [search, setSearch] = useState('');
  const [branch, setBranch] = useState('ALL');
  const userById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const branches = useMemo(() => [...new Set(users.map((user) => user.branch).filter(Boolean))].sort(), [users]);
  const filteredLogs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...auditLogs]
      .filter((log) => {
        const actor = log.actorId ? userById.get(log.actorId) : undefined;
        const actorBranch = actor?.branch || '';
        const searchable = `${log.actorName} ${log.role || ''} ${log.action} ${log.entity} ${log.entityId || ''} ${log.description} ${actorBranch}`.toLocaleLowerCase();
        return (branch === 'ALL' || actorBranch === branch) && (!query || searchable.includes(query));
      })
      .sort((first, second) => second.timestamp.localeCompare(first.timestamp));
  }, [auditLogs, branch, search, userById]);

  return (
    <div className="space-y-4">
      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-700">Direktur · Audit Trail</div>
        <h1 className="mt-1 text-xl font-black text-slate-900">Log Aktivitas Seluruh User & Branch</h1>
        <p className="mt-1 text-xs text-slate-500">Aktivitas terbaru yang tersimpan dari seluruh user dan branch. Tampilan hanya baca.</p>
      </header>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-48 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Branch pengguna
            <select value={branch} onChange={(event) => setBranch(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700">
              <option value="ALL">Semua branch</option>
              {branches.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="grid min-w-56 flex-1 gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Cari aktivitas
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="User, aksi, entitas, atau keterangan..." className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs text-slate-700" />
          </label>
          <span className="pb-2 text-xs font-semibold text-slate-500">{filteredLogs.length} aktivitas</span>
        </div>

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr><th className="px-3 py-2">Waktu</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Aksi</th><th className="px-3 py-2">Entitas</th><th className="px-3 py-2">Keterangan</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.length ? filteredLogs.map((log) => {
                const actor = log.actorId ? userById.get(log.actorId) : undefined;
                return (
                  <tr key={log.id} className="align-top hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{formatTimestamp(log.timestamp)}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{log.actorName}</td>
                    <td className="px-3 py-2 text-slate-600">{log.role || actor?.role || '-'}</td>
                    <td className="px-3 py-2 text-slate-600">{actor?.branch || 'Tidak diketahui'}</td>
                    <td className="px-3 py-2 font-semibold text-slate-700">{log.action}</td>
                    <td className="px-3 py-2 text-slate-600">{log.entity}{log.entityId ? ` · ${log.entityId}` : ''}</td>
                    <td className="max-w-md px-3 py-2 text-slate-600">{log.description}</td>
                  </tr>
                );
              }) : <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-400">Tidak ada aktivitas untuk filter ini.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
