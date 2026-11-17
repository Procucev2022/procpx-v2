'use client';
// src/app/(app)/pr/new/page.tsx - Create Procurement Request from BOQ Baseline
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Send,
  Sparkles,
  AlertCircle,
  Search,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { CostCentreLookupApiResponse, CostCentreLookupPayload, CostCentreLookupOption } from '@app-types/app/api/cost-centres.types';


export default function CreatePrPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState('');
  const [costCentres, setCostCentres] = useState<CostCentreLookupOption[]>([]);
  const [costCentreSearch, setCostCentreSearch] = useState('');
  const [costCentrePage, setCostCentrePage] = useState(1);
  const [costCentreTotal, setCostCentreTotal] = useState(0);
  const [costCentreHasMore, setCostCentreHasMore] = useState(false);
  const costCentreRequestSequence = useRef(0);
  const [boqs, setBoqs] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCostCentreId, setSelectedCostCentreId] = useState('');
  const [selectedBoqId, setSelectedBoqId] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadCostCentres = useCallback(async (pId: string, search = '', page = 1, append = false, preserveSelectedId = '') => {
    const sequence = ++costCentreRequestSequence.current;
    try {
      const query = new URLSearchParams({ projectId: pId, page: String(page), pageSize: '100' });
      if (search.trim()) query.set('search', search.trim());
      const res = await fetch(`/api/cost-centres?${query.toString()}`);
      if (res.ok) {
        const cc = await res.json() as CostCentreLookupApiResponse;
        if (sequence !== costCentreRequestSequence.current) return;
        const payload: CostCentreLookupPayload = cc.data ?? cc;
        const rows = Array.isArray(payload) ? payload : payload.costCentres ?? [];
        const pagination = Array.isArray(payload) ? undefined : payload.pagination;
        setCostCentres((current) => {
          const existing = preserveSelectedId
            ? current.find((item) => item.id === preserveSelectedId && item.projectId === pId)
            : undefined;
          const base = append ? current : existing ? [existing] : [];
          const ids = new Set(base.map((item) => item.id));
          return [...base, ...rows.filter((item) => !ids.has(item.id))];
        });
        setCostCentrePage(page);
        setCostCentreTotal(pagination?.total ?? rows.length);
        setCostCentreHasMore(Boolean(pagination?.hasMore));
        if (!append && !search && rows.length > 0) setSelectedCostCentreId(rows[0].id);
      }
    } catch (e) {
      if (sequence === costCentreRequestSequence.current) console.error(e);
    }
  }, []);

  const loadBoqs = useCallback(async (pId: string) => {
    try {
      const res = await fetch(`/api/boq?projectId=${pId}`);
      if (res.ok) {
        const b = await res.json();
        const list = b.data || b || [];
        setBoqs(list);
        if (list.length > 0) setSelectedBoqId(list[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error(String(res.status));
        const pData = await res.json();
        const list = pData.data || pData || [];
        if (!active) return;
        setProjects(list);
        if (list.length > 0) setSelectedProjectId(list[0].id);
      } catch (error) {
        if (active) setProjectsError(UI_STRINGS.appAppPrNewPage.failedToLoadProjects);
        console.error(error);
      } finally {
        if (active) setProjectsLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      setCostCentres([]);
      setCostCentreSearch('');
      setCostCentrePage(1);
      setCostCentreTotal(0);
      setCostCentreHasMore(false);
      setBoqs([]);
      setSelectedCostCentreId('');
      setSelectedBoqId('');
      void loadCostCentres(selectedProjectId);
      void loadBoqs(selectedProjectId);
    } else {
      setCostCentres([]);
      setBoqs([]);
      setSelectedCostCentreId('');
      setSelectedBoqId('');
    }
  }, [selectedProjectId, loadCostCentres, loadBoqs]);

  const handleCreatePr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !selectedBoqId) {
      setError(UI_STRINGS.appAppPrNewPage.pleaseSelectAProjectAndSourceBOQ);
      return;
    }
    setCreating(true);
    setError('');

    try {
      const selectedBoq = boqs.find(b => b.id === selectedBoqId);
      const revisionId = selectedBoq?.revisions?.[0]?.id;

      const res = await fetch('/api/pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          costCentreId: selectedCostCentreId || null,
          boqId: selectedBoqId,
          revisionId: revisionId || null,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": prTitle.trim() || (selectedBoq ? `${selectedBoq.title || 'Procurement Package'} PR` : 'Commercial PR') }),
          requiredDate: requiredDate || null,
          deliveryLocation: deliveryLocation.trim() || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToCreatePr }));
      }

      await res.json();
      router.push('/pr');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <PageHeader
        title={UI_STRINGS.appAppPrNewPage.createProcurementRequest}
        subtitle={UI_STRINGS.appAppPrNewPage.deriveANewProcurementRequestDirectlyFromAValidatedBOQSourceBaseline}
        backHref="/pr"
        backLabel="← Back to PR Register"
      />

      {/* BOQ Studio Callout */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex justify-between items-center">
        <div>
          <div className="font-semibold text-sm text-slate-900">{UI_STRINGS.appAppPrNewPage.needToPrepareOrModifyStandardLineItemsFirst}</div>
          <div className="text-xs text-slate-500 mt-1">{UI_STRINGS.appAppPrNewPage.useBOQStudioToDownloadStandardBOQRefineSpecificationsWithAIAndEstimateCosts}</div>
        </div>
        <Link href="/boq/studio" className="btn btn-secondary btn-sm flex items-center gap-2">
          <Sparkles size={14} className="text-blue-600" />{UI_STRINGS.appAppPrNewPage.launchBOQStudio}</Link>
      </div>

      {error && (
        <div className="alert alert-error mb-6 flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* PR Form */}
      <form onSubmit={handleCreatePr}>
        <FormSection
          title={UI_STRINGS.appAppPrNewPage.projectCostCentreBaseline}
          subtitle={UI_STRINGS.appAppPrNewPage.selectTheCommercialProjectAndCostAllocationCodeForThisPackage}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">{UI_STRINGS.appAppPrNewPage.project}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
              <select
                className="form-control"
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                disabled={projectsLoading || Boolean(projectsError)}
                required
              >
                <option value="">{projectsError || (projectsLoading ? UI_STRINGS.appAppPrNewPage.loadingProjects : UI_STRINGS.appAppPrNewPage.selectProject)}</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode}{UI_STRINGS.common.copyq9aflv}{p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{UI_STRINGS.common.costCentre2}</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="search"
                  className="form-control"
                  value={costCentreSearch}
                  onChange={e => setCostCentreSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void loadCostCentres(selectedProjectId, costCentreSearch, 1, false, selectedCostCentreId); } }}
                  placeholder={UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  aria-label={UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation}
                  onClick={() => void loadCostCentres(selectedProjectId, costCentreSearch, 1, false, selectedCostCentreId)}
                ><Search size={16} /></button>
              </div>
              <select
                className="form-control"
                value={selectedCostCentreId}
                onChange={e => setSelectedCostCentreId(e.target.value)}
              >
                <option value="">{UI_STRINGS.appAppPrNewPage.selectCostCentre}</option>
                {costCentres.map(cc => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code || cc.costCentreCode}{UI_STRINGS.common.copyq9aflv}{cc.name}
                  </option>
                ))}
              </select>
              {costCentreTotal > costCentres.length && (
                <p className="text-xs text-slate-500 mt-1">
                  {interpolateUiString(UI_STRINGS.appAppCostCentresPage.showingCostCentreCountOfTotal, { loaded: costCentres.length, total: costCentreTotal })}
                </p>
              )}
              {costCentreHasMore && (
                <button type="button" className="text-sm text-blue-600 underline mt-1" onClick={() => void loadCostCentres(selectedProjectId, costCentreSearch, costCentrePage + 1, true)}>
                  {UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres}
                </button>
              )}
            </div>
          </div>
        </FormSection>

        <FormSection
          title={UI_STRINGS.appAppPrNewPage.bOQSpecificationSource}
          subtitle={UI_STRINGS.appAppPrNewPage.linkToTheApprovedOrDraftBOQContainingTheLineItems}
        >
          <div className="form-group">
            <label className="form-label">{UI_STRINGS.appAppPrNewPage.sourceBOQBaseline}<span className="required">{UI_STRINGS.common.copyd1yn99}</span></label>
            <select
              className="form-control"
              value={selectedBoqId}
              onChange={e => setSelectedBoqId(e.target.value)}
              required
            >
              <option value="">{UI_STRINGS.appAppPrNewPage.selectSourceBOQ}</option>
              {boqs.map(b => (
                <option key={b.id} value={b.id}>
                  {b.boqCode}{UI_STRINGS.common.copyq9aflv}{b.title || UI_STRINGS.appAppPrNewPage.bOQBaseline}{UI_STRINGS.common.copy1b3t0c5}{b.status}{UI_STRINGS.common.copyc7zu6c}</option>
              ))}
            </select>
            {boqs.length === 0 && selectedProjectId && (
              <p className="text-xs text-amber-600 mt-2">{UI_STRINGS.appAppPrNewPage.noBOQsFoundForThisProject}{' '}
                <Link href={`/boq/studio?projectId=${selectedProjectId}`} className="text-blue-600 underline">{UI_STRINGS.appAppPrNewPage.createABOQInStudio}</Link>{' '}{UI_STRINGS.appAppPrNewPage.first}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">{UI_STRINGS.appAppPrNewPage.pRTitleSubject}</label>
            <input
              type="text"
              className="form-control"
              value={prTitle}
              onChange={e => setPrTitle(e.target.value)}
              placeholder={UI_STRINGS.appAppPrNewPage.eGElectricalCivilFitoutProcurement}
            />
          </div>
        </FormSection>

        <FormSection
          title={UI_STRINGS.appAppPrNewPage.deliveryProcurementSchedule}
          subtitle={UI_STRINGS.appAppPrNewPage.specifySiteFulfillmentTimelinesAndDestinationStore}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">{UI_STRINGS.appAppPrNewPage.requiredByDate}</label>
              <input
                type="date"
                className="form-control"
                value={requiredDate}
                onChange={e => setRequiredDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">{UI_STRINGS.appAppPrNewPage.deliveryLocation}</label>
              <input
                type="text"
                className="form-control"
                value={deliveryLocation}
                onChange={e => setDeliveryLocation(e.target.value)}
                placeholder={UI_STRINGS.appAppPrNewPage.eGSiteStoreUnit402}
              />
            </div>
          </div>
        </FormSection>

        <div className="flex justify-end gap-3 mt-6">
          <Link href="/pr" className="btn btn-secondary">{UI_STRINGS.common.cancel}</Link>
          <button
            type="submit"
            disabled={creating || !selectedBoqId}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <Send size={15} />
            {creating ? UI_STRINGS.appAppPrNewPage.creatingPR : UI_STRINGS.appAppPrNewPage.createProcurementRequest}
          </button>
        </div>
      </form>
    </div>
  );
}
