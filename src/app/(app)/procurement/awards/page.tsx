'use client';
// app/(app)/procurement/awards/page.tsx
// Enterprise Commercial Award Recommendations & Finance Approvals Desk
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileCheck, Award } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

export default function AwardsDeskPage() {
  const toast = useToast();
  const [awards, setAwards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchAwards();
  }, []);

  const fetchAwards = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/procurement/awards');
      const data = await res.json();
      if (data.awards) setAwards(data.awards);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReviewAward = async (awardId: string, action: 'APPROVE' | 'REJECT') => {
    const award = awards.find((a) => a.id === awardId);
    const isApproved = action === 'APPROVE';
    setActionLoading(true);
    try {
      const res = await fetch('/api/procurement/awards', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ awardId, action, remarks: `Commercial award ${action.toLowerCase()}d` }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to review award recommendation');
      }

      toast.success(
        isApproved ? 'PPO approved successfully by Finance.' : 'Award recommendation rejected.',
        award?.rfq?.rfqNumber,
        isApproved ? 'Ready for PPO Issuance' : 'Commercial Review'
      );
      fetchAwards();
    } catch (err: any) {
      toast.error({
        title: 'Award Review Failed',
        message: err.message || 'An error occurred while reviewing the award recommendation.',
        recordNumber: award?.rfq?.rfqNumber,
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'Awards & PPOs' },
        ]}
        title="Commercial Award Recommendations"
        description="Final sourcing determinations, comparative savings justification, Finance approval workflows & PPO issuance."
        actions={
          <Link href="/procurement/ppos" className="btn btn-secondary">
            <FileCheck size={16} /> View Issued PPOs
          </Link>
        }
      />

      <Card
        title={`Commercial Award Proposals (${awards.length})`}
        subtitle="Submissions awaiting Finance sign-off and contract generation"
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>Loading award recommendations...</div>
          </div>
        ) : awards.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Award size={36} strokeWidth={1.5} color="#94a3b8" />}
              title="No Award Recommendations Yet"
              description="Lock final rates in an RFQ to generate an award recommendation for Finance approval."
              actionText="View Sourcing RFQs"
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>RFQ Number</th>
                  <th>Project</th>
                  <th>Recommended Vendor</th>
                  <th style={{ textAlign: 'right' }}>Final Value</th>
                  <th style={{ textAlign: 'right' }}>Benchmark</th>
                  <th style={{ textAlign: 'right' }}>Savings Realised</th>
                  <th>Approval Status</th>
                  <th>Submitted At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {awards.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link
                        href={`/procurement/rfqs/${a.rfqId}`}
                        className="font-mono font-bold text-primary"
                        style={{ textDecoration: 'none' }}
                      >
                        {a.rfq?.rfqNumber}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, color: '#0f172a' }}>{a.rfq?.project?.name}</div>
                      <div className="font-mono text-muted" style={{ fontSize: 11 }}>
                        {a.rfq?.project?.projectCode}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{a.recommendedVendor?.name}</div>
                    </td>
                    <td style={{ fontWeight: 700, textAlign: 'right', color: '#059669' }}>
                      ₹ {a.finalNegotiatedAmount?.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      ₹ {a.benchmarkAmount?.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-approved" style={{ fontWeight: 700 }}>
                        {a.savingsPercent}% (₹ {a.totalSavingsAmount?.toLocaleString()})
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {a.status === 'AWARD_RECOMMENDED' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReviewAward(a.id, 'APPROVE')}
                              disabled={actionLoading}
                              className="btn btn-primary btn-sm"
                              style={{ background: '#16a34a', borderColor: '#15803d' }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewAward(a.id, 'REJECT')}
                              disabled={actionLoading}
                              className="btn btn-secondary btn-sm"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        <Link
                          href={`/procurement/rfqs/${a.rfqId}?tab=awarding`}
                          className="btn btn-secondary btn-sm"
                        >
                          Workspace →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
