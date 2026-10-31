'use client';
// app/(app)/admin/users/page.tsx - User Management & RBAC Permissions
import { useEffect, useState } from 'react';
import { CheckCircle2, X, Search, Users, Shield, AlertTriangle, Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { ROLES, PERMISSIONS_MATRIX } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'PROJECT_USER', password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const pageSize = 20;

  function load() {
    setLoading(true);
    fetch(`/api/admin/users?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`)
      .then(r => r.json())
      .then(d => { setUsers(d.data || []); setTotal(d.total || 0); setLoading(false); });
  }

  useEffect(() => { load(); }, [page, search]);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error); return; }
    setSuccess(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedSuccessfully, { "email": d.email }));
    setShowModal(false);
    setForm({ email: '', name: '', role: 'PROJECT_USER', password: '' });
    load();
  }

  async function toggleStatus(u: any) {
    const newStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!confirm(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.areYouSureYouWantToChangeStatusOfNameToNewStatus, { "name": u.name, "newStatus": newStatus }))) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setSuccess(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailIsNowNewStatus, { "email": u.email, "newStatus": newStatus }));
      load();
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full">
      <PageHeader
        title={UI_STRINGS.appAppAdminUsersPage.userManagementRoleGovernance}
        subtitle={interpolateUiString(UI_STRINGS.appAppAdminUsersPage.totalAuthorizedUsersInThisOrganizationTenant, { "total": total })}
        breadcrumbs={[
          { label: UI_STRINGS.common.administration, href: '/admin/users' },
          { label: UI_STRINGS.common.users },
        ]}
        actions={
          activeTab === 'users' ? (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => setShowModal(true)}
            >
              <Plus size={16} />{UI_STRINGS.appAppAdminUsersPage.inviteUser}</button>
          ) : undefined
        }
      />

      {success && (
        <div className="p-3.5 mb-6 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex justify-between items-center">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 size={16} className="text-emerald-600" /> {success}
          </span>
          <button type="button" className="text-slate-500 hover:text-slate-700" onClick={() => setSuccess('')}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-6 pb-px">
        <button
          type="button"
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'users'
              ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('users')}
        >{UI_STRINGS.appAppAdminUsersPage.tenantUsers}{total}{UI_STRINGS.common.copyc7zu6c}</button>
        <button
          type="button"
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'roles'
              ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('roles')}
        >{UI_STRINGS.appAppAdminUsersPage.rolePermissionMatrix}</button>
      </div>

      {activeTab === 'users' ? (
        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                className="input pl-9 h-[40px] w-full text-sm bg-white"
                placeholder={UI_STRINGS.appAppAdminUsersPage.searchByNameOrEmail}
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-overlay"><div className="spinner" />{UI_STRINGS.appAppAdminUsersPage.loadingUsers}</div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppAdminUsersPage.noUsersFound}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{UI_STRINGS.common.name}</th>
                    <th>{UI_STRINGS.common.email}</th>
                    <th>{UI_STRINGS.appAppAdminUsersPage.role}</th>
                    <th>{UI_STRINGS.common.status}</th>
                    <th>{UI_STRINGS.appAppAdminUsersPage.lastLogin}</th>
                    <th>{UI_STRINGS.appAppAdminUsersPage.created}</th>
                    <th className="col-actions">{UI_STRINGS.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 600 }}>{u.name}</td>
                      <td className="text-muted">{u.email}</td>
                      <td><span className="badge badge-info">{u.role.replace(/_/g, ' ')}</span></td>
                      <td>
                        <span className={`badge ${u.status === 'ACTIVE' ? 'badge-approved' : 'badge-draft'}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : UI_STRINGS.appAppAdminUsersPage.never}</td>
                      <td className="text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="col-actions">
                        <button
                          className={`btn btn-sm ${u.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === 'ACTIVE' ? UI_STRINGS.appAppAdminUsersPage.disable : UI_STRINGS.appAppAdminUsersPage.activate}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>{UI_STRINGS.common.copygps8ms}</button>
              <span className="page-info">{UI_STRINGS.common.page2}{page}{UI_STRINGS.common.of}{totalPages}</span>
              <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>{UI_STRINGS.common.copyhjr1pp}</button>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} />{UI_STRINGS.appAppAdminUsersPage.rBACPermissionMappingMatrix}</span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{UI_STRINGS.appAppAdminUsersPage.permissionToken}</th>
                  <th>{UI_STRINGS.appAppAdminUsersPage.functionalCapability}</th>
                  <th>{UI_STRINGS.appAppAdminUsersPage.authorizedRoles}</th>
                </tr>
              </thead>
              <tbody>
                {PERMISSIONS_MATRIX.map(pm => (
                  <tr key={pm.permission}>
                    <td className="font-mono font-bold" style={{ color: '#4338ca' }}>{pm.permission}</td>
                    <td>{pm.description}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {pm.roles.map(r => (
                          <span key={r} className="badge badge-draft" style={{ fontSize: 10 }}>{r}</span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">{UI_STRINGS.appAppAdminUsersPage.inviteNewUser}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={createUser}>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-error mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.appAppAdminUsersPage.fullName}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.appAppAdminUsersPage.emailAddress}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.appAppAdminUsersPage.role2}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <select className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.appAppAdminUsersPage.temporaryPassword}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <input type="password" className="form-control" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={UI_STRINGS.appAppAdminUsersPage.min8Characters} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>{UI_STRINGS.common.cancel}</button>
                <button type="submit" className="btn btn-primary">{UI_STRINGS.appAppAdminUsersPage.createUser}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
