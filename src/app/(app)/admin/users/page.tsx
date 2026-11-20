'use client';
// app/(app)/admin/users/page.tsx - User Management & RBAC Permissions
import { useEffect, useState } from 'react';
import { CheckCircle2, X, Search, Users, Shield, AlertTriangle, Plus, Building2, SlidersHorizontal } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import CreateCompanyModal from '@/components/admin/CreateCompanyModal';
import RoleLimitsModal from '@/components/admin/RoleLimitsModal';
import { ROLES, PERMISSIONS_MATRIX, EMPTY_INVITE_FORM } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { industryLabel } from "@/lib/company-profile";
import type { BusinessDirectory, BusinessSummary } from "@app-types/app/api/admin/users/route.types";
import type { RoleLimitUsage } from "@app-types/lib/business-directory.types";
import type { RoleLimitResponse } from "@app-types/components/admin/role-limits.types";
import type { InviteFormValues } from "@app-types/app/(app)/admin/users/page.types";



export default function UsersPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'companies' | 'roles'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<InviteFormValues>({ ...EMPTY_INVITE_FORM });
  const [directory, setDirectory] = useState<BusinessDirectory | null>(null);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [limitsBusiness, setLimitsBusiness] = useState<BusinessSummary | null>(null);
  const [loadedUsage, setLoadedUsage] = useState<{ businessId: string; roles: RoleLimitUsage[] | null } | null>(null);
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

  // Businesses this administrator may link users to: every business for a Super Admin,
  // only their own business for everyone else.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/businesses')
      .then(r => (r.ok ? r.json() : null))
      .then((d: BusinessDirectory | null) => { if (!cancelled) setDirectory(d); })
      .catch(() => { if (!cancelled) setDirectory(null); });
    return () => { cancelled = true; };
  }, []);

  const ownBusinessId = directory?.currentBusiness?.id || '';
  const ownBusinessName = directory?.currentBusiness?.name || '';
  const canChooseBusiness = directory?.canChooseBusiness === true;
  const selectedBusinessId = canChooseBusiness ? form.businessId : ownBusinessId;

  // Seat usage for the company chosen in the invite form, so full roles can be disabled.
  useEffect(() => {
    if (!showModal || !selectedBusinessId) return;
    let cancelled = false;
    fetch(`/api/admin/businesses/${encodeURIComponent(selectedBusinessId)}/role-limits`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: RoleLimitResponse | null) => { if (!cancelled) setLoadedUsage({ businessId: selectedBusinessId, roles: d?.roles ?? null }); })
      .catch(() => { if (!cancelled) setLoadedUsage({ businessId: selectedBusinessId, roles: null }); });
    return () => { cancelled = true; };
  }, [showModal, selectedBusinessId]);
  // Usage only applies to the company currently selected in an open invite form.
  const inviteUsage = showModal && loadedUsage?.businessId === selectedBusinessId ? loadedUsage.roles : null;

  const isRoleFull = (role: string) => {
    const usage = inviteUsage?.find(entry => entry.role === role);
    return !!usage && usage.maxUsers !== null && usage.activeUsers >= usage.maxUsers;
  };
  const selectedRoleUsage = inviteUsage?.find(entry => entry.role === form.role);

  function openInviteModal() {
    setError('');
    setForm({ ...EMPTY_INVITE_FORM, businessId: canChooseBusiness ? '' : ownBusinessId });
    setShowModal(true);
  }

  function companyCreated(business: BusinessSummary) {
    setShowCompanyModal(false);
    setDirectory(prev => prev && {
      ...prev,
      businesses: [...prev.businesses, business].sort((a, b) => a.name.localeCompare(b.name)),
    });
    setSuccess(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.companyCreated, { company: business.name }));
  }

  function roleLimitsSaved(result: RoleLimitResponse) {
    setLimitsBusiness(null);
    setSuccess(interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleLimitsSavedForCompany, { company: result.businessName }));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, businessId: selectedBusinessId }),
    });
    const d = await res.json();
    if (!res.ok) { setError(d.error); return; }
    setSuccess(d.tenant?.name
      ? interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedInCompany, { email: d.email, company: d.tenant.name })
      : interpolateUiString(UI_STRINGS.appAppAdminUsersPage.userEmailCreatedSuccessfully, { "email": d.email }));
    setShowModal(false);
    setForm({ ...EMPTY_INVITE_FORM });
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
          activeTab !== 'roles' ? (
            <div className="inline-flex items-center gap-2">
              {canChooseBusiness && (
                <button
                  type="button"
                  className="btn btn-secondary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
                  onClick={() => setShowCompanyModal(true)}
                >
                  <Building2 size={16} />{UI_STRINGS.appAppAdminUsersPage.createCompany}</button>
              )}
              <button
                type="button"
                className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
                onClick={openInviteModal}
              >
                <Plus size={16} />{UI_STRINGS.appAppAdminUsersPage.inviteUser}</button>
            </div>
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
        {canChooseBusiness && (
          <button
            type="button"
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'companies'
                ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
            onClick={() => setActiveTab('companies')}
          >{UI_STRINGS.appAppAdminUsersPage.companies}</button>
        )}
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
                    <th>{UI_STRINGS.appAppAdminUsersPage.company}</th>
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
                      <td style={{ whiteSpace: 'nowrap' }}>{u.tenant?.name || UI_STRINGS.common.copy4s9bsz}</td>
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
      ) : activeTab === 'companies' ? (
        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
          {(directory?.businesses.length ?? 0) === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Building2 size={36} color="#94a3b8" strokeWidth={1.5} /></div>
              <div className="empty-title">{UI_STRINGS.appAppAdminUsersPage.noCompaniesFound}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{UI_STRINGS.appAppAdminUsersPage.company}</th>
                    <th>{UI_STRINGS.appAppAdminUsersPage.gst}</th>
                    <th>{UI_STRINGS.appAppAdminUsersPage.industry}</th>
                    <th>{UI_STRINGS.appAppAdminUsersPage.contact}</th>
                    <th className="col-actions">{UI_STRINGS.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {directory?.businesses.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.name}</td>
                      <td className="text-muted font-mono">{b.gstNumber || UI_STRINGS.common.copy4s9bsz}</td>
                      <td className="text-muted">{industryLabel(b.industry) || UI_STRINGS.common.copy4s9bsz}</td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                        <div>{b.contactPersonName || UI_STRINGS.common.copy4s9bsz}</div>
                        {b.contactPhone && <div style={{ fontSize: 11 }}>{b.contactPhone}</div>}
                      </td>
                      <td className="col-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary inline-flex items-center gap-1"
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => setLimitsBusiness(b)}
                        >
                          <SlidersHorizontal size={12} />{UI_STRINGS.appAppAdminUsersPage.roleLimits}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <button type="button" className="btn btn-ghost btn-icon" aria-label={UI_STRINGS.common.close} onClick={() => setShowModal(false)}>
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
                  <label className="form-label" htmlFor="invite-company">{UI_STRINGS.appAppAdminUsersPage.companyBusinessName}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  {canChooseBusiness ? (
                    <>
                      <select
                        id="invite-company"
                        className="form-control"
                        value={form.businessId}
                        onChange={e => setForm(f => ({ ...f, businessId: e.target.value }))}
                        required
                      >
                        <option value="">{UI_STRINGS.appAppAdminUsersPage.selectCompany}</option>
                        {directory?.businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{UI_STRINGS.appAppAdminUsersPage.companyHelpSuperAdmin}</p>
                    </>
                  ) : (
                    <>
                      <input id="invite-company" className="form-control" value={ownBusinessName} readOnly aria-readonly="true" />
                      <p className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>{UI_STRINGS.appAppAdminUsersPage.companyHelpLocked}</p>
                    </>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="invite-role">{UI_STRINGS.appAppAdminUsersPage.role2}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <select id="invite-role" className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => (
                      <option key={r} value={r} disabled={isRoleFull(r)}>
                        {isRoleFull(r)
                          ? interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleOptionFull, { role: r.replace(/_/g, ' ') })
                          : r.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  {selectedRoleUsage && (
                    <p data-testid="invite-role-usage" className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {selectedRoleUsage.maxUsers === null
                        ? interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleLimitUsageUnlimited, { active: selectedRoleUsage.activeUsers })
                        : interpolateUiString(UI_STRINGS.appAppAdminUsersPage.roleLimitUsage, { active: selectedRoleUsage.activeUsers, max: selectedRoleUsage.maxUsers })}
                    </p>
                  )}
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

      {showCompanyModal && (
        <CreateCompanyModal onClose={() => setShowCompanyModal(false)} onCreated={companyCreated} />
      )}

      {limitsBusiness && (
        <RoleLimitsModal business={limitsBusiness} onClose={() => setLimitsBusiness(null)} onSaved={roleLimitsSaved} />
      )}
    </div>
  );
}
