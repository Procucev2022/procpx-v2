'use client';
// app/(app)/audit/page.tsx - Audit Trail Viewer
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Eye, ShieldCheck, Activity, Filter } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { SummaryCardGrid, SummaryCard } from '@/components/ui/SummaryCard';
import type { AuditLogItem } from "@app-types/app/(app)/audit/page.types";
import { ACTION_COLORS } from "./page.constants";
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";



export default function AuditTrailPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const [diffValues, setDiffValues] = useState<{ oldValue: string | null; newValue: string | null } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(false);
  const diffRequestId = useRef(0);

  const inspectDiff = useCallback(async (log: AuditLogItem) => {
    const requestId = ++diffRequestId.current;
    setSelectedLog(log);
    setDiffValues(null);
    setDiffError(false);
    setDiffLoading(true);
    try {
      const response = await fetch(`/api/audit/${encodeURIComponent(log.id)}`);
      const json = await response.json();
      if (!response.ok) throw new Error(UI_STRINGS.appAppAuditPage.failedToLoadAuditDiff);
      const details = json.data?.data ?? json.data;
      if (!details || typeof details !== 'object') throw new Error(UI_STRINGS.appAppAuditPage.failedToLoadAuditDiff);
      if (requestId === diffRequestId.current) {
        setDiffValues({ oldValue: details.oldValue ?? null, newValue: details.newValue ?? null });
      }
    } catch (error) {
      if (requestId === diffRequestId.current) {
        setDiffError(true);
        console.error('audit.diff_detail_load_failed', error);
      }
    } finally {
      if (requestId === diffRequestId.current) setDiffLoading(false);
    }
  }, []);

  const closeDiff = useCallback(() => {
    diffRequestId.current += 1;
    setSelectedLog(null);
    setDiffValues(null);
    setDiffError(false);
    setDiffLoading(false);
  }, []);

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
        title={UI_STRINGS.appAppAuditPage.systemAuditTrail}
        subtitle={UI_STRINGS.appAppAuditPage.immutableChronologicalLogOfAllChangesApprovalsUserCreationsAndDataMutations}
        badge={<span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>{UI_STRINGS.appAppAuditPage.securityCompliance}</span>}
      />

      {/* KPI Metrics */}
      <SummaryCardGrid columns={3} className="mb-6">
        <SummaryCard
          label={UI_STRINGS.appAppAuditPage.totalRecordedEvents}
          value={loading ? '—' : total.toLocaleString(I18N_CONFIG.defaultLocale)}
          secondary={UI_STRINGS.appAppAuditPage.immutableAuditRecordsInLedger}
          icon={<ShieldCheck size={16} />}
          accent="blue"
        />
        <SummaryCard
          label={UI_STRINGS.appAppAuditPage.activeFilterScope}
          value={entityType ? entityType : 'All Entities'}
          secondary={action ? interpolateUiString(UI_STRINGS.appAppAuditPage.actionAction, { "action": action }) : UI_STRINGS.appAppAuditPage.allSystemOperations}
          icon={<Filter size={16} />}
          accent="slate"
        />
        <SummaryCard
          label={UI_STRINGS.appAppAuditPage.ledgerPagination}
                  value={interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: page, value2: totalPages })}
          secondary={UI_STRINGS.appAppAuditPage.showing25EventsPerPage}
          icon={<Activity size={16} />}
          accent="emerald"
        />
      </SummaryCardGrid>

      {/* Filter Bar */}
      <div className="card" style={{ marginBottom: 20, padding: 16, background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{UI_STRINGS.appAppAuditPage.entityType}</label>
            <select
              value={entityType}
              onChange={e => { setEntityType(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a', padding: '8px 12px', borderRadius: 6, fontSize: 13, minWidth: 160 }}
            >
              <option value="">{UI_STRINGS.appAppAuditPage.allEntities}</option>
              <option value="PROJECT">{UI_STRINGS.appAppAuditPage.pROJECT}</option>
              <option value="BOQ">{UI_STRINGS.common.bOQ}</option>
              <option value="BOQ_REVISION">{UI_STRINGS.appAppAuditPage.bOQREVISION}</option>
              <option value="BOQ_LINE">{UI_STRINGS.appAppAuditPage.bOQLINE}</option>
              <option value="USER">{UI_STRINGS.appAppAuditPage.uSER}</option>
              <option value="MASTER">{UI_STRINGS.appAppAuditPage.mASTER}</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{UI_STRINGS.common.action}</label>
            <select
              value={action}
              onChange={e => { setAction(e.target.value); setPage(1); }}
              className="form-select"
              style={{ background: '#ffffff', borderColor: '#cbd5e1', color: '#0f172a', padding: '8px 12px', borderRadius: 6, fontSize: 13, minWidth: 160 }}
            >
              <option value="">{UI_STRINGS.appAppAuditPage.allActions}</option>
              <option value="CREATE">{UI_STRINGS.appAppAuditPage.cREATE}</option>
              <option value="UPDATE">{UI_STRINGS.appAppAuditPage.uPDATE}</option>
              <option value="UPLOAD">{UI_STRINGS.appAppAuditPage.uPLOAD}</option>
              <option value="STANDARDISE">{UI_STRINGS.appAppAuditPage.sTANDARDISE}</option>
              <option value="VALIDATE">{UI_STRINGS.appAppAuditPage.vALIDATE}</option>
              <option value="SUBMIT">{UI_STRINGS.appAppAuditPage.sUBMIT}</option>
              <option value="APPROVE">{UI_STRINGS.appAppAuditPage.aPPROVE}</option>
              <option value="REJECT">{UI_STRINGS.appAppAuditPage.rEJECT}</option>
            </select>
          </div>
          <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
            <span style={{ fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppAuditPage.filteredEventsCount}<strong style={{ color: '#0f172a' }}>{total}</strong></span>
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', height: 42 }}>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.timestamp}</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.user}</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.action}</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.entity}</th>
                <th style={{ padding: '0 16px', fontWeight: 600 }}>{UI_STRINGS.common.description}</th>
                <th style={{ padding: '0 16px', fontWeight: 600, textAlign: 'right' }}>{UI_STRINGS.appAppAuditPage.stateDiff}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>{UI_STRINGS.appAppAuditPage.loadingAuditTrail}</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>{UI_STRINGS.appAppAuditPage.noAuditRecordsMatchTheSelectedCriteria}</td>
                </tr>
              ) : (
                logs.map(log => {
                  const style = ACTION_COLORS[log.action] || { bg: '#f1f5f9', text: UI_STRINGS.common.copy5npjv8, border: '#e2e8f0' };
                  const hasDiff = Boolean(log.hasDiff ?? (log.oldValue || log.newValue || log.oldValues || log.newValues));
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9', height: 52 }}>
                      <td style={{ padding: '0 16px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {log.user?.name || log.user?.email || UI_STRINGS.common.system}
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
                            onClick={() => void inspectDiff(log)}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '4px 10px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Eye size={13} />{UI_STRINGS.appAppAuditPage.inspectDiff}</button>
                        ) : (
                          <span style={{ fontSize: 12, color: '#94a3b8' }}>{UI_STRINGS.common.none}</span>
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
            <div style={{ fontSize: 13, color: '#64748b' }}>{UI_STRINGS.common.showing}{logs.length}{UI_STRINGS.common.of}{total}{UI_STRINGS.common.records}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="btn btn-secondary btn-sm"
                style={{ height: 32 }}
              >{UI_STRINGS.appAppAuditPage.previous}</button>
          <span style={{ padding: '0 8px', fontSize: 13, color: '#334155', fontWeight: 600 }}>{interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, { value1: page, value2: totalPages })}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="btn btn-secondary btn-sm"
                style={{ height: 32 }}
              >{UI_STRINGS.appAppAuditPage.next}</button>
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
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppAuditPage.auditEventStateDiff}{selectedLog.action}{UI_STRINGS.common.on}{selectedLog.entityType}
              </h3>
              <button
                onClick={closeDiff}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}
              >{UI_STRINGS.common.copymriixi}</button>
            </div>

            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{UI_STRINGS.appAppAuditPage.recordedOn}{new Date(selectedLog.createdAt).toLocaleString()}{UI_STRINGS.common.by}{selectedLog.user?.name || selectedLog.user?.email || UI_STRINGS.common.system}{UI_STRINGS.appAppAuditPage.entityID}{selectedLog.entityId}{UI_STRINGS.common.copyc7zu6c}</div>

            {diffLoading && <div role="status" style={{ padding: 16, color: '#64748b' }}>{UI_STRINGS.appAppAuditPage.loadingAuditDiff}</div>}
            {diffError && <div role="alert" style={{ padding: 16, color: '#b91c1c' }}>{UI_STRINGS.appAppAuditPage.failedToLoadAuditDiff}</div>}

            {!diffLoading && !diffError && (diffValues?.oldValue) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c', marginBottom: 6, textTransform: 'uppercase' }}>{UI_STRINGS.appAppAuditPage.previousStateOldValue}</div>
                <pre style={{
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#0f172a',
                  overflowX: 'auto',
                  border: '1px solid #e2e8f0',
                }}>
                  {JSON.stringify(parseJson(diffValues.oldValue), null, 2)}
                </pre>
              </div>
            )}

            {!diffLoading && !diffError && (diffValues?.newValue) && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d', marginBottom: 6, textTransform: 'uppercase' }}>{UI_STRINGS.appAppAuditPage.newStateNewValue}</div>
                <pre style={{
                  background: '#f8fafc',
                  padding: 12,
                  borderRadius: 6,
                  fontSize: 12,
                  color: '#0f172a',
                  overflowX: 'auto',
                  border: '1px solid #e2e8f0',
                }}>
                  {JSON.stringify(parseJson(diffValues.newValue), null, 2)}
                </pre>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={closeDiff}
                className="btn btn-secondary"
                style={{ padding: '8px 16px' }}
              >{UI_STRINGS.common.close}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
