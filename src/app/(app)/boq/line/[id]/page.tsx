'use client';
// app/(app)/boq/line/[id]/page.tsx - Dedicated Enterprise Read-Only BOQ Line Item Detail View
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function BoqLineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const lineId = params?.id as string;

  const [line, setLine] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSpec, setCopiedSpec] = useState(false);

  useEffect(() => {
    if (!lineId) return;
    fetchLineDetail();
  }, [lineId]);

  const fetchLineDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/boq/lines/${lineId}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToLoadLineItemDetails }));
      }
      setLine(data.data?.line || data.line);
    } catch (err: any) {
      setError(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anUnexpectedErrorOccurred }));
    } finally {
      setLoading(false);
    }
  };

  const handleCopySpec = () => {
    if (!line?.specification) return;
    navigator.clipboard.writeText(line.specification);
    setCopiedSpec(true);
    setTimeout(() => setCopiedSpec(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontSize: 14, color: '#64748b' }}>{UI_STRINGS.appAppBoqLineIdPage.loadingLineItemDetails}</div>
      </div>
    );
  }

  if (error || !line) {
    return (
      <div style={{ maxWidth: 800, margin: '40px auto', padding: 24 }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 8,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={36} color="#dc2626" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>{UI_STRINGS.appAppBoqLineIdPage.lineItemNotFound}</h2>
          <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 20 }}>
            {error || UI_STRINGS.appAppBoqLineIdPage.theRequestedBOQLineItemDoesNotExistOrYouDoNotHavePermissionToViewIt}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.back()}
          >
            <ArrowLeft size={14} />{UI_STRINGS.appAppBoqLineIdPage.goBack}</button>
        </div>
      </div>
    );
  }

  const boq = line.revision?.boq;
  const project = boq?.project;
  const costCentre = boq?.costCentre;
  const returnUrl = boq?.id ? `/boq/studio?id=${boq.id}` : line.boqRevisionId ? `/boq/${line.boqRevisionId}` : '/boq';

  let validationMessagesList: any[] = [];
  if (line.validationMessages) {
    try {
      validationMessagesList = JSON.parse(line.validationMessages);
    } catch {
      validationMessagesList = [];
    }
  }

  const formattedAiTotal = line.aiTotalCost
    ? line.aiTotalCost
    : line.aiUnitCost && line.quantity
    ? line.aiUnitCost * line.quantity
    : null;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: 48 }}>
      <PageHeader
        breadcrumbs={[
          { label: UI_STRINGS.common.bOQWorkspace, href: '/boq' },
          { label: interpolateUiString(UI_STRINGS.common.value1, { "value1": boq?.boqCode || UI_STRINGS.componentsPrDetailModal.originatingBOQ }), href: returnUrl },
          { label: interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.lineLineNumber, { "lineNumber": line.lineNumber }) },
        ]}
        title={interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.lineItemLineNumberValue2, { "lineNumber": line.lineNumber, "value2": line.standardDescription || line.originalDescription })}
        description={interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.itemSpecificationAndCommercialCostBreakdownForBOQValue1RevValue2, { "value1": boq?.boqCode || '', "value2": line.revision?.revisionCode || UI_STRINGS.common.r0 })}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={returnUrl} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} />{UI_STRINGS.appAppBoqLineIdPage.returnToBOQ}</Link>
          </div>
        }
      />

      {/* Top Banner Status Bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.lineItemCode}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1e40af', marginTop: 4 }}>{UI_STRINGS.common.copyak280i}{line.lineNumber} {line.itemCode ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.itemCode, { "itemCode": line.itemCode }) : ''}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.common.rev}{line.revision?.revisionCode || UI_STRINGS.common.r0}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.validationStatus}</div>
          <div style={{ marginTop: 6 }}>
            <StatusBadge status={line.validationStatus || 'VALID'} />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {validationMessagesList.length === 0 ? UI_STRINGS.appAppBoqLineIdPage.ruleCompliant : interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.lengthDiagnosticMessages, { "length": validationMessagesList.length })}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.quantityUOM}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
            {line.quantity !== null && line.quantity !== undefined ? line.quantity.toLocaleString() : UI_STRINGS.common.copy4s9bsz}{' '}
            <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
              {line.uom?.code || line.uomRaw || UI_STRINGS.common.nOS}
            </span>
          </div>
          {line.uomRaw && line.uom?.code && line.uomRaw !== line.uom.code && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppBoqLineIdPage.raw}{line.uomRaw}</div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.totalBenchmark}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {formattedAiTotal ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": formattedAiTotal.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {line.aiUnitCost ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.rateToLocaleString, { "toLocaleString": line.aiUnitCost.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.appAppBoqLineIdPage.noUnitRate}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Item Identification & Descriptions */}
          <Card title={UI_STRINGS.appAppBoqLineIdPage.itemDescriptionEngineeringSpecification}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{UI_STRINGS.appAppBoqLineIdPage.standardDescription}</label>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginTop: 4 }}>
                  {line.standardDescription || line.originalDescription}
                </div>
              </div>

              {line.standardDescription && line.standardDescription !== line.originalDescription && (
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{UI_STRINGS.appAppBoqLineIdPage.originalUploadedDescription}</label>
                  <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
                    {line.originalDescription}
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>{UI_STRINGS.appAppBoqLineIdPage.completeSpecification}</label>
                  {line.specification && (
                    <button
                      type="button"
                      onClick={handleCopySpec}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {copiedSpec ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                      {copiedSpec ? UI_STRINGS.common.copied : UI_STRINGS.common.copy}
                    </button>
                  )}
                </div>

                {line.specification ? (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label={UI_STRINGS.appAppBoqLineIdPage.itemSpecification}
                    style={{
                      maxHeight: 280,
                      overflowY: 'auto',
                      padding: 14,
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 6,
                      fontSize: 13,
                      lineHeight: 1.6,
                      color: '#0f172a',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {line.specification}
                  </div>
                ) : (
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>{UI_STRINGS.appAppBoqLineIdPage.noTechnicalSpecificationTextProvidedForThisLine}</div>
                )}
              </div>

              {/* Attributes Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                  paddingTop: 12,
                  borderTop: '1px solid #f1f5f9',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.locationArea}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.location || UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.brandMake}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.brand || UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.model}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.model || UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.materialGrade}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {[line.material, line.grade].filter(Boolean).join(' • ') || UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.drawingReference}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.drawingReference || UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.remarks}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.remarks || UI_STRINGS.common.copy4s9bsz}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Commercial & Cost Intelligence */}
          <Card title={UI_STRINGS.appAppBoqLineIdPage.commercialRateBreakdownBenchmarkDetails}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}
            >
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.unitBenchmarkCost}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', marginTop: 4 }}>
                  {line.aiUnitCost ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": line.aiUnitCost.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppBoqLineIdPage.per}{line.uom?.code || line.uomRaw || UI_STRINGS.common.unit}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.totalBenchmarkValue}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', marginTop: 4 }}>
                  {formattedAiTotal ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": formattedAiTotal.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppBoqLineIdPage.extendedQuantityValue}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.benchmarkSource}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                  {line.costSource || UI_STRINGS.appAppBoqLineIdPage.engineeredCost}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.methodValue, { value: line.costMethod || UI_STRINGS.common.standard })}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.confidenceEligibility}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginTop: 4 }}>
                  {line.costConfidence ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.roundConfidence, { "round": Math.round(line.costConfidence * 100) }) : UI_STRINGS.appAppBoqLineIdPage.verifiedBaseline}
                </div>
                <div style={{ fontSize: 11, color: line.benchmarkEligible ? '#059669' : '#d97706', marginTop: 2 }}>
                  {line.benchmarkEligible ? UI_STRINGS.appAppBoqLineIdPage.benchmarkEligible : UI_STRINGS.appAppBoqLineIdPage.nonBenchmark}
                </div>
              </div>
            </div>

            {/* AI Costing — Line-Item Cost Breakdown Table */}
            {line.aiUnitCost ? (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppBoqLineIdPage.lineItemCostBreakdown}</h4>
                    <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppBoqLineIdPage.reconciledEngineeringEstimateBreakdownPer}{line.uom?.code || line.uomRaw || UI_STRINGS.common.unit}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #bfdbfe' }}>{UI_STRINGS.appAppBoqLineIdPage.eSTIMATENOTAWARDEDRATE}</span>
                </div>

                {line.costBreakdown ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>{UI_STRINGS.appAppBoqLineIdPage.costComponent}</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>{UI_STRINGS.common.description}</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>{UI_STRINGS.appAppBoqLineIdPage.share}</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>{UI_STRINGS.common.unitRate}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppBoqLineIdPage.materialCost}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{UI_STRINGS.appAppBoqLineIdPage.estimatedMaterialComponentPerUOM}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.materialPercent}{UI_STRINGS.common.copy8w4luo}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{UI_STRINGS.common.copytfdhmk}{line.costBreakdown.materialCost.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppBoqLineIdPage.labourCost}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{UI_STRINGS.appAppBoqLineIdPage.estimatedLabourComponentPerUOM}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.labourPercent}{UI_STRINGS.common.copy8w4luo}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{UI_STRINGS.common.copytfdhmk}{line.costBreakdown.labourCost.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppBoqLineIdPage.otherCharges}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{UI_STRINGS.appAppBoqLineIdPage.applicableEquipmentTransportWastageOrSupportedCharges}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.otherChargesPercent}{UI_STRINGS.common.copy8w4luo}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{UI_STRINGS.common.copytfdhmk}{line.costBreakdown.otherCharges.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>{UI_STRINGS.appAppBoqLineIdPage.contractorMargin}</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>{UI_STRINGS.appAppBoqLineIdPage.estimatedContractorMarginComponent}{line.costBreakdown.contractorMarginPercent}{UI_STRINGS.appAppBoqLineIdPage.onDirectCostBase}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.contractorMarginPercent}{UI_STRINGS.common.copy8w4luo}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{UI_STRINGS.common.copytfdhmk}{line.costBreakdown.contractorMargin.toFixed(2)}</td>
                        </tr>
                        <tr style={{ background: '#f0fdf4', borderTop: '2px solid #bbf7d0', fontWeight: 700 }}>
                          <td style={{ padding: '9px 12px', color: '#047857' }}>{UI_STRINGS.common.totalAIUnitCost}</td>
                          <td style={{ padding: '9px 12px', color: '#065f46' }}>{UI_STRINGS.appAppBoqLineIdPage.sumOfApplicableDirectComponentsContractorMargin}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#047857' }}>{UI_STRINGS.appAppBoqLineIdPage.copyd7e8u3}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#047857', fontSize: 13 }}>{UI_STRINGS.common.copytfdhmk}{line.costBreakdown.aiUnitCost.toFixed(2)}</td>
                        </tr>
                        <tr style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0', fontWeight: 700 }}>
                          <td style={{ padding: '9px 12px', color: '#0f172a' }}>{UI_STRINGS.common.aILineTotal}</td>
                          <td style={{ padding: '9px 12px', color: '#64748b', fontWeight: 500 }}>
                            {line.quantity && line.quantity > 0
                              ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.aIUnitCostQuantityValue2, { "quantity": line.quantity, "value2": line.uom?.code || line.uomRaw || UI_STRINGS.common.unit })
                              : UI_STRINGS.appAppBoqLineIdPage.quantityRequiredToComputeLineTotal}
                          </td>
                          <td style={{ padding: '9px 12px' }}></td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: line.costBreakdown.aiLineTotal ? '#0f172a' : '#d97706', fontSize: 13 }}>
                            {line.costBreakdown.aiLineTotal ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": line.costBreakdown.aiLineTotal.toLocaleString(I18N_CONFIG.defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : UI_STRINGS.appAppBoqLineIdPage.pendingQty}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
                      <strong>{UI_STRINGS.appAppBoqLineIdPage.basis}</strong> {line.costBreakdown.engineeringBasis}
                    </div>
                  </div>
                ) : (
            <div style={{ padding: 12, background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>{interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.componentEstimateUnavailableForThisLegacyRateTotalUnitCostIsMaintainedAt, { amount: line.aiUnitCost })}</div>
                )}
              </div>
            ) : null}
          </Card>
        </div>

        {/* Sidebar Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Classification & Hierarchy */}
          <Card title={UI_STRINGS.appAppBoqLineIdPage.classificationHierarchy}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.primaryCategory}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {line.category?.name || UI_STRINGS.common.copy4s9bsz}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.subcategory}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {line.subcategory?.name || UI_STRINGS.common.copy4s9bsz}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.unitOfMeasurement}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {line.uom?.name ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.nameCode, { "name": line.uom.name, "code": line.uom.code }) : line.uomRaw || UI_STRINGS.common.nOS}
                </div>
              </div>
            </div>
          </Card>

          {/* Validation Diagnostics */}
          <Card title={UI_STRINGS.appAppBoqLineIdPage.validationDiagnostics}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.common.status}</span>
                <StatusBadge status={line.validationStatus || 'VALID'} />
              </div>

              {validationMessagesList.length === 0 ? (
                <div style={{ padding: 12, background: '#ecfdf5', borderRadius: 6, border: '1px solid #a7f3d0', fontSize: 12, color: '#047857' }}>{UI_STRINGS.appAppBoqLineIdPage.lineMeetsAllDataCompletenessAndStandardisationRules}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                  {validationMessagesList.map((m: any, idx: number) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 4,
                        fontSize: 11,
                        background: m.level === 'ERROR' ? '#fef2f2' : m.level === 'WARNING' ? '#fffbeb' : '#eff6ff',
                        color: m.level === 'ERROR' ? '#dc2626' : m.level === 'WARNING' ? '#b45309' : '#1d4ed8',
                        border: `1px solid ${m.level === 'ERROR' ? '#fecaca' : m.level === 'WARNING' ? '#fde68a' : '#bfdbfe'}`,
                      }}
                    >
                      <strong>{m.level}{UI_STRINGS.common.copyhhsact}</strong> {m.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Originating BOQ Context & Traceability */}
          <Card title={UI_STRINGS.appAppBoqLineIdPage.originatingBOQContext}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.bOQNumber}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginTop: 2 }}>
                  {boq?.boqCode || UI_STRINGS.common.copy4s9bsz}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.bOQTitleScope}</div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
                  {boq?.title || boq?.description || UI_STRINGS.appAppBoqLineIdPage.commercialPackage}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.project}</div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
                  {project?.name ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.nameValue2, { "name": project.name, "value2": project.projectCode || '' }) : UI_STRINGS.common.copy4s9bsz}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.costCentre2}</div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
                  {costCentre?.name ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.codeName, { "code": costCentre.code, "name": costCentre.name }) : UI_STRINGS.common.copy4s9bsz}
                </div>
              </div>

              {(line.sourceSheet || line.sourceRow) && (
                <div style={{ paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqLineIdPage.importSource}</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {line.sourceSheet ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.sheetSourceSheet, { "sourceSheet": line.sourceSheet }) : ''}
                    {line.sourceRow ? interpolateUiString(UI_STRINGS.appAppBoqLineIdPage.rowSourceRow, { "sourceRow": line.sourceRow }) : ''}
                  </div>
                </div>
              )}

              <div style={{ paddingTop: 8, borderTop: '1px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                <div>{UI_STRINGS.appAppBoqLineIdPage.created}{line.createdAt ? new Date(line.createdAt).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}</div>
                <div>{UI_STRINGS.appAppBoqLineIdPage.updated}{line.updatedAt ? new Date(line.updatedAt).toLocaleDateString() : UI_STRINGS.common.copy4s9bsz}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <Link
                  href={returnUrl}
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <ExternalLink size={13} style={{ marginRight: 6 }} />{UI_STRINGS.appAppBoqLineIdPage.viewInBOQWorkspace}</Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
