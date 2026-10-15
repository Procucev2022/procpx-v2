'use client';
// app/(app)/audit/page.tsx - Audit Trail Viewer
import { useEffect, useState, useCallback } from 'react';
import { Eye } from 'lucide-react';

interface AuditLogItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  description: string;
  oldValue?: string | null;
  newValue?: string | null;
  oldValues?: string | null;
  newValues?: string | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: {
    name: string | null;
    email: string;
  } | null;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: '#10b981',
  UPDATE: '#38bdf8',
  DELETE: '#ef4444',
  SUBMIT: '#f59e0b',
  APPROVE: '#10b981',
  REJECT: '#ef4444',
  IMPORT: '#8b5cf6',
  UPLOAD: '#a855f7',
  STANDARDISE: '#ec4899',
  VALIDATE: '#06b6d4',
  LOGIN: '#64748b',
};

export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (entityType) p.set('entityType', entityType);
      if (action) p.set('action', action);

      const res = await fetch(`/api/audit?${p.toString()}`);
      if (res.ok) {
        const json = await res.json();
        // Support both { data: [...], total: ... } and direct formats
        const list = Array.isArray(json.data) ? json.data : Array.isArray(json.data?.data) ? json.data.data : [];
        setLogs(list);
        setTotal(json.total ?? json.data?.total ?? list.length);
        setTotalPages(json.totalPages ?? json.data?.totalPages ?? 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, entityType, action]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const parseJson = (str?: string | null) => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return str;
    }
  };

  return (
    <div className="main-content">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 className="page-title" style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>System Audit Trail</h1>
        <p className="page-subtitle" style={{ color: '#94a3b8', fontSize: 14, marginTop: 4 }}>
          Immutable chronological log of all changes, approvals, user creations, and data mutations
        </p>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16, background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Entity Type</label>
            <select
              value={entityType}
              onChange={e => { setEntityType(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#0f172a', borderColor: '#334155', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
            >
              <option value="">All Entities</option>
              <option value="PROJECT">PROJECT</option>
              <option value="BOQ">BOQ</option>
              <option value="BOQ_REVISION">BOQ_REVISION</option>
              <option value="BOQ_LINE">BOQ_LINE</option>
              <option value="USER">USER</option>
              <option value="MASTER">MASTER</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Action</label>
            <select
              value={action}
              onChange={e => { setAction(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#0f172a', borderColor: '#334155', color: '#fff', padding: '8px 12px', borderRadius: 6 }}
            >
              <option value="">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="UPLOAD">UPLOAD</option>
              <option value="STANDARDISE">STANDARDISE</option>
              <option value="VALIDATE">VALIDATE</option>
              <option value="SUBMIT">SUBMIT</option>
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Total recorded events: <strong>{total}</strong></span>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ background: '#1e293b', borderRadius: 8, border: '1px solid #334155', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 16px' }}>Timestamp</th>
                <th style={{ padding: '12px 16px' }}>User</th>
                <th style={{ padding: '12px 16px' }}>Action</th>
                <th style={{ padding: '12px 16px' }}>Entity</th>
                <th style={{ padding: '12px 16px' }}>Description</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>State Diff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                    No audit records match the selected criteria
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const actionColor = ACTION_COLORS[log.action] || '#94a3b8';
                  const hasDiff = !!(log.oldValue || log.newValue || log.oldValues || log.newValues);
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500, color: '#f8fafc' }}>
                          {log.user?.name || log.user?.email || 'System'}
                        </div>
                        {log.user?.name && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>{log.user.email}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: `${actionColor}20`,
                          color: actionColor,
                          border: `1px solid ${actionColor}40`,
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#cbd5e1', fontWeight: 500 }}>
                        {log.entityType}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#cbd5e1', maxWidth: 350 }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        {hasDiff ? (
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Eye size={13} /> Inspect Diff
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#64748b' }}>None</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #334155' }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Showing {logs.length} of {total} records
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Previous
              </button>
              <span style={{ padding: '4px 8px', fontSize: 13, color: '#cbd5e1' }}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12 }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* State Diff Inspector Modal */}
      {selectedLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#1e293b',
            borderRadius: 8,
            maxWidth: 750,
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '1px solid #334155',
            padding: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#f8fafc' }}>
                Audit Event State Diff: {selectedLog.action} on {selectedLog.entityType}
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 16 }}>
              Recorded on {new Date(selectedLog.createdAt).toLocaleString()} by {selectedLog.user?.name || selectedLog.user?.email || 'System'} (Entity ID: {selectedLog.entityId})
            </div>

            {(selectedLog.oldValue || selectedLog.oldValues) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#ef4444', marginBottom: 6, textTransform: 'uppercase' }}>
                  Previous State (Old Value):
                </div>
                <pre style={{
                  background: '#0f172a',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#f8fafc',
                  overflowX: 'auto',
                  border: '1px solid #334155',
                }}>
                  {JSON.stringify(parseJson(selectedLog.oldValue || selectedLog.oldValues), null, 2)}
                </pre>
              </div>
            )}

            {(selectedLog.newValue || selectedLog.newValues) && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#10b981', marginBottom: 6, textTransform: 'uppercase' }}>
                  New State (New Value):
                </div>
                <pre style={{
                  background: '#0f172a',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#f8fafc',
                  overflowX: 'auto',
                  border: '1px solid #334155',
                }}>
                  {JSON.stringify(parseJson(selectedLog.newValue || selectedLog.newValues), null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedLog(null)}
                className="btn btn-secondary"
                style={{ padding: '8px 16px' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
