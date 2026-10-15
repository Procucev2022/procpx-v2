'use client';
// app/(app)/boq/line/[id]/page.tsx - Dedicated Enterprise Read-Only BOQ Line Item Detail View
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  FileText,
  Copy,
  Check,
  Building2,
  Calendar,
  Layers,
  MapPin,
  Tag,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';

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
        throw new Error(data.error || 'Failed to load line item details');
      }
      setLine(data.data?.line || data.line);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
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
        <div style={{ fontSize: 14, color: '#64748b' }}>Loading line item details...</div>
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
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#991b1b', marginBottom: 8 }}>
            Line Item Not Found
          </h2>
          <p style={{ fontSize: 13, color: '#b91c1c', marginBottom: 20 }}>
            {error || 'The requested BOQ line item does not exist or you do not have permission to view it.'}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => router.back()}
          >
            <ArrowLeft size={14} /> Go Back
          </button>
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
          { label: 'BOQ Workspace', href: '/boq' },
          { label: boq?.boqCode || 'Originating BOQ', href: returnUrl },
          { label: `Line #${line.lineNumber}` },
        ]}
        title={`Line Item #${line.lineNumber}: ${line.standardDescription || line.originalDescription}`}
        description={`Item specification and commercial cost breakdown for BOQ ${boq?.boqCode || ''} (Rev ${line.revision?.revisionCode || 'R0'})`}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={returnUrl} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> Return to BOQ
            </Link>
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
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Line & Item Code</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1e40af', marginTop: 4 }}>
            #{line.lineNumber} {line.itemCode ? `(${line.itemCode})` : ''}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            Rev {line.revision?.revisionCode || 'R0'}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Validation Status</div>
          <div style={{ marginTop: 6 }}>
            <StatusBadge status={line.validationStatus || 'VALID'} />
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            {validationMessagesList.length === 0 ? 'Rule compliant' : `${validationMessagesList.length} diagnostic messages`}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Quantity & UOM</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
            {line.quantity !== null && line.quantity !== undefined ? line.quantity.toLocaleString() : '—'}{' '}
            <span style={{ fontSize: 14, fontWeight: 600, color: '#64748b' }}>
              {line.uom?.code || line.uomRaw || 'NOS'}
            </span>
          </div>
          {line.uomRaw && line.uom?.code && line.uomRaw !== line.uom.code && (
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Raw: {line.uomRaw}</div>
          )}
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Benchmark</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {formattedAiTotal ? `₹ ${formattedAiTotal.toLocaleString('en-IN')}` : '—'}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {line.aiUnitCost ? `Rate: ₹ ${line.aiUnitCost.toLocaleString('en-IN')}` : 'No unit rate'}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Item Identification & Descriptions */}
          <Card title="Item Description & Engineering Specification">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                  Standard Description
                </label>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', marginTop: 4 }}>
                  {line.standardDescription || line.originalDescription}
                </div>
              </div>

              {line.standardDescription && line.standardDescription !== line.originalDescription && (
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Original Uploaded Description
                  </label>
                  <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
                    {line.originalDescription}
                  </div>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                    Complete Specification
                  </label>
                  {line.specification && (
                    <button
                      type="button"
                      onClick={handleCopySpec}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      {copiedSpec ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                      {copiedSpec ? 'Copied' : 'Copy'}
                    </button>
                  )}
                </div>

                {line.specification ? (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-label="Item Specification"
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
                  <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>
                    No technical specification text provided for this line.
                  </div>
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
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Location / Area</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.location || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Brand / Make</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.brand || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Model</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.model || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Material / Grade</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {[line.material, line.grade].filter(Boolean).join(' • ') || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Drawing Reference</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.drawingReference || '—'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Remarks</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', marginTop: 2 }}>
                    {line.remarks || '—'}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Commercial & Cost Intelligence */}
          <Card title="Commercial Rate Breakdown & Benchmark Details">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 16,
              }}
            >
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Unit Benchmark Cost</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', marginTop: 4 }}>
                  {line.aiUnitCost ? `₹ ${line.aiUnitCost.toLocaleString('en-IN')}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Per {line.uom?.code || line.uomRaw || 'Unit'}</div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Total Benchmark Value</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#047857', marginTop: 4 }}>
                  {formattedAiTotal ? `₹ ${formattedAiTotal.toLocaleString('en-IN')}` : '—'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Extended Quantity Value</div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Benchmark Source</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>
                  {line.costSource || 'Engineered Cost'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Method: {line.costMethod || 'Standard'}
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Confidence & Eligibility</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginTop: 4 }}>
                  {line.costConfidence ? `${Math.round(line.costConfidence * 100)}% Confidence` : 'Verified Baseline'}
                </div>
                <div style={{ fontSize: 11, color: line.benchmarkEligible ? '#059669' : '#d97706', marginTop: 2 }}>
                  {line.benchmarkEligible ? '✓ Benchmark Eligible' : '⚠ Non-benchmark'}
                </div>
              </div>
            </div>

            {/* AI Costing — Line-Item Cost Breakdown Table */}
            {line.aiUnitCost ? (
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      Line-Item Cost Breakdown
                    </h4>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      Reconciled engineering estimate breakdown per {line.uom?.code || line.uomRaw || 'Unit'}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, background: '#eff6ff', color: '#1e40af', padding: '3px 8px', borderRadius: 4, fontWeight: 700, border: '1px solid #bfdbfe' }}>
                    ESTIMATE · NOT AWARDED RATE
                  </span>
                </div>

                {line.costBreakdown ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>Cost Component</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569' }}>Description</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Share %</th>
                          <th style={{ padding: '8px 12px', fontWeight: 600, color: '#475569', textAlign: 'right' }}>Unit Rate (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Material Cost</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Estimated material component per UOM</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.materialPercent}%</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>₹ {line.costBreakdown.materialCost.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Labour Cost</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Estimated labour component per UOM</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.labourPercent}%</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>₹ {line.costBreakdown.labourCost.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Other Charges</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Applicable equipment, transport, wastage or supported charges</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.otherChargesPercent}%</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>₹ {line.costBreakdown.otherCharges.toFixed(2)}</td>
                        </tr>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#fafafa' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600, color: '#0f172a' }}>Contractor Margin</td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>Estimated contractor margin component ({line.costBreakdown.contractorMarginPercent}% on direct cost base)</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: '#64748b' }}>{line.costBreakdown.contractorMarginPercent}%</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>₹ {line.costBreakdown.contractorMargin.toFixed(2)}</td>
                        </tr>
                        <tr style={{ background: '#f0fdf4', borderTop: '2px solid #bbf7d0', fontWeight: 700 }}>
                          <td style={{ padding: '9px 12px', color: '#047857' }}>Total AI Unit Cost</td>
                          <td style={{ padding: '9px 12px', color: '#065f46' }}>Sum of applicable direct components + contractor margin</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#047857' }}>100%</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: '#047857', fontSize: 13 }}>₹ {line.costBreakdown.aiUnitCost.toFixed(2)}</td>
                        </tr>
                        <tr style={{ background: '#ffffff', borderTop: '1px solid #e2e8f0', fontWeight: 700 }}>
                          <td style={{ padding: '9px 12px', color: '#0f172a' }}>AI Line Total</td>
                          <td style={{ padding: '9px 12px', color: '#64748b', fontWeight: 500 }}>
                            {line.quantity && line.quantity > 0
                              ? `AI Unit Cost × ${line.quantity} ${line.uom?.code || line.uomRaw || 'Unit'}`
                              : 'Quantity required to compute line total'}
                          </td>
                          <td style={{ padding: '9px 12px' }}></td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: line.costBreakdown.aiLineTotal ? '#0f172a' : '#d97706', fontSize: 13 }}>
                            {line.costBreakdown.aiLineTotal ? `₹ ${line.costBreakdown.aiLineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '— (Pending Qty)'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div style={{ padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#64748b' }}>
                      <strong>Basis:</strong> {line.costBreakdown.engineeringBasis}
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: 12, background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: 11, color: '#92400e' }}>
                    Component estimate unavailable for this legacy rate. Total unit cost is maintained at ₹ {line.aiUnitCost}.
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        </div>

        {/* Sidebar Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Classification & Hierarchy */}
          <Card title="Classification & Hierarchy">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Primary Category</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {line.category?.name || '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Subcategory</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {line.subcategory?.name || '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Unit of Measurement</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                  {line.uom?.name ? `${line.uom.name} (${line.uom.code})` : line.uomRaw || 'NOS'}
                </div>
              </div>
            </div>
          </Card>

          {/* Validation Diagnostics */}
          <Card title="Validation Diagnostics">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Status</span>
                <StatusBadge status={line.validationStatus || 'VALID'} />
              </div>

              {validationMessagesList.length === 0 ? (
                <div style={{ padding: 12, background: '#ecfdf5', borderRadius: 6, border: '1px solid #a7f3d0', fontSize: 12, color: '#047857' }}>
                  ✓ Line meets all data completeness and standardisation rules.
                </div>
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
                      <strong>{m.level}:</strong> {m.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Originating BOQ Context & Traceability */}
          <Card title="Originating BOQ Context">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>BOQ Number</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', marginTop: 2 }}>
                  {boq?.boqCode || '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>BOQ Title / Scope</div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
                  {boq?.title || boq?.description || 'Commercial Package'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Project</div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
                  {project?.name ? `${project.name} (${project.projectCode || ''})` : '—'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Cost Centre</div>
                <div style={{ fontSize: 13, color: '#0f172a', marginTop: 2 }}>
                  {costCentre?.name ? `${costCentre.code} • ${costCentre.name}` : '—'}
                </div>
              </div>

              {(line.sourceSheet || line.sourceRow) && (
                <div style={{ paddingTop: 8, borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Import Source</div>
                  <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                    {line.sourceSheet ? `Sheet: ${line.sourceSheet}` : ''}
                    {line.sourceRow ? ` • Row: ${line.sourceRow}` : ''}
                  </div>
                </div>
              )}

              <div style={{ paddingTop: 8, borderTop: '1px solid #f1f5f9', color: '#64748b', fontSize: 11 }}>
                <div>Created: {line.createdAt ? new Date(line.createdAt).toLocaleDateString() : '—'}</div>
                <div>Updated: {line.updatedAt ? new Date(line.updatedAt).toLocaleDateString() : '—'}</div>
              </div>

              <div style={{ marginTop: 8 }}>
                <Link
                  href={returnUrl}
                  className="btn btn-outline btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  <ExternalLink size={13} style={{ marginRight: 6 }} /> View in BOQ Workspace
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
