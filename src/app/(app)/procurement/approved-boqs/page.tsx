'use client';
// app/(app)/procurement/approved-boqs/page.tsx
// Sourcing Queue: Approved Commercial Baselines ready for RFQ Packaging
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FileText, Plus, ShieldCheck, ClipboardCheck } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

export default function ApprovedBoqsPage() {
  const [loading, setLoading] = useState(true);
  const [approvedBoqs, setApprovedBoqs] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedBoq, setSelectedBoq] = useState<any>(null);

  useEffect(() => {
    fetchApprovedBoqs();
  }, [search]);

  const fetchApprovedBoqs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/approved-boqs?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (data.approvedBoqs) {
        setApprovedBoqs(data.approvedBoqs);
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
          { label: 'Approved BOQs' },
        ]}
        title="Approved Commercial Baselines — Sourcing Queue"
        description="Controlled, client-approved BOQ revisions ready for RFQ packaging, supplier bidding, and rate discovery."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/procurement/rfqs" className="btn btn-secondary">
              <FileText size={16} /> View All RFQs
            </Link>
            <Link href="/procurement/rfqs/new" className="btn btn-primary">
              <Plus size={16} /> Create New RFQ
            </Link>
          </div>
        }
      />

      {/* Governance Banner */}
      <div
        style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          padding: '14px 20px',
          borderRadius: 8,
          marginBottom: 20,
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          color: '#166534',
        }}
      >
        <ShieldCheck size={24} style={{ color: '#166534', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            Governance-Locked Commercial Baselines:
          </strong>
          <div style={{ fontSize: 13, marginTop: 2, color: '#15803d' }}>
            All quantities, descriptions, and benchmark budgets in approved revisions are strictly immutable.
            Procurement teams can package lines into competitive RFQs without manual re-keying or discrepancies.
          </div>
        </div>
      </div>

      {/* Search Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          type="text"
          className="input"
          style={{ maxWidth: 440 }}
          placeholder="Search project name, project code, or revision..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table Card */}
      <Card
        title={`Commercial Baselines Available (${approvedBoqs.length})`}
        subtitle="Approved by Project Approver and released to Procurement"
        noPadding
      >
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>Loading approved commercial baselines...</div>
          </div>
        ) : approvedBoqs.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<ClipboardCheck size={36} strokeWidth={1.5} color="#94a3b8" />}
              title="No Approved BOQs Found"
              description="BOQs must be approved by the Project Approver to enter the procurement sourcing queue."
              actionText="View Projects"
              actionHref="/projects"
            />
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Project Name</th>
                  <th style={{ width: 110 }}>Project Code</th>
                  <th style={{ width: 120 }}>Location</th>
                  <th style={{ width: 150 }}>Approved Revision</th>
                  <th style={{ width: 160 }}>Approval Date & By</th>
                  <th>Categories</th>
                  <th style={{ width: 90 }}>Lines</th>
                  <th style={{ width: 150, textAlign: 'right' }}>Benchmark Value</th>
                  <th style={{ width: 110 }}>Active RFQs</th>
                  <th style={{ width: 220, textAlign: 'right' }}>Sourcing Action</th>
                </tr>
              </thead>
              <tbody>
                {approvedBoqs.map((boq) => (
                  <tr key={boq.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{boq.projectName}</div>
                    </td>
                    <td className="font-mono text-muted">{boq.projectCode}</td>
                    <td style={{ color: '#334155' }}>{boq.location || '—'}</td>
                    <td>
                      <span className="badge badge-approved font-mono" style={{ fontWeight: 700 }}>
                        {boq.approvedRevisionCode} (LOCKED)
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 500, color: '#0f172a' }}>
                        {boq.approvedAt ? new Date(boq.approvedAt).toLocaleDateString() : '—'}
                      </div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        by {boq.approvedBy}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {boq.categories.map((c: any, idx: number) => (
                          <span key={idx} className="badge badge-draft" style={{ fontSize: 11 }}>
                            {c.category} ({c.lineCount})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <strong>{boq.totalLines} lines</strong>
                    </td>
                    <td style={{ fontWeight: 700, textAlign: 'right', color: '#1e40af' }}>
                      ₹ {boq.estimatedBenchmarkValue?.toLocaleString()}
                    </td>
                    <td>
                      {boq.rfqCount > 0 ? (
                        <span className="badge badge-info">{boq.rfqCount} RFQs</span>
                      ) : (
                        <span className="badge badge-draft">None</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setSelectedBoq(selectedBoq?.id === boq.id ? null : boq)}
                          className="btn btn-secondary btn-sm"
                        >
                          {selectedBoq?.id === boq.id ? 'Hide Scope' : 'Inspect Scope'}
                        </button>
                        <Link
                          href={`/procurement/rfqs/new?revisionId=${boq.id}&projectId=${boq.projectId}`}
                          className="btn btn-primary btn-sm"
                        >
                          Create RFQ →
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

      {/* Scope Inspection Drawer/Panel */}
      {selectedBoq && (
        <div style={{ marginTop: 24 }}>
          <Card
            title={`Baseline Scope Inspection: ${selectedBoq.projectName} (${selectedBoq.approvedRevisionCode})`}
            subtitle="Quantities, descriptions, and benchmark rates are locked and inherited into your RFQ"
            action={
              <Link
                href={`/procurement/rfqs/new?revisionId=${selectedBoq.id}&projectId=${selectedBoq.projectId}`}
                className="btn btn-primary btn-sm"
              >
                Package into RFQ →
              </Link>
            }
            noPadding
          >
            <div className="table-wrapper" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>S.No.</th>
                    <th>Item Description</th>
                    <th style={{ width: 140 }}>Category</th>
                    <th style={{ width: 80 }}>UOM</th>
                    <th style={{ width: 120, textAlign: 'right' }}>Quantity (Locked)</th>
                    <th style={{ width: 130, textAlign: 'right' }}>Benchmark Rate</th>
                    <th style={{ width: 140, textAlign: 'right' }}>Benchmark Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedBoq.lines.map((l: any) => (
                    <tr key={l.id}>
                      <td className="font-mono text-muted">{l.lineNumber}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{l.description}</td>
                      <td>
                        <span className="badge badge-info" style={{ fontSize: 11 }}>
                          {l.category}
                        </span>
                      </td>
                      <td>{l.uom}</td>
                      <td style={{ fontWeight: 700, textAlign: 'right' }}>{l.quantity}</td>
                      <td style={{ textAlign: 'right' }}>₹ {l.benchmarkRate?.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, textAlign: 'right', color: '#1e40af' }}>
                        ₹ {l.benchmarkAmount?.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
