/** @jest-environment jsdom */
import { interpolateUiString, uiStringPattern } from '@/lib/i18n';

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProjectDetailPage from '../src/app/(app)/projects/[id]/page';
import { useParams } from 'next/navigation';
import { UI_STRINGS } from "@/lib/ui-strings.constants";


jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => require('react').createElement('a', { ...props, href }, children),
}));
jest.mock('next/navigation', () => ({ useParams: jest.fn() }));

const fetchMock = jest.fn();
const useParamsMock = useParams as jest.Mock;
const originalFetch = global.fetch;
const response = (body: unknown, ok = true) => ({ ok, json: jest.fn().mockResolvedValue(body) });

describe('project detail workspace', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock.mockReset();
    useParamsMock.mockReturnValue({ id: 'project-1' });
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue(response({}));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows loading and then the access-denied message for a missing project', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: 'not found' }));
    render(<ProjectDetailPage />);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.loadingProject))).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1');
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.projectNotFoundOrAccessDenied))).toBeInTheDocument();
  });

  it('renders project details, latest BOQ revisions, and all information tabs', async () => {
    fetchMock.mockResolvedValueOnce(response({
      id: 'project-1', name: 'North Retail Fitout', projectCode: 'NR-001', sector: 'Retail', status: 'ACTIVE',
      projectType: 'RETAIL_FITOUT', city: 'Mumbai', state: 'Maharashtra', country: 'India', areaSqFt: 15000,
      costCentre: 'CC-001', projectOwner: 'Project Owner', budget: 125000, currency: 'INR', businessUnit: 'Retail Ops', createdAt: '2026-10-01',
      boqs: [{ id: 'boq-1', status: 'APPROVED', revisions: [
        { id: 'rev-2', revisionCode: 'REV-2', revisionNumber: 2, status: 'APPROVED', totalLines: 18, qualityScore: 92 },
        { id: 'rev-1', revisionCode: 'REV-1', revisionNumber: 1, status: 'SUBMITTED', totalLines: 16, qualityScore: 65 },
        { id: 'rev-0', revisionCode: 'REV-0', revisionNumber: 0, status: 'DRAFT', totalLines: 3, qualityScore: 35 },
        { id: 'rev-null', revisionCode: 'REV-NULL', revisionNumber: 0, status: 'DRAFT', totalLines: 0, qualityScore: null },
      ] }],
      team: [{ id: 'team-1', projectRole: 'PROJECT_MANAGER', assignedAt: '2026-10-02', user: { name: 'Jamie Chen', email: 'jamie@example.test', role: 'PROJECT_USER' } }],
      documents: [
        { id: 'doc-1', name: 'Original BOQ', category: 'ORIGINAL_BOQ', fileType: 'application/pdf', fileSize: 2048, uploadedBy: '123456789', uploadedAt: '2026-10-03', filePath: 'documents/original.pdf' },
        { id: 'doc-2', name: 'Site plan', category: 'DRAWING', fileType: 'image/png', fileSize: null, uploadedBy: null, uploadedAt: '2026-10-04', filePath: 'documents/site.png' },
        { id: 'doc-3', name: 'Notes', category: null, fileType: 'text/plain', fileSize: 1024, uploadedBy: '', uploadedAt: '2026-10-05', filePath: 'documents/notes.txt' },
      ],
      auditLogs: [
        { id: 'audit-1', action: 'PROJECT_UPDATED', description: 'Project details changed', createdAt: '2026-10-06', user: { name: 'Auditor', email: 'auditor@example.test' } },
        { id: 'audit-2', action: 'BOQ_APPROVED', description: 'Approved baseline', createdAt: '2026-10-07', user: { email: 'reviewer@example.test' } },
        { id: 'audit-3', action: 'NOTE_ADDED', description: 'No user attached', createdAt: '2026-10-08', user: null },
      ],
    }));
    render(<ProjectDetailPage />);

    expect(await screen.findByText('North Retail Fitout')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.editProject) })).toHaveAttribute('href', '/projects/project-1/edit');
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.openBOQ2) })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.openBOQ2) })[0]).toHaveAttribute('href', '/boq/rev-2');
    expect(screen.getAllByText('NR-001')).toHaveLength(2);
    expect(screen.getAllByText('15,000 Sq Ft')).toHaveLength(2);
    expect(screen.getByText('RETAIL FITOUT')).toBeInTheDocument();
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.budget)).parentElement).toHaveTextContent(/INR.*\d/);
    expect(screen.getAllByText('REV-2')).toHaveLength(2);
    expect(screen.getAllByText('92%')).toHaveLength(2);
    expect(screen.getByText('65%')).toBeInTheDocument();
    expect(screen.getByText('35%')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appAppProjectsNewPage.projectOwner))).toHaveLength(2);
    expect(screen.getByText(uiStringPattern(UI_STRINGS.common.benchmark)).parentElement).toHaveTextContent(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.soon));

    fireEvent.click(screen.getByRole('button', { name: 'Boq' }));
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.common.bOQWorkspace) })).toHaveAttribute('href', '/boq/rev-2');
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.uploadNewRevision) })).toHaveAttribute('href', '/boq/upload?projectId=project-1&boqId=boq-1');
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.getByText('Jamie Chen')).toBeInTheDocument();
    expect(screen.getByText('PROJECT_MANAGER')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(screen.getByText('Project Document Repository (3)')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.appApiProjectsIdDocumentsRoute.categoryOriginalBoq))).toHaveLength(2);
    expect(screen.getByText('2 KB')).toBeInTheDocument();
    expect(screen.getAllByText(uiStringPattern(UI_STRINGS.common.system))).toHaveLength(2);
    expect(screen.getByText('Site plan').closest('tr')).toHaveTextContent('DRAWING');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.componentsProcurementCommercialWorkspace.notes)).closest('tr')).toHaveTextContent(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.oTHER));
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.downloadDocument) })[0]).toHaveAttribute('href', '/api/projects/project-1/documents/doc-1');
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(screen.getByText('Project details changed')).toBeInTheDocument();
    expect(screen.getByText('reviewer@example.test')).toBeInTheDocument();
    expect(screen.getByText('No user attached')).toBeInTheDocument();
  });

  it('shows empty BOQ, team, document and audit states without submitting an empty upload', async () => {
    const project = {
      id: 'project-1', name: 'Minimal Project', projectCode: 'MIN-1', sector: 'Civil', status: 'PLANNING',
      createdAt: '2026-10-01', boqs: [], team: [], documents: [], auditLogs: [],
    };
    fetchMock.mockResolvedValueOnce(response(project));
    render(<ProjectDetailPage />);
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noBOQYet))).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.common.uploadBOQ2) })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: uiStringPattern(UI_STRINGS.common.uploadBOQ2) })[0]).toHaveAttribute('href', '/boq/upload?projectId=project-1');
    fireEvent.click(screen.getByRole('button', { name: 'Boq' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noBOQUploadedYet))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Team' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noTeamMembersAssigned))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noDocumentsUploadedYet))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.uploadDocument) }));
    expect(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.uploadDocument) })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noActivityYet))).toBeInTheDocument();
  });

  it('uploads a selected file and displays the returned document without a synthetic refresh', async () => {
    const base = { id: 'project-1', name: 'Document Project', projectCode: 'DOC-1', sector: 'Retail', status: 'ACTIVE', createdAt: '2026-10-01', boqs: [], documents: [], team: [], auditLogs: [] };
    fetchMock
      .mockResolvedValueOnce(response(base))
      .mockResolvedValueOnce(response({ id: 'doc', projectId: 'project-1', name: 'Plan.pdf', category: 'SPECIFICATION', fileType: 'application/pdf', fileSize: 3, uploadedBy: 'user-1', uploadedAt: '2026-10-29' }));
    render(<ProjectDetailPage />);
    await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noBOQYet));
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(await screen.findByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noDocumentsUploadedYet))).toBeInTheDocument();
    const file = new File(['pdf'], 'Plan.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.chooseDocumentFile)), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.uploadDocument) }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/projects/project-1/documents', expect.objectContaining({
      method: 'POST', body: expect.any(FormData),
    }));
    expect(await screen.findByText('Project Document Repository (1)')).toBeInTheDocument();
    expect(screen.getByText('Plan.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.downloadDocument) })).toHaveAttribute('href', '/api/projects/project-1/documents/doc');
  });

  it('uses a BOQ ID when a project has no revisions and renders nullable project values', async () => {
    fetchMock.mockResolvedValueOnce(response({
      id: 'project-1', name: 'Legacy Project', projectCode: 'LEG-1', sector: 'Other', status: 'ACTIVE', createdAt: '2026-10-01',
      projectType: null, city: '', state: '', country: '', areaSqFt: 0, costCentre: '', budget: 0,
      boqs: [{ id: 'boq-legacy', status: 'DRAFT', revisions: [] }], team: [], documents: [], auditLogs: [],
    }));
    render(<ProjectDetailPage />);
    expect(await screen.findByText('Legacy Project')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: uiStringPattern(UI_STRINGS.appAppProjectsIdPage.openBOQ2) })).toHaveAttribute('href', '/boq/boq-legacy');
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.bOQSummary))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Boq' }));
    expect(screen.getByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.noBOQUploadedYet))).toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppProjectsIdPage.sqFt))).not.toBeInTheDocument();
    expect(screen.queryByText(uiStringPattern(UI_STRINGS.appAppProjectsNewPage.projectOwner))).not.toBeInTheDocument();
  });

  it('loads the next document page and reports a failed page read', async () => {
    const project = {
      id: 'project-1', name: 'Paged Project', projectCode: 'PAGE-1', sector: 'Retail', status: 'ACTIVE', createdAt: '2026-10-01',
      boqs: [], team: [], _count: { documents: 2 }, documents: [
        { id: 'doc-1', name: 'First.pdf', category: 'SPECIFICATION', fileType: 'application/pdf', uploadedAt: '2026-10-01' },
      ], auditLogs: [],
    };
    fetchMock
      .mockResolvedValueOnce(response(project))
      .mockResolvedValueOnce(response({ documents: [
        { id: 'doc-2', name: 'Second.pdf', category: 'DRAWING', fileType: 'application/pdf', uploadedAt: '2026-10-02' },
      ], total: 3, page: 2, pageSize: 50, hasMore: true }));
    render(<ProjectDetailPage />);
    await screen.findByText('Paged Project');
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(screen.getByText(uiStringPattern(interpolateUiString(UI_STRINGS.appAppProjectsIdPage.showingDocumentsOfTotal, { loaded: 1, total: 2 })))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByText('Second.pdf')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith('/api/projects/project-1/documents?page=2');

    fetchMock.mockResolvedValueOnce(response({ documents: [], total: 3 }, false));
    fireEvent.click(screen.getByRole('button', { name: uiStringPattern(UI_STRINGS.common.loadMore) }));
    expect(await screen.findByRole('alert')).toHaveTextContent(UI_STRINGS.common.userMessages.failedToFetchProjects);
  });
});
