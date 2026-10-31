'use client';
// src/app/(app)/pr/new/page.tsx - Create Procurement Request from BOQ Baseline
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Send,
  Building2,
  FileSpreadsheet,
  Calendar,
  MapPin,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Layers,
  AlertCircle,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function CreatePrPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [costCentres, setCostCentres] = useState<any[]>([]);
  const [boqs, setBoqs] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedCostCentreId, setSelectedCostCentreId] = useState('');
  const [selectedBoqId, setSelectedBoqId] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      setCostCentres([]);
      setBoqs([]);
      setSelectedCostCentreId('');
      setSelectedBoqId('');
      loadCostCentres(selectedProjectId);
      loadBoqs(selectedProjectId);
    } else {
      setCostCentres([]);
      setBoqs([]);
      setSelectedCostCentreId('');
      setSelectedBoqId('');
    }
  }, [selectedProjectId]);

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const pData = await res.json();
        const list = pData.data || pData || [];
        setProjects(list);
        if (list.length > 0) {
          setSelectedProjectId(list[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadCostCentres = async (pId: string) => {
    try {
      const res = await fetch(`/api/cost-centres?projectId=${pId}`);
      if (res.ok) {
        const cc = await res.json();
        setCostCentres(cc);
        if (cc.length > 0) setSelectedCostCentreId(cc[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadBoqs = async (pId: string) => {
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
  };

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
                required
              >
                <option value="">{UI_STRINGS.appAppPrNewPage.selectProject}</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.projectCode}{UI_STRINGS.common.copyq9aflv}{p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{UI_STRINGS.common.costCentre2}</label>
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
