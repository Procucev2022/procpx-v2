'use client';
// app/(app)/audit/page.tsx - Audit Trail Viewer
import { useEffect, useState, useCallback } from 'react';
import { Eye, ShieldCheck, Activity, Layers, Filter } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCardGrid, SummaryCard } from '@/components/ui/SummaryCard';
import type { AuditLogItem } from "@app-types/app/(app)/audit/page.types";
import { ACTION_COLORS } from "./page.constants";


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
    <div className="page-container" style={{ padding: '24px 32px' }}>
      {/* Header */}
      <PageHeader
        title="System Audit Trail"
        subtitle="Immutable chronological log of all changes, approvals, user creations, and data mutations"
        badge={<span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>Security & Compliance</span>}
      />

      {/* KPI Metrics */}
      <SummaryCardGrid columns={3} className="mb-6">
        <SummaryCard
          label="Total Recorded Events"
          value={loading ? '—' : total.toLocaleString('en-IN')}
          secondary="Immutable audit records in ledger"
          icon={<ShieldCheck size={16} />}
          accent="blue"
        />
        <SummaryCard
          label="Active Filter Scope"
          value={entityType ? entityType : 'All Entities'}
          secondary={action ? `Action: ${action}` : 'All system operations'}
          icon={<Filter size={16} />}
          accent="slate"
        />
        <SummaryCard
          label="Ledger Pagination"
          value={`Page ${page} of ${totalPages}`}
          secondary={`Showing 25 events per page`}
          icon={<Activity size={16} />}
          accent="emerald"
        />
      </SummaryCardGrid>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16, background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Entity Type</label>
            <select
              value={entityType}
              onChange={e => { setEntityType(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a', padding: '8px 12px', borderRadius: 6, fontSize: 13, minWidth: 160 }}
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
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>Action</label>
            <select
              value={action}
              onChange={e => { setAction(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a', padding: '8px 12px', borderRadius: 6, fontSize: 13, minWidth: 160 }}
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
            <span style={{ fontSize: 13, color: '#64748b' }}>Filtered events count: <strong style={{ color: '#0f172a' }}>{total}</strong></span>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', height: 42 }}>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>Timestamp</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>User</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>Action</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>Entity</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>Description</th>
                <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>State Diff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                    No audit records match the selected criteria
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const style = ACTION_COLORS[log.action] || { bg: '#f1f5f9', text: '#475569', border: '#e2e8f0' };
                  const hasDiff = !!(log.oldValue || log.newValue || log.oldValues || log.newValues);
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9', height: 52 }}>
                      <td style={{ padding: '0 16px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {log.user?.name || log.user?.email || 'System'}
                        </div>
                        {log.user?.name && (
                          <div style={{ fontSize: 11, color: '#64748b' }}>{log.user.email}</div>
                        )}
                      </td>
                      <td style={{ padding: '0 16px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          backgroundColor: style.bg,
                          color: style.text,
                          border: `1px solid ${style.border}`,
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '0 16px', color: '#334155', fontWeight: 600 }}>
                        {log.entityType}
                      </td>
                      <td style={{ padding: '0 16px', fontSize: 13, color: '#334155', maxWidth: 350 }}>
                        {log.description}
                      </td>
                      <td style={{ padding: '0 16px', textAlign: 'right' }}>
                        {hasDiff ? (
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Eye size={13} /> Inspect Diff
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>None</span>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Showing {logs.length} of {total} records
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="btn btn-secondary btn-sm"
                style={{ height: 32 }}
              >
                Previous
              </button>
              <span style={{ padding: '0 8px', fontSize: 13, color: '#334155', fontWeight: 600 }}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="btn btn-secondary btn-sm"
                style={{ height: 32 }}
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
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: 8,
            maxWidth: 750,
            width: '100%',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '1px solid #e2e8f0',
            padding: 24,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
                Audit Event State Diff: {selectedLog.action} on {selectedLog.entityType}
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}
              >
                ×
              </button>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              Recorded on {new Date(selectedLog.createdAt).toLocaleString()} by {selectedLog.user?.name || selectedLog.user?.email || 'System'} (Entity ID: {selectedLog.entityId})
            </div>

            {(selectedLog.oldValue || selectedLog.oldValues) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 6, textTransform: 'uppercase' }}>
                  Previous State (Old Value):
                </div>
                <pre style={{
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#0f172a',
                  overflowX: 'auto',
                  border: '1px solid #e2e8f0',
                }}>
                  {JSON.stringify(parseJson(selectedLog.oldValue || selectedLog.oldValues), null, 2)}
                </pre>
              </div>
            )}

            {(selectedLog.newValue || selectedLog.newValues) && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6, textTransform: 'uppercase' }}>
                  New State (New Value):
                </div>
                <pre style={{
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#0f172a',
                  overflowX: 'auto',
                  border: '1px solid #e2e8f0',
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
