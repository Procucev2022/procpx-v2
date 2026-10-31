'use client';
// app/(app)/boq/[revisionId]/page.tsx - BOQ Workspace
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Wand2,
  Check,
  Send,
  AlertCircle,
  CheckCircle2,
  XCircle,
  X,
  Lock,
  GitCompare,
  Search,
  ClipboardCheck,
  Pencil,
  Info,
  ExternalLink,
} from 'lucide-react';
import SpecificationCell from '@/components/ui/SpecificationCell';
import { useToast } from '@/components/ui/Toast';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { FileSpreadsheet, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


function QualityBar({ score }: { score?: number | null }) {
  if (score == null) return null;
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="quality-score" style={{ width: 180 }}>
      <div className="quality-bar"><div className="quality-fill" style={{ width: `${score}%`, background: color }} /></div>
      <span className="quality-label" style={{ color }}>{score}{UI_STRINGS.common.copy8w4luo}</span>
    </div>
  );
}

export default function BoqWorkspacePage() {
  const toast = useToast();
  const { revisionId } = useParams<{ revisionId: string }>();
  const [revision, setRevision] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ isError: boolean; text: string } | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [activeTab, setActiveTab] = useState<'lines' | 'summary' | 'compare'>('lines');
  const [compareData, setCompareData] = useState<any>(null);
  const [compareTargetId, setCompareTargetId] = useState('');
  const [loadingCompare, setLoadingCompare] = useState(false);
  const pageSize = 50;

  const loadLines = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search, validationStatus: filterStatus });
    fetch(`/api/boq/${revisionId}/lines?${params}`)
      .then(r => r.json())
      .then(d => {
        setLines(d.data || []);
        setTotal(d.total || 0);
        setRevision(d.revision);
        setLoading(false);
      });
  }, [revisionId, page, search, filterStatus]);

  useEffect(() => { loadLines(); }, [loadLines]);
  useEffect(() => {
    fetch('/api/masters/categories').then(r => r.json()).then(d => setCategories(d || []));
    fetch('/api/masters/uom').then(r => r.json()).then(d => setUoms(d || []));
  }, []);

  const loadCompare = useCallback(async (targetId?: string) => {
    setLoadingCompare(true);
    const url = targetId
      ? `/api/boq/${revisionId}/compare?targetRevisionId=${targetId}`
      : `/api/boq/${revisionId}/compare`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      setCompareData(data);
      if (!compareTargetId && data.compareRevision?.id) {
        setCompareTargetId(data.compareRevision.id);
      }
    }
    setLoadingCompare(false);
  }, [revisionId, compareTargetId]);

  useEffect(() => {
    if (activeTab === 'compare') {
      loadCompare(compareTargetId || undefined);
    }
  }, [activeTab, compareTargetId, loadCompare]);

  const isEditable = revision?.status === 'DRAFT';
  const isSubmitted = revision?.status === 'SUBMITTED';
  const isApproved = revision?.status === 'APPROVED';

  const saveEdit = async () => {
    if (!editingLine) return;
    setSaving(true);
    const res = await fetch(`/api/boq/${revisionId}/lines`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lineId: editingLine.id, updates: editingLine }),
    });
    setSaving(false);
    if (res.ok) { setEditingLine(null); loadLines(); }
    else {
      const d = await res.json();
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const standardiseBoq = async () => {
    setActionMsg({ isError: false, text: UI_STRINGS.appAppBoqRevisionIdPage.standardisingDescriptionsAndUOMsAgainstEnterpriseCatalog });
    const res = await fetch(`/api/boq/${revisionId}/standardise`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      setActionMsg({ isError: false, text: interpolateUiString(UI_STRINGS.appAppBoqRevisionIdPage.messageScoreQualityScore, { "message": d.message, "qualityScore": d.qualityScore }) });
      loadLines();
    } else {
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const validateBoq = async () => {
    setActionMsg({ isError: false, text: UI_STRINGS.appAppBoqRevisionIdPage.runningFullLineLevelValidationChecks });
    const res = await fetch(`/api/boq/${revisionId}/validate`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      setActionMsg({ isError: false, text: interpolateUiString(UI_STRINGS.appAppBoqRevisionIdPage.validationUpdatedQualityScoreIsQualityScoreErrorLinesErrorsWarningLinesWarnings, { "qualityScore": d.qualityScore, "errorLines": d.errorLines, "warningLines": d.warningLines }) });
      loadLines();
    } else {
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const submitBoq = async () => {
    if (!confirm(UI_STRINGS.appAppBoqRevisionIdPage.submitThisBOQForApproval)) return;
    const res = await fetch(`/api/boq/${revisionId}/submit`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      toast.success(UI_STRINGS.common.bOQSubmittedSuccessfully, d.revisionCode || revision?.revisionCode, UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover);
      setActionMsg({ isError: false, text: UI_STRINGS.common.bOQSubmittedSuccessfully });
      loadLines();
    } else {
      toast.error(d.error || UI_STRINGS.common.userMessages.failedToSubmitBoq);
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const approveBoq = async () => {
    if (!confirm(UI_STRINGS.appAppBoqRevisionIdPage.approveThisBOQThisActionWillMakeItAnImmutableCommercialBaseline)) return;
    const res = await fetch(`/api/boq/${revisionId}/approve`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) {
      toast.success(UI_STRINGS.common.bOQApprovedSuccessfully);
      setActionMsg({ isError: false, text: UI_STRINGS.common.bOQApprovedSuccessfully });
      loadLines();
    } else {
      toast.error(d.error || UI_STRINGS.common.userMessages.failedToApproveBoq);
      setActionMsg({ isError: true, text: d.error });
    }
  };

  const rejectBoq = async () => {
    if (!rejectReason.trim()) return;
    const res = await fetch(`/api/boq/${revisionId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason }),
    });
    const d = await res.json();
    setShowRejectModal(false);
    if (res.ok) { setActionMsg({ isError: false, text: UI_STRINGS.appAppBoqRevisionIdPage.bOQRejectedWithMandatoryReason }); loadLines(); }
    else setActionMsg({ isError: true, text: d.error });
  };

  const newRevision = async () => {
    if (!confirm(UI_STRINGS.appAppBoqRevisionIdPage.createANewDraftRevisionFromThisApprovedBOQ)) return;
    const res = await fetch(`/api/boq/${revisionId}/new-revision`, { method: 'POST' });
    const d = await res.json();
    if (res.ok) { window.location.href = `/boq/${d.revisionId}`; }
    else setActionMsg({ isError: true, text: d.error });
  };

  const getSubcategories = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    return cat?.children || [];
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="page-content">
      {/* Header */}
      <PageHeader
        title={revision?.revisionCode ? interpolateUiString(UI_STRINGS.appAppBoqRevisionIdPage.bOQWorkspaceRevisionCode, { "revisionCode": revision.revisionCode }) : UI_STRINGS.common.bOQWorkspace}
        subtitle={UI_STRINGS.appAppBoqRevisionIdPage.manageBOQLinesValidateSpecificationsRunAutomatedStandardisationAndSubmitForApproval}
        backHref="/boq"
        backLabel="← Back to BOQ Register"
        badge={revision ? <StatusBadge status={revision.status} /> : undefined}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            {revision && <QualityBar score={revision.qualityScore} />}
            {isEditable && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={standardiseBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Wand2 size={14} />{UI_STRINGS.appAppBoqRevisionIdPage.standardise}</button>
                <button className="btn btn-secondary btn-sm" onClick={validateBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} />{UI_STRINGS.appAppBoqRevisionIdPage.validate}</button>
                {revision?.errorLines === 0 ? (
                  <button className="btn btn-primary btn-sm" onClick={submitBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <Send size={14} />{UI_STRINGS.appAppBoqRevisionIdPage.submitForApproval}</button>
                ) : (
                  <button className="btn btn-secondary btn-sm" disabled title={UI_STRINGS.appAppBoqRevisionIdPage.fixValidationErrorsBeforeSubmitting} style={{ opacity: 0.6, cursor: 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <AlertCircle size={14} /> {revision?.errorLines}{UI_STRINGS.appAppBoqRevisionIdPage.errorsBlockSubmit}</button>
                )}
              </>
            )}
            {isSubmitted && (
              <>
                <button className="btn btn-primary btn-sm" onClick={approveBoq} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} />{UI_STRINGS.appAppBoqRevisionIdPage.approveBOQ}</button>
                <button className="btn btn-danger btn-sm" onClick={() => setShowRejectModal(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <XCircle size={14} />{UI_STRINGS.common.rejectBOQ}</button>
              </>
            )}
            {isApproved && (
              <button className="btn btn-primary btn-sm" onClick={newRevision}>{UI_STRINGS.appAppBoqRevisionIdPage.createNewRevision}</button>
            )}
          </div>
        }
      />

      {actionMsg && (
        <div className={`alert ${actionMsg.isError ? 'alert-error' : 'alert-success'} mb-4`} style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {actionMsg.isError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          <span>{actionMsg.text}</span>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setActionMsg(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Rejection reason banner */}
      {revision?.status === 'REJECTED' && revision?.rejectionReason && (
        <div className="alert alert-error mb-4" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={18} />
          <span><strong>{UI_STRINGS.appAppBoqRevisionIdPage.revisionRejected}</strong> {revision.rejectionReason}</span>
        </div>
      )}

      {/* Approved lock banner */}
      {isApproved && (
        <div className="alert alert-success mb-4" style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <Lock size={20} style={{ color: '#166534', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>{UI_STRINGS.appAppBoqRevisionIdPage.immutableCommercialBaseline}</strong>{UI_STRINGS.appAppBoqRevisionIdPage.thisBOQRevisionHasBeenFormallyApprovedAndLocked}<div style={{ fontSize: 12, marginTop: 2 }}>{UI_STRINGS.appAppBoqRevisionIdPage.modificationsAreProhibitedOnThisRevisionUse}<strong>{UI_STRINGS.appAppBoqRevisionIdPage.quotCreateNewRevisionQuot}</strong>{UI_STRINGS.appAppBoqRevisionIdPage.toStartANewBranch}</div>
          </div>
        </div>
      )}

      {/* KPI Stats */}
      {revision && (
        <div className="mb-6">
          <SummaryCardGrid columns={4}>
            <SummaryCard
              label={UI_STRINGS.common.totalLines}
              value={revision.totalLines || 0}
              secondary={UI_STRINGS.appAppBoqRevisionIdPage.totalItemsInBOQ}
              icon={<FileSpreadsheet size={16} />}
              accent="default"
            />
            <SummaryCard
              label={UI_STRINGS.appAppBoqRevisionIdPage.validLines}
              value={revision.validLines || 0}
              secondary={UI_STRINGS.appAppBoqRevisionIdPage.passedValidationRules}
              icon={<CheckCircle size={16} />}
              accent="emerald"
            />
            <SummaryCard
              label={UI_STRINGS.common.warnings}
              value={revision.warningLines || 0}
              secondary={UI_STRINGS.appAppBoqRevisionIdPage.nonBlockingNotices}
              icon={<AlertTriangle size={16} />}
              accent="amber"
            />
            <SummaryCard
              label={UI_STRINGS.common.errors}
              value={revision.errorLines || 0}
              secondary={UI_STRINGS.appAppBoqRevisionIdPage.blockingIssues}
              icon={<AlertOctagon size={16} />}
              accent="rose"
            />
          </SummaryCardGrid>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs mb-4">
        <div className={`tab ${activeTab === 'lines' ? 'active' : ''}`} onClick={() => setActiveTab('lines')}>{UI_STRINGS.appAppBoqRevisionIdPage.bOQLines}{total}{UI_STRINGS.common.copyc7zu6c}</div>
        <div className={`tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>{UI_STRINGS.appAppBoqRevisionIdPage.qualitySummary}</div>
        <div className={`tab ${activeTab === 'compare' ? 'active' : ''}`} onClick={() => setActiveTab('compare')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <GitCompare size={14} />{UI_STRINGS.appAppBoqRevisionIdPage.revisionComparisonDiff}</div>
      </div>

      {/* ── TAB 1: BOQ Lines Grid ──────────────────────────────── */}
      {activeTab === 'lines' && (
        <div className="card">
          <div className="filter-bar">
            <div className="search-input-wrapper">
              <span className="search-icon" style={{ display: 'flex', alignItems: 'center' }}>
                <Search size={16} color="#94a3b8" />
              </span>
              <input className="form-control search-input" placeholder={UI_STRINGS.appAppBoqRevisionIdPage.searchDescriptionsLineNumbers} value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <select className="form-control" style={{ width: 160 }} value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}>
              <option value="">{UI_STRINGS.common.allStatuses}</option>
              <option value="VALID">{UI_STRINGS.common.valid}</option>
              <option value="WARNING">{UI_STRINGS.common.warning}</option>
              <option value="ERROR">{UI_STRINGS.common.error}</option>
            </select>
            <span className="text-muted text-sm">{total}{UI_STRINGS.common.lines2}</span>
          </div>

          {loading ? (
            <div className="loading-overlay"><div className="spinner" />{UI_STRINGS.appAppBoqRevisionIdPage.loadingBOQLines}</div>
          ) : lines.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppBoqRevisionIdPage.noBOQLinesFound}</div>
            </div>
          ) : (
            <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
              <table className="data-table enterprise-table" style={{ width: '100%', minWidth: 1200 }}>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>{UI_STRINGS.common.sNo2}</th>
                    <th style={{ width: 110 }}>{UI_STRINGS.common.itemCode}</th>
                    <th style={{ minWidth: 240 }}>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ minWidth: 160 }}>{UI_STRINGS.common.bOQDescription}</th>
                    <th style={{ width: 80, textAlign: 'center' }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ width: 90, textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                    <th style={{ minWidth: 120 }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ minWidth: 120 }}>{UI_STRINGS.common.subCategory}</th>
                    <th style={{ width: 100 }}>{UI_STRINGS.common.location}</th>
                    <th style={{ width: 130, textAlign: 'center' }}>{UI_STRINGS.appAppBoqRevisionIdPage.statusRules}</th>
                    <th style={{ width: 90, textAlign: 'center' }} className="col-actions">{UI_STRINGS.common.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.id} style={{ background: line.validationStatus === 'ERROR' ? '#fff8f8' : line.validationStatus === 'WARNING' ? '#fffbeb' : undefined }}>
                      <td><span className="font-mono text-muted">{(page - 1) * pageSize + idx + 1}</span></td>
                      <td>
                        <span className="font-mono font-bold text-xs" style={{ color: '#1e40af' }}>
                          {line.itemCode || line.lineNumber || UI_STRINGS.common.copy4s9bsz}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{line.standardDescription || line.originalDescription}</div>
                        {line.standardDescription && line.standardDescription !== line.originalDescription && (
                          <div style={{ fontSize: 11, color: '#4338ca', marginTop: 2 }}>
                            <strong>{UI_STRINGS.appAppBoqRevisionIdPage.original}</strong> {line.originalDescription}
                          </div>
                        )}
                      </td>
                      <td>
                        <SpecificationCell
                          specification={line.specification}
                          lineNumber={line.lineNumber}
                          itemDescription={line.standardDescription || line.originalDescription}
                          lineId={line.id}
                          maxWidth={200}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="font-mono font-bold" style={{ color: line.uom?.code ? '#059669' : '#d97706' }}>
                          {line.uom?.code || line.uomRaw || UI_STRINGS.common.copy4s9bsz}
                        </span>
                        {line.uomRaw && line.uom?.code && line.uomRaw.toUpperCase() !== line.uom.code && (
                          <span style={{ fontSize: 10, color: '#6b7280', display: 'block' }}>{UI_STRINGS.appAppBoqRevisionIdPage.raw}{line.uomRaw}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{line.quantity !== null && line.quantity !== undefined ? line.quantity.toLocaleString() : UI_STRINGS.common.copy4s9bsz}</td>
                      <td>{line.category?.name || <span className="text-muted">{UI_STRINGS.common.copy4s9bsz}</span>}</td>
                      <td>{line.subcategory?.name || <span className="text-muted">{UI_STRINGS.common.copy4s9bsz}</span>}</td>
                      <td className="text-muted">{line.location || UI_STRINGS.common.copy4s9bsz}</td>
                      <td style={{ textAlign: 'center' }}>
                        <StatusBadge status={line.validationStatus} />
                        {line.validationMessages && (
                          <div style={{ marginTop: 4, textAlign: 'left' }}>
                            {JSON.parse(line.validationMessages).map((m: any, i: number) => (
                              <div key={i} style={{ color: m.level === 'ERROR' ? '#dc2626' : m.level === 'WARNING' ? '#d97706' : '#2563eb', fontSize: 11, lineHeight: 1.2 }}>{UI_STRINGS.common.copyaw0l2d}{m.message}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="col-actions">
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                          <a
                            href={`/boq/line/${line.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-ghost"
                            title={UI_STRINGS.appAppBoqRevisionIdPage.openCompleteLineItemInASeparateView}
                            style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 6px', color: '#0284c7' }}
                          >
                            <ExternalLink size={13} />
                          </a>
                          {isEditable && (
                            <button className="btn btn-sm btn-ghost" onClick={() => setEditingLine({ ...line })} title={UI_STRINGS.common.editLine} style={{ padding: '4px 6px' }}>
                              <Pencil size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(1)} disabled={page === 1}>{UI_STRINGS.common.copy1cahyqy}</button>
              <button className="page-btn" onClick={() => setPage(p => p - 1)} disabled={page === 1}>{UI_STRINGS.common.copygps8ms}</button>
              <span className="page-info">{UI_STRINGS.common.page2}{page}{UI_STRINGS.common.of}{totalPages}</span>
              <button className="page-btn" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>{UI_STRINGS.common.copyhjr1pp}</button>
              <button className="page-btn" onClick={() => setPage(totalPages)} disabled={page === totalPages}>{UI_STRINGS.common.copy1gqblui}</button>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: Quality & Summary ───────────────────────────── */}
      {activeTab === 'summary' && (
        <div className="form-grid">
          <div className="card">
            <div className="card-header"><span className="card-title">{UI_STRINGS.appAppBoqRevisionIdPage.bOQQualityScoreHealth}</span></div>
            <div className="card-body">
              <div style={{ textAlign: 'center', padding: '16px 0', borderBottom: '1px solid #f1f5f9', marginBottom: 16 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: (revision?.qualityScore ?? 0) >= 80 ? '#059669' : '#d97706' }}>
                  {revision?.qualityScore ?? 0}{UI_STRINGS.appAppBoqRevisionIdPage.copy1uj03ij}</div>
                <div className="text-muted text-sm">{UI_STRINGS.appAppBoqRevisionIdPage.enterpriseQualityIndex}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{UI_STRINGS.appAppBoqRevisionIdPage.errorLinesSubmissionBlockers}</span>
                  <span className="badge badge-error">{revision?.errorLines || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{UI_STRINGS.appAppBoqRevisionIdPage.warningLines}</span>
                  <span className="badge badge-warning">{revision?.warningLines || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{UI_STRINGS.appAppBoqRevisionIdPage.validStandardisedLines}</span>
                  <span className="badge badge-valid">{revision?.validLines || 0}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{UI_STRINGS.appAppBoqRevisionIdPage.totalParsedLines}</span>
                  <span style={{ fontWeight: 600 }}>{revision?.totalLines || 0}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">{UI_STRINGS.appAppBoqRevisionIdPage.revisionMetadata}</span></div>
            <div className="card-body">
              {revision && [
                ['Revision Code', revision.revisionCode],
                ['Status', <StatusBadge key="s" status={revision.status} />],
                ['Original File', revision.originalFileName || 'Direct Input / Branch'],
                ['Uploaded At', revision.uploadedAt ? new Date(revision.uploadedAt).toLocaleString() : '—'],
                ['Submitted At', revision.submittedAt ? new Date(revision.submittedAt).toLocaleString() : '—'],
                ['Approved At', revision.approvedAt ? new Date(revision.approvedAt).toLocaleString() : '—'],
                ['Notes', revision.notes || '—'],
              ].map(([label, value]) => (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span className="text-muted text-sm">{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: Compare Revisions ───────────────────────────── */}
      {activeTab === 'compare' && (
        <div className="card">
          <div className="card-header flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 12 }}>
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <GitCompare size={18} />{UI_STRINGS.appAppBoqRevisionIdPage.compareRevision}{revision?.revisionCode}{UI_STRINGS.appAppBoqRevisionIdPage.withAnotherRevision}</span>
            {compareData?.availableRevisions?.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">{UI_STRINGS.appAppBoqRevisionIdPage.compareAgainst}</span>
                <select
                  className="form-control"
                  style={{ width: 140 }}
                  value={compareTargetId}
                  onChange={e => { setCompareTargetId(e.target.value); loadCompare(e.target.value); }}
                >
                  {compareData.availableRevisions.map((r: any) => (
                    <option key={r.id} value={r.id}>
                      {r.revisionCode}{UI_STRINGS.common.copy1b3t0c5}{r.status}{UI_STRINGS.common.copyc7zu6c}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loadingCompare ? (
            <div className="loading-overlay"><div className="spinner" />{UI_STRINGS.appAppBoqRevisionIdPage.computingRevisionDiff}</div>
          ) : !compareData ? (
            <div className="empty-state"><div className="empty-title">{UI_STRINGS.appAppBoqRevisionIdPage.selectRevisionsToCompare}</div></div>
          ) : (
            <div className="card-body">
              {/* Diff summary badges */}
              <div className="kpi-grid mb-6">
                <div className="kpi-card" style={{ borderLeft: '3px solid #059669' }}>
                  <div className="kpi-label">{UI_STRINGS.appAppBoqRevisionIdPage.linesAdded}</div>
                  <div className="kpi-value" style={{ color: '#059669' }}>{compareData.summary?.addedCount || 0}</div>
                </div>
                <div className="kpi-card" style={{ borderLeft: '3px solid #dc2626' }}>
                  <div className="kpi-label">{UI_STRINGS.appAppBoqRevisionIdPage.linesRemoved}</div>
                  <div className="kpi-value" style={{ color: '#dc2626' }}>{compareData.summary?.removedCount || 0}</div>
                </div>
                <div className="kpi-card" style={{ borderLeft: '3px solid #d97706' }}>
                  <div className="kpi-label">{UI_STRINGS.appAppBoqRevisionIdPage.linesModified}</div>
                  <div className="kpi-value" style={{ color: '#d97706' }}>{compareData.summary?.modifiedCount || 0}</div>
                </div>
                <div className="kpi-card">
                  <div className="kpi-label">{UI_STRINGS.appAppBoqRevisionIdPage.linesUnchanged}</div>
                  <div className="kpi-value">{compareData.summary?.unchangedCount || 0}</div>
                </div>
              </div>

              {/* Modified Lines Table */}
              {compareData.modified?.length > 0 && (
                <div className="mb-6">
                  <h4 style={{ fontWeight: 700, marginBottom: 8 }}>{UI_STRINGS.appAppBoqRevisionIdPage.modifiedLineItems}</h4>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{UI_STRINGS.common.sNo2}</th>
                          <th>{UI_STRINGS.common.itemDescription}</th>
                          <th>{UI_STRINGS.appAppBoqRevisionIdPage.field}</th>
                          <th>{UI_STRINGS.appAppBoqRevisionIdPage.previous}{compareData.compareRevision?.revisionCode}{UI_STRINGS.common.copyc7zu6c}</th>
                          <th>{interpolateUiString(UI_STRINGS.appAppBoqRevisionIdPage.current, { revisionCode: compareData.currentRevision?.revisionCode || '' })}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compareData.modified.map((item: any) => (
                          item.diffs.map((d: any, idx: number) => (
                            <tr key={`${item.lineNumber}-${idx}`}>
                              {idx === 0 && <td rowSpan={item.diffs.length} className="font-mono font-bold">{item.lineNumber}</td>}
                              {idx === 0 && <td rowSpan={item.diffs.length}>{item.description}</td>}
                              <td><span className="badge badge-info">{d.field}</span></td>
                              <td style={{ color: '#dc2626' }}>{String(d.oldVal || '—')}</td>
                              <td style={{ color: '#059669', fontWeight: 600 }}>{String(d.newVal || '—')}</td>
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Added Lines Table */}
              {compareData.added?.length > 0 && (
                <div className="mb-6">
                  <h4 style={{ fontWeight: 700, marginBottom: 8, color: '#059669' }}>{UI_STRINGS.appAppBoqRevisionIdPage.addedLineItems}</h4>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead><tr><th>{UI_STRINGS.common.sNo2}</th><th>{UI_STRINGS.common.itemDescription}</th><th>{UI_STRINGS.common.quantity}</th><th>{UI_STRINGS.common.uOM}</th><th>{UI_STRINGS.common.category2}</th></tr></thead>
                      <tbody>
                        {compareData.added.map((l: any) => (
                          <tr key={l.lineNumber} style={{ background: '#f0fdf4' }}>
                            <td className="font-mono font-bold">{l.lineNumber}</td>
                            <td>{l.description}</td>
                            <td>{l.quantity}</td>
                            <td>{l.uom}</td>
                            <td>{l.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {compareData.modified?.length === 0 && compareData.added?.length === 0 && compareData.removed?.length === 0 && (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <CheckCircle2 size={36} color="#059669" strokeWidth={1.5} />
                  </div>
                  <div className="empty-title">{UI_STRINGS.appAppBoqRevisionIdPage.revisionsAreIdentical}</div>
                  <div className="empty-desc">{UI_STRINGS.appAppBoqRevisionIdPage.noLineDifferencesDetectedBetween}{compareData.currentRevision?.revisionCode}{UI_STRINGS.appAppBoqRevisionIdPage.and}{compareData.compareRevision?.revisionCode}{UI_STRINGS.common.copyby08hd}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Line Modal */}
      {editingLine && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditingLine(null)}>
          <div className="modal modal-lg">
            <div className="modal-header">
              <span className="modal-title">{UI_STRINGS.appAppBoqRevisionIdPage.editBOQLineLine}{editingLine.lineNumber}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setEditingLine(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="alert alert-info mb-4" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Info size={16} />
                <div>
                  <strong>{UI_STRINGS.appAppBoqRevisionIdPage.originalSourceDocument}</strong> {editingLine.originalDescription}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{UI_STRINGS.appAppBoqRevisionIdPage.standardDescription}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                <input className="form-control" value={editingLine.standardDescription || ''} onChange={e => setEditingLine((l: any) => ({ ...l, standardDescription: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">{UI_STRINGS.common.specification}</label>
                <textarea className="form-control" value={editingLine.specification || ''} onChange={e => setEditingLine((l: any) => ({ ...l, specification: e.target.value }))} rows={2} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.common.category2}</label>
                  <select className="form-control" value={editingLine.categoryId || ''} onChange={e => setEditingLine((l: any) => ({ ...l, categoryId: e.target.value, subcategoryId: '' }))}>
                    <option value="">{UI_STRINGS.appAppBoqRevisionIdPage.selectCategory}</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.common.subcategory}</label>
                  <select className="form-control" value={editingLine.subcategoryId || ''} onChange={e => setEditingLine((l: any) => ({ ...l, subcategoryId: e.target.value }))}>
                    <option value="">{UI_STRINGS.appAppBoqRevisionIdPage.selectSubcategory}</option>
                    {getSubcategories(editingLine.categoryId || '').map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.appAppBoqRevisionIdPage.uOM}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <select className="form-control" value={editingLine.uomId || ''} onChange={e => setEditingLine((l: any) => ({ ...l, uomId: e.target.value }))}>
                    <option value="">{UI_STRINGS.appAppBoqRevisionIdPage.selectUOM}</option>
                    {uoms.map((u: any) => <option key={u.id} value={u.id}>{u.code}{UI_STRINGS.common.copyq9aflv}{u.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.appAppBoqRevisionIdPage.quantity}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                  <input type="number" className="form-control" value={editingLine.quantity !== null && editingLine.quantity !== undefined ? editingLine.quantity : ''} onChange={e => setEditingLine((l: any) => ({ ...l, quantity: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.common.location}</label>
                  <input className="form-control" value={editingLine.location || ''} onChange={e => setEditingLine((l: any) => ({ ...l, location: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">{UI_STRINGS.common.drawingReference}</label>
                  <input className="form-control" value={editingLine.drawingReference || ''} onChange={e => setEditingLine((l: any) => ({ ...l, drawingReference: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">{UI_STRINGS.common.remarks}</label>
                <input className="form-control" value={editingLine.remarks || ''} onChange={e => setEditingLine((l: any) => ({ ...l, remarks: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditingLine(null)}>{UI_STRINGS.common.cancel}</button>
              <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? UI_STRINGS.common.saving : UI_STRINGS.common.saveChanges}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal modal-sm">
            <div className="modal-header">
              <span className="modal-title">{UI_STRINGS.appAppBoqRevisionIdPage.rejectBOQRevision}</span>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowRejectModal(false)}>
                <X size={16} />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-muted mb-4">{UI_STRINGS.appAppBoqRevisionIdPage.rejectionReasonIsMandatoryItWillBeRecordedInTheAuditTrailAndDisplayedToTheProjectUser}</p>
              <div className="form-group">
                <label className="form-label">{UI_STRINGS.appAppBoqRevisionIdPage.rejectionReason}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
                <textarea className="form-control" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} placeholder={UI_STRINGS.appAppBoqRevisionIdPage.specifyTechnicalDiscrepanciesOrCorrectionsRequired} autoFocus />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowRejectModal(false)}>{UI_STRINGS.common.cancel}</button>
              <button className="btn btn-danger" onClick={rejectBoq} disabled={!rejectReason.trim()}>{UI_STRINGS.common.confirmRejection}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
