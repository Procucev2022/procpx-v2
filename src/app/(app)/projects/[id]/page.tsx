'use client';
// app/(app)/projects/[id]/page.tsx - Standardised Project Detail Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Pencil,
  Upload,
  MapPin,
  Maximize2,
  Briefcase,
  ClipboardCheck,
  Users,
  FileText,
  Folder,
  Activity,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import { PROJECT_DOCUMENT_ACCEPT_ATTRIBUTE, PROJECT_DOCUMENT_CATEGORY_VALUES, PROJECT_DOCUMENT_MAX_BYTES } from '@/lib/project-document.constants';
import type { ProjectDetailState, ProjectDocumentListItem } from '@app-types/app/(app)/projects/[id]/page.types';


function QualityScore({ score }: { score?: number | null }) {
  if (score == null) return <span className="text-muted">{UI_STRINGS.common.copy4s9bsz}</span>;
  const color = score >= 80 ? '#059669' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="quality-score">
      <div className="quality-bar"><div className="quality-fill" style={{ width: `${score}%`, background: color }} /></div>
      <span className="quality-label" style={{ color }}>{score}{UI_STRINGS.common.copy8w4luo}</span>
    </div>
  );
}

function getProjectDocumentCategoryLabel(category: string): string {
  switch (category) {
    case 'ORIGINAL_BOQ': return UI_STRINGS.appApiProjectsIdDocumentsRoute.categoryOriginalBoq;
    case 'DRAWING': return UI_STRINGS.appApiProjectsIdDocumentsRoute.categoryDrawing;
    case 'SPECIFICATION': return UI_STRINGS.appApiProjectsIdDocumentsRoute.categorySpecification;
    default: return UI_STRINGS.appApiProjectsIdDocumentsRoute.categoryOther;
  }
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [loadedProjectId, setLoadedProjectId] = useState<string | null>(null);
  const loading = loadedProjectId !== id;
  const [activeTab, setActiveTab] = useState('overview');
  const [documentsPage, setDocumentsPage] = useState(1);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [documentsError, setDocumentsError] = useState('');
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);
  const [documentCategory, setDocumentCategory] = useState<string>('SPECIFICATION');
  const [uploadingDocument, setUploadingDocument] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/projects/${id}`)
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok || result?.error) {
          console.error(JSON.stringify({ event: 'project.detail_fetch_failed', projectId: id, status: r.status }));
          return null;
        }
        return result;
      })
      .then(d => {
        if (active) {
          setProject(d);
          setDocumentsPage(1);
          setDocumentsError('');
        }
      })
      .catch(() => {
        if (active) {
          setProject(null);
          console.error(JSON.stringify({ event: 'project.detail_fetch_failed', projectId: id }));
        }
      })
      .finally(() => { if (active) setLoadedProjectId(id); });
    return () => { active = false; };
  }, [id]);

  const loadMoreDocuments = async () => {
    if (loadingDocuments || !project) return;
    setLoadingDocuments(true);
    setDocumentsError('');
    const nextPage = documentsPage + 1;
    try {
      const response = await fetch(`/api/projects/${id}/documents?page=${nextPage}`);
      const result = await response.json();
      if (!response.ok || result?.error || !Array.isArray(result?.documents)) {
        setDocumentsError(UI_STRINGS.common.userMessages.failedToFetchProjects);
        console.error(JSON.stringify({ event: 'project.documents_page_fetch_failed', projectId: id, page: nextPage, status: response.status }));
        return;
      }
      setProject((current: ProjectDetailState) => ({
        ...current,
        documents: [
          ...(current.documents || []),
          ...result.documents.filter((document: ProjectDocumentListItem) => !(current.documents || []).some((loaded) => loaded.id === document.id)),
        ],
        _count: { ...current._count, documents: result.total ?? current._count?.documents },
      }));
      setDocumentsPage(nextPage);
    } catch {
      setDocumentsError(UI_STRINGS.common.userMessages.failedToFetchProjects);
      console.error(JSON.stringify({ event: 'project.documents_page_fetch_failed', projectId: id, page: nextPage }));
    } finally {
      setLoadingDocuments(false);
    }
  };

  const uploadProjectDocument = async () => {
    if (!selectedDocumentFile || uploadingDocument) return;
    setUploadingDocument(true);
    setDocumentsError('');
    try {
      const formData = new FormData();
      formData.append('file', selectedDocumentFile);
      formData.append('category', documentCategory);
      const response = await fetch(`/api/projects/${id}/documents`, {
        method: 'POST',
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || result?.error || !result?.id) {
        setDocumentsError(UI_STRINGS.common.userMessages.failedToFetchProjects);
        console.error(JSON.stringify({ event: 'project.document_upload_failed', projectId: id, status: response.status }));
        return;
      }
      setProject((current: ProjectDetailState) => ({
        ...current,
        documents: [result as ProjectDocumentListItem, ...(current.documents || []).filter((document) => document.id !== result.id)],
        _count: { ...current._count, documents: (current._count?.documents || current.documents?.length || 0) + 1 },
      }));
      setSelectedDocumentFile(null);
    } catch {
      setDocumentsError(UI_STRINGS.common.userMessages.failedToFetchProjects);
      console.error(JSON.stringify({ event: 'project.document_upload_failed', projectId: id }));
    } finally {
      setUploadingDocument(false);
    }
  };

  if (loading) return (
    <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
      <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm">{UI_STRINGS.appAppProjectsIdPage.loadingProject}</span>
    </div>
  );

  if (!project || project.error) return (
    <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">{UI_STRINGS.appAppProjectsIdPage.projectNotFoundOrAccessDenied}</div>
  );

  const latestBoq = project.boqs?.[0];
  const latestRevision = latestBoq?.revisions?.[0];

  return (
    <div className="w-full">
      <PageHeader
        title={project.name}
        subtitle={interpolateUiString(UI_STRINGS.appAppProjectsIdPage.projectCodeSectorSectorValue3, { "projectCode": project.projectCode, "sector": project.sector, "value3": project.city ? ` • ${project.city}` : '' })}
        backHref="/projects"
        backLabel="Back to Projects"
        badge={<StatusBadge status={project.status} />}
        actions={
          <div className="flex items-center gap-2.5">
            <Link
              href={`/projects/${id}/edit`}
              className="btn btn-secondary h-[40px] px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Pencil size={14} />{UI_STRINGS.appAppProjectsIdPage.editProject}</Link>
            {latestBoq ? (
              <Link
                href={`/boq/${latestRevision?.id || latestBoq.id}`}
                className="btn btn-primary h-[40px] px-4 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <ClipboardCheck size={14} />{UI_STRINGS.appAppProjectsIdPage.openBOQ}</Link>
            ) : (
              <Link
                href={`/boq/upload?projectId=${id}`}
                className="btn btn-primary h-[40px] px-4 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs"
              >
                <Upload size={14} />{UI_STRINGS.common.uploadBOQ}</Link>
            )}
          </div>
        }
      />

      {/* Summary strip */}
      <div className="flex items-center gap-4 py-3 px-4 bg-white border border-slate-200 rounded-xl mb-6 shadow-2xs flex-wrap text-xs text-slate-600">
        <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
            {project.projectCode}
          </span>
          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
            {project.sector}
          </span>
        </div>
        {project.city && (
          <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
            <MapPin size={14} className="text-slate-400" />
            <span>{project.city}{project.state ? interpolateUiString(UI_STRINGS.appAppProjectsIdPage.state, { "state": project.state }) : ''}</span>
          </span>
        )}
        {project.areaSqFt && (
          <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium font-mono">
            <Maximize2 size={14} className="text-slate-400" />
            <span>{project.areaSqFt.toLocaleString(I18N_CONFIG.defaultLocale)}{UI_STRINGS.appAppProjectsIdPage.sqFt}</span>
          </span>
        )}
        {project.costCentre && (
          <span className="inline-flex items-center gap-1.5 text-slate-700 font-medium font-mono">
            <Briefcase size={14} className="text-slate-400" />
            <span>{project.costCentre}</span>
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-6 overflow-x-auto pb-px">
        {['overview', 'boq', 'team', 'documents', 'activity'].map(tab => (
          <button
            key={tab}
            type="button"
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab
                ? 'border-[#0f52ba] text-[#0f52ba] bg-blue-50/40 rounded-t-lg'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
            }`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        {['benchmark', 'rfqs', 'quotes', 'ppo'].map(tab => (
          <div key={tab} className="px-4 py-2.5 text-sm font-medium text-slate-400 cursor-not-allowed opacity-50 flex items-center gap-1.5 whitespace-nowrap">
            <span>{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
            <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded font-mono">{UI_STRINGS.appAppProjectsIdPage.soon}</span>
          </div>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="form-grid">
          <div className="card">
            <div className="card-header"><span className="card-title">{UI_STRINGS.appAppProjectsIdPage.projectDetails}</span></div>
            <div className="card-body">
              {[
                ['Project Code', project.projectCode],
                ['Sector', project.sector],
                ['Type', project.projectType?.replace(/_/g, ' ')],
                ['City', project.city],
                ['State', project.state],
                ['Country', project.country],
                ['Area', project.areaSqFt ? `${project.areaSqFt.toLocaleString()} Sq Ft` : '—'],
                ['Cost Centre', project.costCentre],
                ['Project Owner', project.projectOwner],
                ['Budget', project.budget ? `${project.currency} ${project.budget.toLocaleString()}` : '—'],
                ['Business Unit', project.businessUnit],
                ['Created', new Date(project.createdAt).toLocaleDateString()],
              ].map(([label, value]) => value ? (
                <div key={label as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span className="text-muted" style={{ fontSize: 12 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
                </div>
              ) : null)}
            </div>
          </div>
          <div>
            {/* BOQ Summary */}
            <div className="card mb-4">
              <div className="card-header">
                <span className="card-title">{UI_STRINGS.appAppProjectsIdPage.bOQSummary}</span>
                {latestRevision && <Link href={`/boq/${latestRevision.id}`} className="btn btn-sm btn-secondary">{UI_STRINGS.appAppProjectsIdPage.openBOQ2}</Link>}
              </div>
              <div className="card-body">
                {!latestBoq ? (
                  <div className="empty-state" style={{ padding: 24 }}>
                    <div className="empty-state-icon">
                      <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
                    </div>
                    <div className="empty-title">{UI_STRINGS.appAppProjectsIdPage.noBOQYet}</div>
                    <Link href={`/boq/upload?projectId=${id}`} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>{UI_STRINGS.common.uploadBOQ2}</Link>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="text-muted">{UI_STRINGS.common.status}</span>
                      <StatusBadge status={latestBoq.status} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="text-muted">{UI_STRINGS.common.revision}</span>
                      <span className="font-mono">{latestRevision?.revisionCode || UI_STRINGS.common.copy4s9bsz}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="text-muted">{UI_STRINGS.common.totalLines}</span>
                      <span style={{ fontWeight: 600 }}>{latestRevision?.totalLines || 0}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="text-muted">{UI_STRINGS.common.qualityScore}</span>
                      <div style={{ width: 150 }}><QualityScore score={latestRevision?.qualityScore} /></div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Revisions */}
            {latestBoq?.revisions?.length > 0 && (
              <div className="card">
                <div className="card-header"><span className="card-title">{UI_STRINGS.appAppProjectsIdPage.bOQRevisions}</span></div>
                {(latestBoq._count?.revisions || 0) > latestBoq.revisions.length && (
                  <p className="px-4 pt-3 text-xs text-slate-500">
                    {interpolateUiString(UI_STRINGS.appAppProjectsIdPage.showingRevisionsOfTotal, { loaded: latestBoq.revisions.length, total: latestBoq._count.revisions })}
                  </p>
                )}
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>{UI_STRINGS.common.rev}</th><th>{UI_STRINGS.common.status}</th><th>{UI_STRINGS.common.lines3}</th><th>{UI_STRINGS.common.score}</th><th></th></tr></thead>
                    <tbody>
                      {latestBoq.revisions.map((rev: any) => (
                        <tr key={rev.id}>
                          <td><span className="badge badge-info font-mono">{rev.revisionCode}</span></td>
                          <td><StatusBadge status={rev.status} /></td>
                          <td>{rev.totalLines}</td>
                          <td><QualityScore score={rev.qualityScore} /></td>
                          <td><Link href={`/boq/${rev.id}`} className="btn btn-sm btn-ghost">{UI_STRINGS.appAppProjectsIdPage.open}</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BOQ Tab */}
      {activeTab === 'boq' && (
        <div>
          {!latestRevision ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-state-icon">
                  <ClipboardCheck size={36} color="#94a3b8" strokeWidth={1.5} />
                </div>
                <div className="empty-title">{UI_STRINGS.appAppProjectsIdPage.noBOQUploadedYet}</div>
                <Link href={`/boq/upload?projectId=${id}`} className="btn btn-primary" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={14} />{UI_STRINGS.common.uploadBOQ}</Link>
              </div>
            </div>
          ) : (
            <div className="flex gap-3" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
              <Link href={`/boq/${latestRevision.id}`} className="btn btn-primary">{UI_STRINGS.common.openBOQWorkspace}</Link>
              <Link href={`/boq/upload?projectId=${id}&boqId=${latestBoq.id}`} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Upload size={14} />{UI_STRINGS.appAppProjectsIdPage.uploadNewRevision}</Link>
            </div>
          )}
        </div>
      )}

      {/* Team Tab */}
      {activeTab === 'team' && (
        <div className="card">
          <div className="card-header"><span className="card-title">{UI_STRINGS.appAppProjectsIdPage.projectTeam}</span></div>
          {(project._count?.team || 0) > (project.team?.length || 0) && (
            <p className="px-4 pt-3 text-xs text-slate-500">
              {interpolateUiString(UI_STRINGS.appAppProjectsIdPage.showingProjectTeamOfTotal, { loaded: project.team.length, total: project._count.team })}
            </p>
          )}
          {!project.team?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Users size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppProjectsIdPage.noTeamMembersAssigned}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>{UI_STRINGS.common.name}</th><th>{UI_STRINGS.common.email}</th><th>{UI_STRINGS.appAppProjectsIdPage.systemRole}</th><th>{UI_STRINGS.appAppProjectsIdPage.projectRole}</th><th>{UI_STRINGS.appAppProjectsIdPage.assigned}</th></tr></thead>
                <tbody>
                  {project.team?.map((t: any) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.user?.name}</td>
                      <td className="text-muted">{t.user?.email}</td>
                      <td><span className="badge badge-info">{t.user?.role}</span></td>
                      <td>{t.projectRole}</td>
                      <td className="text-muted">{new Date(t.assignedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <FileText size={18} />{UI_STRINGS.appAppProjectsIdPage.projectDocumentRepository}{project._count?.documents ?? project.documents?.length ?? 0}{UI_STRINGS.common.copyc7zu6c}</span>
          </div>
          <div className="px-4 pt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              {UI_STRINGS.appAppProjectsIdPage.chooseDocumentFile}
              <input
                type="file"
                accept={PROJECT_DOCUMENT_ACCEPT_ATTRIBUTE}
                onChange={(event) => setSelectedDocumentFile(event.currentTarget.files?.[0] || null)}
                disabled={uploadingDocument}
                aria-label={UI_STRINGS.appAppProjectsIdPage.chooseDocumentFile}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              {UI_STRINGS.appAppProjectsIdPage.documentCategory}
              <select value={documentCategory} onChange={(event) => setDocumentCategory(event.currentTarget.value)} disabled={uploadingDocument}>
                {PROJECT_DOCUMENT_CATEGORY_VALUES.map((category) => <option key={category} value={category}>{getProjectDocumentCategoryLabel(category)}</option>)}
              </select>
            </label>
            <button className="btn btn-sm btn-primary" onClick={() => void uploadProjectDocument()} disabled={!selectedDocumentFile || uploadingDocument}>
              {uploadingDocument ? UI_STRINGS.appAppProjectsIdPage.uploadingDocument : UI_STRINGS.appAppProjectsIdPage.uploadDocument}
            </button>
            <span className="text-xs text-slate-500">{interpolateUiString(UI_STRINGS.appAppProjectsIdPage.supportedFileTypesAndMaxSize, { maxMb: PROJECT_DOCUMENT_MAX_BYTES / (1024 * 1024) })}</span>
          </div>
          {(project._count?.documents || 0) > 0 && (
            <p className="px-4 pt-3 text-xs text-slate-500">
              {interpolateUiString(UI_STRINGS.appAppProjectsIdPage.showingDocumentsOfTotal, { loaded: project.documents?.length || 0, total: project._count.documents })}
            </p>
          )}
          {documentsError && <p className="px-4 pt-3 text-sm text-rose-700" role="alert">{documentsError}</p>}
          {!project.documents?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Folder size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppProjectsIdPage.noDocumentsUploadedYet}</div>
              <div className="empty-desc">{UI_STRINGS.appAppProjectsIdPage.uploadArchitecturalDrawingsSpecificationsOrOriginalBOQSpreadsheets}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{UI_STRINGS.appAppProjectsIdPage.documentName}</th>
                    <th>{UI_STRINGS.common.category2}</th>
                    <th>{UI_STRINGS.common.type}</th>
                    <th>{UI_STRINGS.appAppProjectsIdPage.fileSize}</th>
                    <th>{UI_STRINGS.appAppProjectsIdPage.uploadedBy}</th>
                    <th>{UI_STRINGS.appAppProjectsIdPage.uploadedDate}</th>
                    <th>{UI_STRINGS.common.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {project.documents.map((doc: any) => (
                    <tr key={doc.id}>
                      <td style={{ fontWeight: 600 }}>
                        <span style={{ marginRight: 6, display: 'inline-flex', verticalAlign: 'middle' }}>
                          <FileText size={14} color="#64748b" />
                        </span>
                        {doc.name}
                      </td>
                      <td>
                        <span className={`badge ${doc.category === 'ORIGINAL_BOQ' ? 'badge-submitted' : doc.category === 'DRAWING' ? 'badge-info' : 'badge-draft'}`}>
                          {doc.category || UI_STRINGS.appAppProjectsIdPage.oTHER}
                        </span>
                      </td>
                      <td className="text-muted text-sm">{doc.fileType?.split('/').pop() || doc.fileType}</td>
                      <td>
                        {doc.fileSize ? interpolateUiString(UI_STRINGS.appAppProjectsIdPage.roundKB, { "round": Math.round(doc.fileSize / 1024) }) : UI_STRINGS.common.copy4s9bsz}
                      </td>
                      <td className="text-muted">{doc.uploadedBy?.slice(0, 8) || UI_STRINGS.common.system}</td>
                      <td className="text-muted">{new Date(doc.uploadedAt).toLocaleDateString()}</td>
                      <td><a className="btn btn-sm btn-ghost" href={`/api/projects/${id}/documents/${doc.id}`} download>{UI_STRINGS.appAppProjectsIdPage.downloadDocument}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(project.documents?.length || 0) < (project._count?.documents || 0) && (
            <div className="p-4 text-center">
              <button type="button" className="btn btn-secondary" onClick={() => void loadMoreDocuments()} disabled={loadingDocuments}>
                {loadingDocuments ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Activity size={18} />{UI_STRINGS.appAppProjectsIdPage.auditActivity}</span>
          </div>
          {!project.auditLogs?.length ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Activity size={36} color="#94a3b8" strokeWidth={1.5} />
              </div>
              <div className="empty-title">{UI_STRINGS.appAppProjectsIdPage.noActivityYet}</div>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>{UI_STRINGS.common.action}</th><th>{UI_STRINGS.common.description}</th><th>{UI_STRINGS.common.user}</th><th>{UI_STRINGS.common.time}</th></tr></thead>
                <tbody>
                  {project.auditLogs?.map((log: any) => (
                    <tr key={log.id}>
                      <td><span className="badge badge-info">{log.action}</span></td>
                      <td>{log.description}</td>
                      <td>{log.user?.name || log.user?.email || UI_STRINGS.common.copy4s9bsz}</td>
                      <td className="text-muted">{new Date(log.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
