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
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


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
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToReviewAwardRecommendation }));
      }

      toast.success(
        isApproved ? UI_STRINGS.appAppProcurementRfqsIdPage.pPOApprovedSuccessfullyByFinance : UI_STRINGS.common.userMessages.awardRecommendationRejected,
        award?.rfq?.rfqNumber,
        isApproved ? UI_STRINGS.common.userMessages.readyForPpoIssuance : UI_STRINGS.common.userMessages.commercialReview
      );
      fetchAwards();
    } catch (err: any) {
      toast.error({
        title: UI_STRINGS.appAppProcurementAwardsPage.awardReviewFailed,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": err.message || UI_STRINGS.common.userMessages.anErrorOccurredWhileReviewingTheAwardRecommendation }),
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
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.common.awardsPPOs },
        ]}
        title={UI_STRINGS.appAppProcurementAwardsPage.commercialAwardRecommendations}
        description={UI_STRINGS.appAppProcurementAwardsPage.finalSourcingDeterminationsComparativeSavingsJustificationFinanceApprovalWorkflowsPPOIssuance}
        actions={
          <Link href="/procurement/ppos" className="btn btn-secondary">
            <FileCheck size={16} />{UI_STRINGS.appAppProcurementAwardsPage.viewIssuedPPOs}</Link>
        }
      />

      <Card
        title={interpolateUiString(UI_STRINGS.appAppProcurementAwardsPage.commercialAwardProposalsLength, { "length": awards.length })}
        subtitle={UI_STRINGS.appAppProcurementAwardsPage.submissionsAwaitingFinanceSignOffAndContractGeneration}
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAwardsPage.loadingAwardRecommendations}</div>
          </div>
        ) : awards.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Award size={36} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.appAppProcurementAwardsPage.noAwardRecommendationsYet}
              description={UI_STRINGS.appAppProcurementAwardsPage.lockFinalRatesInAnRFQToGenerateAnAwardRecommendationForFinanceApproval}
              actionText={UI_STRINGS.common.viewSourcingRFQs}
              actionHref="/procurement/rfqs"
            />
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 140 }}>{UI_STRINGS.common.rFQNumber}</th>
                  <th>{UI_STRINGS.common.project}</th>
                  <th>{UI_STRINGS.common.recommendedVendor}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAwardsPage.finalValue}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.benchmark}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAwardsPage.savingsRealised}</th>
                  <th>{UI_STRINGS.common.approvalStatus}</th>
                  <th>{UI_STRINGS.common.submittedAt}</th>
                  <th style={{ textAlign: 'right' }}>{UI_STRINGS.common.actions}</th>
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
                    <td style={{ fontWeight: 700, textAlign: 'right', color: '#059669' }}>{UI_STRINGS.common.copy1g8b5tg}{a.finalNegotiatedAmount?.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{UI_STRINGS.common.copy1g8b5tg}{a.benchmarkAmount?.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="badge badge-approved" style={{ fontWeight: 700 }}>
                        {a.savingsPercent}{UI_STRINGS.appAppProcurementAwardsPage.copy16sldvt}{a.totalSavingsAmount?.toLocaleString()}{UI_STRINGS.common.copyc7zu6c}</span>
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
                            >{UI_STRINGS.appAppProcurementAwardsPage.approve}</button>
                            <button
                              type="button"
                              onClick={() => handleReviewAward(a.id, 'REJECT')}
                              disabled={actionLoading}
                              className="btn btn-secondary btn-sm"
                            >{UI_STRINGS.common.reject2}</button>
                          </>
                        )}
                        <Link
                          href={`/procurement/rfqs/${a.rfqId}?tab=awarding`}
                          className="btn btn-secondary btn-sm"
                        >{UI_STRINGS.appAppProcurementAwardsPage.workspace}</Link>
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
