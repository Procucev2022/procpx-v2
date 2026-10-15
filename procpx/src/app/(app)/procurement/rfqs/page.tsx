'use client';
// app/(app)/procurement/rfqs/page.tsx
// Enterprise RFQs Register & Control Tower with Approved Blue Summary Bar
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, ClipboardCheck, FileText, ArrowRight, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

// Helper to calculate actual workflow stage from persisted records
function getActualRfqWorkflowStage(rfq: any): { stage: string; bg: string; color: string; border: string } {
  // 1. Post-award / PPO stage
  if (rfq.ppos?.length > 0 || rfq.ppo || rfq.status === 'PPO_ISSUED' || rfq.status === 'PPO_IN_PROGRESS') {
    return { stage: 'PPO in Progress', bg: '#FFF7ED', color: '#C2410C', border: '#FFEDD5' };
  }
  // 2. Award stages
  if (rfq.status === 'AWARDED' || rfq.status === 'AWARD_APPROVED' || (rfq.awards?.[0]?.status === 'APPROVED')) {
    return { stage: 'Award Approved', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' };
  }
  if (rfq.status === 'AWARD_RECOMMENDED' || rfq.status === 'AWARD_PENDING' || (rfq.awards?.length > 0 && rfq.awards[0]?.status === 'PENDING_APPROVAL')) {
    return { stage: 'Award Pending Approval', bg: '#FDF4FF', color: '#A21CAF', border: '#F5D0FE' };
  }
  // 3. Negotiation stage
  if (rfq.status === 'NEGOTIATION' || rfq.status === 'FINAL_RATE_LOCKED' || rfq.negotiations?.length > 0) {
    return { stage: 'Negotiation in Progress', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
  }
  // 4. Comparison / Quotes Received stage
  if (rfq.status === 'COMPARISON' || rfq.status === 'RESPONSE_CLOSED' || (rfq.quotesCount && rfq.quotesCount > 0) || rfq.quotes?.length > 0) {
    return { stage: 'Quote Comparison', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
  }
  // 5. Released / Awaiting Quotations
  if (rfq.status === 'RELEASED' || rfq.status === 'VENDOR_RESPONSE_OPEN' || rfq.status === 'AWAITING_QUOTES') {
    return { stage: 'Awaiting Quotations', bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' };
  }
  // 6. Draft
  return { stage: 'Draft', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' };
}

export default function RfqsListPage() {
  const searchParams = useSearchParams();
  const filterQuery = searchParams.get('filter') || 'all';

  const [rfqs, setRfqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(filterQuery);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchRfqs();
  }, [activeTab, search]);

  const fetchRfqs = async () => {
    setLoading(true);
    try {
      let url = `/api/procurement/rfqs?search=${encodeURIComponent(search)}`;
      if (activeTab === 'active') {
        url += '&status=active';
      } else if (activeTab !== 'all' && activeTab !== 'rerfq') {
        url += `&status=${activeTab.toUpperCase()}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.rfqs) {
        let filtered = data.rfqs;
        if (activeTab === 'rerfq') {
          filtered = filtered.filter((r: any) => r.isReRfq || r.title.includes('Re-RFQ'));
        }
        setRfqs(filtered);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'RFQs' },
        ]}
        title="Request For Quotations (RFQs)"
        description="Active sourcing packages, competitive quote evaluations, rate locking and commercial awards."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/procurement/approved-boqs" className="btn btn-secondary">
              <ClipboardCheck size={16} /> Sourcing Queue
            </Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary">
              <Plus size={16} /> Create New RFQ
            </Link>
          </div>
        }
      />

      {/* 1. RFQ Summary — Blue Bar (ProCPX Blue Styling) */}
      <div
        className="rfq-summary-bar"
        style={{
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderLeft: '5px solid #2563EB',
          borderRadius: 8,
          boxShadow: '0 1px 3px 0 rgba(37, 99, 235, 0.08)',
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: '9px 16px',
            borderBottom: '1px solid #DBEAFE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(239, 246, 255, 0.95)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: '#2563EB',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <FileText size={14} />
            </div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF', margin: 0, letterSpacing: '0.02em' }}>
              1. RFQ SUMMARY
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#3B82F6', fontWeight: 600 }}>Active Packages:</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: '#DBEAFE',
                color: '#1E40AF',
                border: '1px solid #BFDBFE',
              }}
            >
              {rfqs.length} Records
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Filter */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[
          { key: 'all', label: 'All RFQs' },
          { key: 'active', label: 'Active Sourcing' },
          { key: 'draft', label: 'Drafts' },
          { key: 'released', label: 'Released' },
          { key: 'comparison', label: 'Under Comparison' },
          { key: 'negotiation', label: 'Under Negotiation' },
          { key: 'final_rate_locked', label: 'Rate Locked' },
          { key: 'awarded', label: 'Awarded / PPO' },
          { key: 'rerfq', label: 'Re-RFQs' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search & Filter Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          className="input"
          style={{ maxWidth: 440 }}
          placeholder="Search by RFQ number, title, package, or project..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Enterprise Data Table: Exactly 14 Columns in Specified Order */}
      <Card
        title={`RFQ Sourcing Register (${rfqs.length})`}
        subtitle="Persisted sourcing packages, competitive quote evaluations, rate locking and commercial awards"
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>Loading RFQs...</div>
          </div>
        ) : rfqs.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<FileText size={36} strokeWidth={1.5} color="#94a3b8" />}
              title="No RFQs Found"
              description="No RFQs matching this filter or search query. Create your first RFQ from an approved BOQ."
              actionText="Create New RFQ"
              actionHref="/procurement/rfqs/new"
            />
          </div>
        ) : (
          <div className="table-wrapper" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1540 }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, whiteSpace: 'nowrap' }}>1. BOQ No.</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>2. RFQ No.</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 170, whiteSpace: 'nowrap' }}>3. Project</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 110, whiteSpace: 'nowrap' }}>4. Location</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 160, whiteSpace: 'nowrap' }}>5. Package / Trade</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>6. Cost Centre</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 100, whiteSpace: 'nowrap' }}>7. BOQ Revision</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>8. Total BOQ Value</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 90, textAlign: 'center', whiteSpace: 'nowrap' }}>9. RFQ Lines</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 120, whiteSpace: 'nowrap' }}>10. Created / Issued Date</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 110, textAlign: 'center', whiteSpace: 'nowrap' }}>11. Invited Vendors</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'center', whiteSpace: 'nowrap' }}>12. Quotations Received</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 150, textAlign: 'center', whiteSpace: 'nowrap' }}>13. RFQ Status</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>14. Action</th>
                </tr>
              </thead>
              <tbody>
                {rfqs.map((rfq) => {
                  const boqNo = rfq.boqCode || rfq.boqRevision?.boq?.boqCode || (rfq.project?.projectCode ? `BOQ-${rfq.project.projectCode}` : 'BOQ-R1');
                  const rfqNo = rfq.rfqNumber;
                  const projectName = rfq.project?.name || 'Project';
                  const location = rfq.location || rfq.project?.location || rfq.project?.city || 'India';
                  const packageTrade = rfq.packageName || rfq.title || 'Civil & Interior Package';
                  const costCentre = rfq.costCentre || 'CC45 - Fitout';
                  const boqRevision = rfq.boqRevision?.revisionCode || 'R0';
                  const totalBoqValue = rfq.totalBoqValue || rfq.estimatedBenchmarkValue || 0;
                  const rfqLinesCount = rfq.totalLines || 0;
                  const createdDate = rfq.releasedAt ? new Date(rfq.releasedAt).toLocaleDateString() : rfq.createdAt ? new Date(rfq.createdAt).toLocaleDateString() : '—';
                  const invitedCount = rfq.invitedVendorsCount || rfq.invitedVendors?.length || 0;
                  const quotesCount = rfq.quotesCount || 0;
                  const workflow = getActualRfqWorkflowStage(rfq);

                  return (
                    <tr key={rfq.id}>
                      {/* 1. BOQ No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1E40AF', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {boqNo}
                      </td>

                      {/* 2. RFQ No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#2563EB', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/procurement/rfqs/${rfq.id}`}
                          className="font-mono font-bold text-primary"
                          style={{ textDecoration: 'none' }}
                        >
                          {rfqNo}
                        </Link>
                        {rfq.isReRfq && (
                          <div style={{ marginTop: 2 }}>
                            <span className="badge badge-warning" style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px' }}>
                              RE-RFQ
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 3. Project */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        <div>{projectName}</div>
                        <div className="font-mono text-muted" style={{ fontSize: 11 }}>
                          {rfq.project?.projectCode}
                        </div>
                      </td>

                      {/* 4. Location */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {location}
                      </td>

                      {/* 5. Package / Trade */}
                      <td style={{ padding: '9px 12px', fontWeight: 500, color: '#1E293B', whiteSpace: 'nowrap' }}>
                        {packageTrade}
                      </td>

                      {/* 6. Cost Centre */}
                      <td style={{ padding: '9px 12px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {costCentre}
                      </td>

                      {/* 7. BOQ Revision */}
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span className="badge badge-approved" style={{ fontSize: 10, fontWeight: 700 }}>
                          {boqRevision}
                        </span>
                      </td>

                      {/* 8. Total BOQ Value */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'right', color: '#1E40AF', whiteSpace: 'nowrap' }}>
                        ₹ {totalBoqValue.toLocaleString()}
                      </td>

                      {/* 9. RFQ Lines */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {rfqLinesCount} Lines
                      </td>

                      {/* 10. Created / Issued Date */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {createdDate}
                      </td>

                      {/* 11. Invited Vendors */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        {invitedCount} Vendors
                      </td>

                      {/* 12. Quotations Received */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 4,
                            backgroundColor: quotesCount > 0 ? '#DCFCE7' : '#F1F5F9',
                            color: quotesCount > 0 ? '#15803D' : '#64748B',
                            border: `1px solid ${quotesCount > 0 ? '#BBF7D0' : '#CBD5E1'}`,
                          }}
                        >
                          {quotesCount} Received
                        </span>
                      </td>

                      {/* 13. RFQ Status */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            backgroundColor: workflow.bg,
                            color: workflow.color,
                            border: `1px solid ${workflow.border}`,
                          }}
                        >
                          {workflow.stage}
                        </span>
                      </td>

                      {/* 14. Action */}
                      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/procurement/rfqs/${rfq.id}`}
                          className="btn btn-primary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          Open Workspace <ArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
