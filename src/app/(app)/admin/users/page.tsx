'use client';
// app/(app)/admin/users/page.tsx - User Management & RBAC Permissions
import { useEffect, useState } from 'react';
import { CheckCircle2, X, Search, Users, Shield, AlertTriangle, Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';

const ROLES = [
  'PROJECT_USER',
  'PROJECT_APPROVER',
  'PROCUREMENT_USER',
  'FINANCE_USER',
  'CATEGORY_MANAGER',
  'CLIENT_ADMIN',
  'VIEWER',
];

const PERMISSIONS_MATRIX: Array<{ permission: string; description: string; roles: string[] }> = [
  { permission: 'PROJECT_VIEW', description: 'View tenant projects & overviews', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER', 'VIEWER'] },
  { permission: 'PROJECT_CREATE', description: 'Create new Capex projects', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'PROJECT_EDIT', description: 'Modify project details & settings', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_VIEW', description: 'View BOQ lines and quality scores', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER', 'VIEWER'] },
  { permission: 'BOQ_UPLOAD', description: 'Upload raw Excel spreadsheets & map columns', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_EDIT', description: 'Standardise, edit descriptions and quantities', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_VALIDATE', description: 'Execute validation rules & quality scoring', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'CATEGORY_MANAGER'] },
  { permission: 'BOQ_SUBMIT', description: 'Submit draft BOQ for management approval', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'BOQ_APPROVE', description: 'Approve submitted BOQ as immutable baseline', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER'] },
  { permission: 'BOQ_REJECT', description: 'Reject submitted BOQ with mandatory reason', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER'] },
  { permission: 'BOQ_REVISION_CREATE', description: 'Branch new draft revision from approved baseline', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER'] },
  { permission: 'MASTER_VIEW', description: 'Inspect UOM catalog and Category taxonomy', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_USER', 'PROJECT_APPROVER', 'PROCUREMENT_USER', 'FINANCE_USER', 'CATEGORY_MANAGER'] },
  { permission: 'MASTER_EDIT', description: 'Create and update categories and UOMs', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'CATEGORY_MANAGER'] },
  { permission: 'USER_VIEW', description: 'View organization users', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'USER_CREATE', description: 'Create and invite users', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'USER_EDIT', description: 'Modify user roles and activate/disable users', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN'] },
  { permission: 'AUDIT_VIEW', description: 'View chronological entity mutation audit log', roles: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'PROJECT_APPROVER', 'FINANCE_USER', 'CATEGORY_MANAGER'] },
];

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
    setSuccess(`User ${d.email} created successfully.`);
    setShowModal(false);
    setForm({ email: '', name: '', role: 'PROJECT_USER', password: '' });
    load();
  }

  async function toggleStatus(u: any) {
    const newStatus = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    if (!confirm(`Are you sure you want to change status of ${u.name} to ${newStatus}?`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setSuccess(`User ${u.email} is now ${newStatus}.`);
      load();
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="w-full">
      <PageHeader
        title="User Management & Role Governance"
        subtitle={`${total} authorized users in this organization tenant`}
        breadcrumbs={[
          { label: 'Administration', href: '/admin/users' },
          { label: 'Users' },
        ]}
        actions={
          activeTab === 'users' ? (
            <button
              type="button"
              className="btn btn-primary h-[40px] px-4 font-semibold inline-flex items-center gap-1.5 shadow-xs"
              onClick={() => setShowModal(true)}
            >
              <Plus size={16} /> Invite User
            </button>
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
        >
          Tenant Users ({total})
        </button>
        <button
          type="button"
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'roles'
              ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
          }`}
          onClick={() => setActiveTab('roles')}
        >
          Role & Permission Matrix
        </button>
      </div>

      {activeTab === 'users' ? (
        <div className="card bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs mb-6">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <div className="relative max-w-md">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                className="input pl-9 h-[40px] w-full text-sm bg-white"
                placeholder="Search by name or email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {loading ? (
            <div className="loading-overlay"><div className="spinner" /> Loading users...</div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">No users found</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Created</th>
                    <th className="col-actions">Actions</th>
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
                      <td className="text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                      <td className="text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="col-actions">
                        <button
                          className={`btn btn-sm ${u.status === 'ACTIVE' ? 'btn-danger' : 'btn-secondary'}`}
                          style={{ padding: '3px 8px', fontSize: 11 }}
                          onClick={() => toggleStatus(u)}
                        >
                          {u.status === 'ACTIVE' ? 'Disable' : 'Activate'}
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
              <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>‹</button>
              <span className="page-info">Page {page} of {totalPages}</span>
              <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>›</button>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Shield size={18} /> RBAC Permission Mapping Matrix
            </span>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Permission Token</th>
                  <th>Functional Capability</th>
                  <th>Authorized Roles</th>
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
              <span className="modal-title">Invite New User</span>
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
                  <label className="form-label">Full Name <span className="required">*</span></label>
                  <input className="form-control" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address <span className="required">*</span></label>
                  <input type="email" className="form-control" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Role <span className="required">*</span></label>
                  <select className="form-control" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Temporary Password <span className="required">*</span></label>
                  <input type="password" className="form-control" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create User</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
