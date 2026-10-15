'use client';
// app/(app)/procurement/ppos/page.tsx
// Enterprise Procurement Purchase Orders (PPO) Register with Approved Orange Summary Bar
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileCheck, Receipt, ArrowRight, ExternalLink } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';

function getPpoStatusBadgeStyle(status: string): { bg: string; color: string; border: string } {
  switch (status) {
    case 'ISSUED':
      return { bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' };
    case 'CONFIRMED':
      return { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
    case 'COMPLETED':
      return { bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' };
    case 'PARTIALLY_COMPLETED':
      return { bg: '#FEF3C7', color: '#92400E', border: '#FDE68A' };
    case 'DRAFT':
    default:
      return { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' };
  }
}

export default function PposDeskPage() {
  const [ppos, setPpos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPpos();
  }, []);

  const fetchPpos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/ppos');
      const data = await res.json();
      if (data.ppos) setPpos(data.ppos);
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
          { label: 'PPOs & Orders' },
        ]}
        title="Procurement Purchase Orders (PPO)"
        description="Controlled Commercial Orders Inherited Directly from Approved Baselines & Negotiated Rates"
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/procurement/rfqs" className="btn btn-secondary">
              Active RFQs Register
            </Link>
          </div>
        }
      />

      {/* 2. PPO Summary — Orange Bar (ProCPX Orange Styling) */}
      <div
        className="ppo-summary-bar"
        style={{
          backgroundColor: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderLeft: '5px solid #D97706',
          borderRadius: 8,
          boxShadow: '0 1px 3px 0 rgba(217, 119, 6, 0.08)',
          overflow: 'hidden',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            padding: '9px 16px',
            borderBottom: '1px solid #FEF3C7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 251, 235, 0.95)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                backgroundColor: '#D97706',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Receipt size={14} />
            </div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: '#B45309', margin: 0, letterSpacing: '0.02em' }}>
              2. PPO SUMMARY
            </h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>Post-Award Orders:</span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #FDE68A',
              }}
            >
              {ppos.length} Records
            </span>
          </div>
        </div>
      </div>

      {/* Enterprise Data Table: Exactly 14 Columns in Specified Order */}
      <Card
        title={`Issued Procurement Orders (${ppos.length})`}
        subtitle="Commercial purchase orders generated from approved L1 awards and validated vendor negotiations"
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13 }}>Loading PPOs...</div>
          </div>
        ) : ppos.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<FileCheck size={36} strokeWidth={1.5} color="#94a3b8" />}
              title="No PPOs have been created yet."
              description="Once an award recommendation is approved, a PPO can be generated and issued."
              actionText="View Active RFQs"
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="table enterprise-table" style={{ fontSize: 12, minWidth: 1540 }}>
              <thead>
                <tr>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>1. PPO No.</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 140, whiteSpace: 'nowrap' }}>2. Reference RFQ</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, whiteSpace: 'nowrap' }}>3. BOQ No.</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 170, whiteSpace: 'nowrap' }}>4. Project</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 170, whiteSpace: 'nowrap' }}>5. Vendor</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, minWidth: 150, whiteSpace: 'nowrap' }}>6. Package / Trade</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 130, textAlign: 'right', whiteSpace: 'nowrap' }}>7. Awarded Value</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 100, whiteSpace: 'nowrap' }}>8. Award Date</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 120, textAlign: 'center', whiteSpace: 'nowrap' }}>9. PPO Status</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 100, whiteSpace: 'nowrap' }}>10. Start Date</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 110, whiteSpace: 'nowrap' }}>11. Completion Date</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 120, whiteSpace: 'nowrap' }}>12. Created By</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 100, whiteSpace: 'nowrap' }}>13. Created Date</th>
                  <th style={{ padding: '9px 12px', fontWeight: 700, width: 120, textAlign: 'right', whiteSpace: 'nowrap' }}>14. Action</th>
                </tr>
              </thead>
              <tbody>
                {ppos.map((p) => {
                  const ppoNo = p.ppoNumber;
                  const rfqRef = p.rfq?.rfqNumber || '—';
                  const boqNo = p.rfq?.boqRevision?.boq?.boqCode || (p.project?.projectCode ? `BOQ-${p.project.projectCode}` : 'BOQ-000001');
                  const projectName = p.project?.name || 'Project';
                  const vendorName = p.vendor?.name || 'Assigned Vendor';
                  const packageTrade = p.rfq?.packageName || p.title || 'Civil & Interior Package';
                  const awardedValue = p.totalValue || 0;
                  const awardDate = p.awardRecommendation?.approvedAt ? new Date(p.awardRecommendation.approvedAt).toLocaleDateString() : p.issuedAt ? new Date(p.issuedAt).toLocaleDateString() : '—';
                  const statusStyle = getPpoStatusBadgeStyle(p.status);
                  const startDate = p.issuedAt ? new Date(p.issuedAt).toLocaleDateString() : '—';
                  const completionDate = p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '—';
                  const createdBy = 'Category Manager';
                  const createdDate = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—';

                  return (
                    <tr key={p.id}>
                      {/* 1. PPO No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#D97706', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {ppoNo}
                      </td>

                      {/* 2. Reference RFQ */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#2563EB', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {p.rfqId ? (
                          <Link href={`/procurement/rfqs/${p.rfqId}`} style={{ color: '#2563EB', textDecoration: 'none' }}>
                            {rfqRef}
                          </Link>
                        ) : (
                          rfqRef
                        )}
                      </td>

                      {/* 3. BOQ No. */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1E40AF', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {boqNo}
                      </td>

                      {/* 4. Project */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        <div>{projectName}</div>
                        <div className="font-mono text-muted" style={{ fontSize: 11 }}>
                          {p.project?.projectCode}
                        </div>
                      </td>

                      {/* 5. Vendor */}
                      <td style={{ padding: '9px 12px', fontWeight: 600, color: '#0F172A', whiteSpace: 'nowrap' }}>
                        {vendorName}
                      </td>

                      {/* 6. Package / Trade */}
                      <td style={{ padding: '9px 12px', color: '#334155', whiteSpace: 'nowrap' }}>
                        {packageTrade}
                      </td>

                      {/* 7. Awarded Value */}
                      <td style={{ padding: '9px 12px', fontWeight: 700, textAlign: 'right', color: '#059669', whiteSpace: 'nowrap' }}>
                        ₹ {awardedValue.toLocaleString()}
                      </td>

                      {/* 8. Award Date */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {awardDate}
                      </td>

                      {/* 9. PPO Status */}
                      <td style={{ padding: '9px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            border: `1px solid ${statusStyle.border}`,
                          }}
                        >
                          {p.status}
                        </span>
                      </td>

                      {/* 10. Start Date */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {startDate}
                      </td>

                      {/* 11. Completion Date */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {completionDate}
                      </td>

                      {/* 12. Created By */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {createdBy}
                      </td>

                      {/* 13. Created Date */}
                      <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                        {createdDate}
                      </td>

                      {/* 14. Action */}
                      <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <Link
                          href={p.rfqId ? `/procurement/rfqs/${p.rfqId}?tab=awarding` : '/vendor-portal/ppos'}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          View Order <ArrowRight size={12} />
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
