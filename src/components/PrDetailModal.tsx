'use client';
// src/components/PrDetailModal.tsx
// Standardised, reusable PR Detail Modal for Dashboard, Approved PRs, and PR Register
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
import SpecificationCell from '@/components/ui/SpecificationCell';
import {
  Building2,
  Layers,
  FileSpreadsheet,
  IndianRupee,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  ExternalLink,
  Tag,
  ListChecks,
  User,
  ShieldCheck,
  Package,
} from 'lucide-react';

export interface PrDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  pr: any | null;
  userRole?: string;
  onCreateRfq?: (pr: any) => void;
}

// Canonical demo line items for Kundanahalli CC45 retail fitout
const DEMO_LINES = [
  {
    id: 'l-1',
    lineNumber: '1',
    itemCode: 'INT-001',
    itemDescription: 'Gypsum False Ceiling',
    specification: 'Supply & install 12.5mm Saint-Gobain Gyproc board on GI framework with perimeter channels',
    category: 'Civil & Interior',
    quantity: 500,
    uom: 'SQFT',
    estimatedRate: 120,
    estimatedValue: 60000,
  },
  {
    id: 'l-2',
    lineNumber: '2',
    itemCode: 'INT-002',
    itemDescription: 'Vitrified Floor Tiles 600x600mm',
    specification: 'Kajaria 600x600mm double charged vitrified floor tiles PEI-4 with epoxy grout',
    category: 'Civil & Interior',
    quantity: 1000,
    uom: 'SQFT',
    estimatedRate: 95,
    estimatedValue: 95000,
  },
  {
    id: 'l-3',
    lineNumber: '3',
    itemCode: 'INT-003',
    itemDescription: 'Double Glazed Modular Partitions',
    specification: 'Full height double-glazed aluminum partition with 10mm toughened glass & acoustic gasket',
    category: 'Civil & Interior',
    quantity: 300,
    uom: 'SQFT',
    estimatedRate: 350,
    estimatedValue: 105000,
  },
  {
    id: 'l-4',
    lineNumber: '4',
    itemCode: 'INT-004',
    itemDescription: 'Commercial Ply Wooden Carpentry',
    specification: 'Commercial ply with 1mm Merino/Greenlam decorative laminate finish & hardwood beading',
    category: 'Civil & Interior',
    quantity: 250,
    uom: 'SQFT',
    estimatedRate: 450,
    estimatedValue: 112500,
  },
  {
    id: 'l-5',
    lineNumber: '5',
    itemCode: 'INT-005',
    itemDescription: 'Premium Acrylic Emulsion Painting',
    specification: 'Two coats Asian Paints Royale Luxury Emulsion over primer & wall putty',
    category: 'Civil & Interior',
    quantity: 2000,
    uom: 'SQFT',
    estimatedRate: 80,
    estimatedValue: 160000,
  },
  {
    id: 'l-6',
    lineNumber: '6',
    itemCode: 'INT-006',
    itemDescription: 'Toughened Glass Entrance Door',
    specification: '12mm clear toughened glass double door with Dorma patch fittings & SS handles',
    category: 'Civil & Interior',
    quantity: 4,
    uom: 'NOS',
    estimatedRate: 32000,
    estimatedValue: 128000,
  },
  {
    id: 'l-7',
    lineNumber: '7',
    itemCode: 'ELE-001',
    itemDescription: 'Electrical Conduit & FRLS Wiring',
    specification: 'Supply & pulling of 1100V grade FRLS copper wire in 25mm PVC conduits',
    category: 'Electrical',
    quantity: 1200,
    uom: 'RMT',
    estimatedRate: 180,
    estimatedValue: 216000,
  },
  {
    id: 'l-8',
    lineNumber: '8',
    itemCode: 'FUR-001',
    itemDescription: 'Modular Workstations & Storage',
    specification: 'Four-person linear workstation clusters with modesty panel and 3-drawer pedestals',
    category: 'Furniture',
    quantity: 15,
    uom: 'NOS',
    estimatedRate: 17110,
    estimatedValue: 256650,
  },
];

export default function PrDetailModal({
  isOpen,
  onClose,
  pr,
  userRole = 'PROCUREMENT_USER',
  onCreateRfq,
}: PrDetailModalProps) {
  const [detailedPr, setDetailedPr] = useState<any | null>(null);
  const [loadingLines, setLoadingLines] = useState(false);

  useEffect(() => {
    if (!isOpen || !pr) {
      setDetailedPr(null);
      return;
    }

    // Check if demo record
    if (pr.isExample || pr.id === 'PR-DEMO-001' || pr.prNumber === 'PR-DEMO-001') {
      setDetailedPr({
        ...pr,
        lines: DEMO_LINES,
      });
      return;
    }

    // Check if lines are already provided with full specifications
    if (pr.lines && pr.lines.length > 0 && pr.lines[0].specification && pr.lines[0].itemCode) {
      setDetailedPr(pr);
      return;
    }

    // Fetch authoritative lines from API
    const prId = pr.id || pr.prId;
    if (prId && !String(prId).startsWith('demo') && !String(prId).startsWith('PR-DEMO')) {
      setLoadingLines(true);
      fetch(`/api/pr/${prId}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (json?.data) {
            setDetailedPr({
              ...pr,
              ...json.data,
              lines: (json.data.lines || []).map((l: any, idx: number) => ({
                id: l.id,
                lineNumber: l.lineNumber || String(idx + 1),
                itemCode: l.itemCode || l.boqLine?.itemCode || `ITM-${idx + 1}`,
                itemDescription: l.itemDescription || l.boqLine?.standardDescription || l.boqLine?.originalDescription || 'Line Item',
                specification: l.specification || l.boqLine?.specification || l.itemDescription,
                category: l.category || pr.category || 'General',
                quantity: l.quantity,
                uom: l.uom || l.boqLine?.uom?.code || l.boqLine?.uomRaw || 'NOS',
                estimatedRate: l.estimatedRate || l.boqLine?.aiUnitCost || 0,
                estimatedValue: l.estimatedValue || l.boqLine?.aiTotalCost || 0,
              })),
            });
          } else {
            setDetailedPr(pr);
          }
        })
        .catch(() => setDetailedPr(pr))
        .finally(() => setLoadingLines(false));
    } else {
      setDetailedPr(pr);
    }
  }, [isOpen, pr]);

  if (!isOpen || !pr) return null;

  const currentPr = detailedPr || pr;
  const lines = currentPr.lines || [];
  const rfqs = currentPr.rfqs || [];
  const prAmount = currentPr.requestedValue || currentPr.totalEstimatedValue || currentPr.estimatedValue || 0;
  const stage = currentPr.sourcingStage || currentPr.currentStage || currentPr.overallStage || 'Approved PR — Awaiting RFQ';
  const isAwaitingRfq = stage === 'Approved PR — Awaiting RFQ' || rfqs.length === 0;
  const projectName = currentPr.projectName || currentPr.project?.name || 'Project';
  const projectCode = currentPr.projectCode || currentPr.project?.projectCode || '';
  const boqCode = currentPr.boqCode || currentPr.boq?.boqCode || '—';
  const boqRev = currentPr.approvedRevision || currentPr.boqRevision?.revisionCode || 'R0';
  const costCentreText = currentPr.costCentre ? (typeof currentPr.costCentre === 'object' ? `${currentPr.costCentre.code} - ${currentPr.costCentre.name}` : currentPr.costCentre) : 'General';
  const categoryText = currentPr.category || (currentPr.categories ? currentPr.categories.join(', ') : 'Civil & Interior');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Procurement Request Details — ${currentPr.prNumber || currentPr.boqCode}`}
      subtitle="Sanctioned technical requirements and commercial metadata baselined for procurement sourcing"
      maxWidth="max-w-5xl"
    >
      <div className="space-y-5 text-xs text-slate-700">
        {/* ── 1. Commercial Baseline KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Project
            </span>
            <p className="font-semibold text-slate-900 mt-1 truncate" title={projectName}>
              {projectName}
            </p>
            {projectCode && (
              <span className="font-mono text-[11px] text-slate-500 font-medium">
                {projectCode}
              </span>
            )}
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Cost Centre
            </span>
            <p className="font-semibold text-slate-900 mt-1 truncate" title={costCentreText}>
              {costCentreText}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">
              Taxonomy: {categoryText}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Originating BOQ
            </span>
            <p className="font-mono font-semibold text-slate-900 mt-1">
              {boqCode}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">
              Approved Rev: <strong className="text-blue-700">{boqRev}</strong>
            </span>
          </div>

          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Sanctioned Baseline
            </span>
            <p className="font-mono font-bold text-base text-emerald-700 mt-0.5">
              ₹ {prAmount.toLocaleString('en-IN')}
            </p>
            <span className="text-[11px] text-slate-500 font-medium">
              Total Budget Sanctioned
            </span>
          </div>
        </div>

        {/* ── 2. Scope & Status Context Banner ── */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-lg space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Package Scope Description
              </span>
              <h4 className="text-sm font-bold text-slate-900 mt-0.5">
                {currentPr.description || currentPr.title || 'Procurement Commercial Package'}
              </h4>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={currentPr.prApprovalStatus || currentPr.status || 'APPROVED'} />
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#0f52ba] border border-blue-200">
                {stage}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-slate-600 pt-1 text-[11px] border-t border-slate-100">
            <span className="flex items-center gap-1.5">
              <ListChecks size={13} className="text-slate-400" />
              <strong>{lines.length || currentPr.itemCount || currentPr.totalLines || 8}</strong> line items baselined
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar size={13} className="text-slate-400" />
              Target Date: <strong>{currentPr.requiredDate ? new Date(currentPr.requiredDate).toLocaleDateString('en-GB') : 'Immediate Requirement'}</strong>
            </span>
            {currentPr.requesterName && (
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-slate-400" />
                Requested By: <strong>{currentPr.requesterName}</strong>
              </span>
            )}
          </div>
        </div>

        {/* ── 3. Controlled Technical Line Items Table (Canonical Columns) ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-2">
              <span>Controlled Line Items ({lines.length} Items)</span>
              <span className="text-[10px] text-slate-500 font-normal lowercase">
                (descriptions, quantities, and specifications locked from approved BOQ)
              </span>
            </h4>
          </div>

          {loadingLines ? (
            <div className="p-8 text-center text-slate-500 border border-slate-200 rounded-lg">
              Loading line items from approved baseline...
            </div>
          ) : lines.length === 0 ? (
            <div className="p-6 text-center text-slate-400 border border-slate-200 rounded-lg bg-slate-50">
              No individual line records mapped. Commercial baseline amount applies to whole package.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-64 shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 w-12 text-center border-r border-slate-200">S.No.</th>
                    <th className="py-2.5 px-3 w-28 border-r border-slate-200">Item Code</th>
                    <th className="py-2.5 px-3.5 min-w-[170px] border-r border-slate-200">Item Description</th>
                    <th className="py-2.5 px-3.5 min-w-[200px] border-r border-slate-200">BOQ Description</th>
                    <th className="py-2.5 px-2.5 text-center w-16 border-r border-slate-200">UOM</th>
                    <th className="py-2.5 px-3 text-right w-20 border-r border-slate-200">Qty</th>
                    <th className="py-2.5 px-3 text-right w-28 border-r border-slate-200">Est. Rate (₹)</th>
                    <th className="py-2.5 px-3.5 text-right w-32 font-bold text-slate-900">Est. Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {lines.map((line: any, idx: number) => {
                    const lineAmount = (line.quantity || 0) * (line.estimatedRate || 0);
                    return (
                      <tr key={line.id || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-400 font-medium border-r border-slate-100">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800 border-r border-slate-100 whitespace-nowrap">
                          {line.itemCode || `ITM-${idx + 1}`}
                        </td>
                        <td className="py-2 px-3.5 font-medium text-slate-900 border-r border-slate-100">
                          <div>{line.itemDescription}</div>
                          {line.category && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                              {line.category}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3.5 border-r border-slate-100">
                          <SpecificationCell
                            specification={line.specification || line.itemDescription}
                            lineNumber={idx + 1}
                            itemDescription={line.itemDescription}
                            lineId={line.id || `line-${idx}`}
                            maxWidth={190}
                          />
                        </td>
                        <td className="py-2 px-2.5 text-center text-slate-700 border-r border-slate-100">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 font-semibold text-[11px]">
                            {line.uom}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 border-r border-slate-100">
                          {line.quantity?.toLocaleString('en-IN') ?? '—'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700 border-r border-slate-100">
                          ₹ {(line.estimatedRate || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3.5 text-right font-mono font-bold text-slate-900">
                          ₹ {(line.estimatedValue || lineAmount || 0).toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-bold border-t border-slate-200 text-slate-900">
                    <td colSpan={7} className="py-2.5 px-3.5 text-right uppercase tracking-wider text-[11px] text-slate-600 border-r border-slate-200">
                      Total Sanctioned Package Amount:
                    </td>
                    <td className="py-2.5 px-3.5 text-right text-emerald-700 font-mono font-bold">
                      ₹ {prAmount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        {/* ── 4. Linked RFQs & Sourcing History (If present) ── */}
        {rfqs && rfqs.length > 0 && (
          <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Package size={14} className="text-[#0f52ba]" />
                Associated RFQ Sourcing Packages ({rfqs.length})
              </span>
              <span className="text-[11px] text-[#0f52ba] font-medium">
                Live Procurement Execution
              </span>
            </div>

            <div className="space-y-2">
              {rfqs.map((rfq: any) => (
                <div
                  key={rfq.id}
                  className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-primary text-xs">
                        {rfq.rfqNumber}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        {rfq.status}
                      </span>
                    </div>
                    <div className="text-slate-800 font-medium text-xs">
                      {rfq.description || rfq.packageName}
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-3">
                      <span>Vendors: <strong>{rfq.vendorInvitationProgress || `${rfq.quotesCount || 0} quotes`}</strong></span>
                      {rfq.negotiationStage && rfq.negotiationStage !== '—' && (
                        <span>Negotiation: <strong className="text-indigo-700">{rfq.negotiationStage}</strong></span>
                      )}
                      {rfq.awardStatus && rfq.awardStatus !== 'Not Prepared' && (
                        <span>Award: <strong className="text-emerald-700">{rfq.awardStatus}</strong></span>
                      )}
                    </div>
                  </div>

                  <Link
                    href={rfq.openUrl || `/procurement/rfqs/${rfq.id}`}
                    className="h-8 px-3 bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-blue-50 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs self-start sm:self-center shrink-0"
                  >
                    <span>Open RFQ Workspace</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 5. Governance Integrity Footer ── */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 text-[11px] flex items-center gap-2">
          <ShieldCheck size={16} className="text-[#0f52ba] shrink-0" />
          <span>
            <strong>proCPX Commercial Governance:</strong> PR scope and rates inherit strictly from the approved BOQ revision. Line alterations require a formal BOQ revision branch.
          </span>
        </div>

        {/* ── 6. Modal Actions ── */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 text-xs transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-2">
            {(currentPr.boqRevisionId || currentPr.revisionId) && (
              <Link
                href={`/boq/${currentPr.boqRevisionId || currentPr.revisionId}`}
                className="h-9 px-3.5 border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 rounded-lg font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <FileSpreadsheet size={13} />
                <span>View BOQ Revision</span>
              </Link>
            )}

            {isAwaitingRfq && (
              <Link
                href={currentPr.createRfqUrl || `/procurement/rfqs/new?${currentPr.boqRevisionId ? `revisionId=${currentPr.boqRevisionId}&` : ''}prId=${currentPr.id || currentPr.prId}`}
                className="h-9 px-4 bg-[#0f52ba] hover:bg-blue-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <span>+ Create RFQ for this PR</span>
                <ArrowRight size={13} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
