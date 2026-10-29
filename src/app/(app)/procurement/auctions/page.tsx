'use client';
// app/(app)/procurement/auctions/page.tsx
// Complete Enterprise Auction Workspace: Dashboard, KPIs, Register, and Step-Based Guided Creation
import { useEffect, useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Gavel,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  RefreshCw,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Shield,
  FileText,
  DollarSign,
  Users,
  Calendar,
  Layers,
  HelpCircle,
  Eye,
  Trash2,
  FileCheck,
  Check,
  ExternalLink,
  ChevronDown,
  Info,
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import { SummaryCard, SummaryCardGrid } from '@/components/ui/SummaryCard';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

export default function AuctionsHubPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: 32 }}>Loading Auction Workspace...</div>}>
      <AuctionsContent />
    </Suspense>
  );
}

function AuctionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [auctions, setAuctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');
  const [kpis, setKpis] = useState({
    total: 0,
    live: 0,
    upcoming: 0,
    draft: 0,
    completed: 0,
    pending: 0,
  });

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((data) => {
        if (data?.user?.role) setUserRole(data.user.role);
      })
      .catch(() => {});
  }, []);

  const canManage =
    userRole === 'PROCUREMENT_USER' ||
    userRole === 'CATEGORY_MANAGER' ||
    userRole === 'SUPER_ADMIN' ||
    userRole === 'CLIENT_ADMIN';

  // Filters & Tabs
  const [activeTab, setActiveTab] = useState<'ALL' | 'LIVE' | 'UPCOMING' | 'DRAFT' | 'COMPLETED' | 'RESULTS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Guided Creation Workspace Modal / View
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [rfqOptions, setRfqOptions] = useState<any[]>([]);
  const [projectUsers, setProjectUsers] = useState<any[]>([]);
  const [rfqOptionsLoading, setRfqOptionsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Wizard Form State
  const [selectedRfqId, setSelectedRfqId] = useState('');
  const [auctionName, setAuctionName] = useState('');
  const [auctionCategory, setAuctionCategory] = useState<'RFQ_TOTAL_WISE' | 'ITEM_WISE'>('RFQ_TOTAL_WISE');
  const [auctionType, setAuctionType] = useState<'REVERSE_AUCTION' | 'FORWARD_AUCTION' | 'SEALED_BID'>('REVERSE_AUCTION');
  const [currency, setCurrency] = useState('INR');
  const [refreshInterval, setRefreshInterval] = useState(15);
  const [scrollingText, setScrollingText] = useState('Welcome to the ProCPX Live Auction. Please observe the minimum decrement rules.');

  // Scheduling (IST)
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // Rules & Controls
  const [quantityType, setQuantityType] = useState<'FULL' | 'SINGLE'>('FULL');
  const [hasStartPrice, setHasStartPrice] = useState(true);
  const [startingPrice, setStartingPrice] = useState<number | ''>('');
  const [hasLeadingPrice, setHasLeadingPrice] = useState(true);
  const [hasMinBidReduction, setHasMinBidReduction] = useState(true);
  const [minDecrement, setMinDecrement] = useState<number | ''>(5000);
  const [hasAutoExtension, setHasAutoExtension] = useState(true);
  const [autoExtensionMinutes, setAutoExtensionMinutes] = useState(3);
  const [hasBidLimit, setHasBidLimit] = useState(false);
  const [maxBids, setMaxBids] = useState(10);
  const [inviteProjectUser, setInviteProjectUser] = useState(false);
  const [selectedProjectUserId, setSelectedProjectUserId] = useState('');

  // Vendors Shuttle
  const [availableVendors, setAvailableVendors] = useState<any[]>([]);
  const [invitedVendorIds, setInvitedVendorIds] = useState<string[]>([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [nonInvitedJustification, setNonInvitedJustification] = useState('');

  // Items
  const [auctionItems, setAuctionItems] = useState<any[]>([]);

  // Documents & Terms
  const [documents, setDocuments] = useState<any[]>([
    { name: 'Commercial_Terms_v1.pdf', size: '245 KB', uploadedAt: new Date().toISOString() },
  ]);
  const [termsAndConditions, setTermsAndConditions] = useState(
    '1. Bids submitted are irrevocable and legally binding for 60 calendar days.\n' +
    '2. Vendors must adhere to the configured decrement / increment minimums.\n' +
    '3. Dynamic auto-extensions occur if competitive bids are logged in the closing window.\n' +
    '4. Final award recommendation is subject to commercial benchmarking and internal governance approvals.'
  );

  // Check URL query parameters on load
  useEffect(() => {
    fetchAuctions();
    fetchRfqOptions();

    const createParam = searchParams.get('create');
    const rfqIdParam = searchParams.get('rfqId');
    if (createParam === 'true' || rfqIdParam) {
      setShowCreateWizard(true);
      if (rfqIdParam) {
        setSelectedRfqId(rfqIdParam);
      }
    }
  }, [searchParams]);

  // When selected RFQ changes, populate vendors, lines, and benchmark prices
  useEffect(() => {
    if (!selectedRfqId || rfqOptions.length === 0) return;
    const rfq = rfqOptions.find((r) => r.id === selectedRfqId);
    if (!rfq) return;

    if (!auctionName) {
      setAuctionName(`${rfq.packageName || rfq.title} — E-Auction Event`);
    }

    // Set starting price default from L1 quote or estimated rate
    if (rfq.lowestQuotedAmount && !startingPrice) {
      setStartingPrice(rfq.lowestQuotedAmount);
    }

    // Populate vendors shuttle
    const vendors = rfq.quotedVendors || [];
    setAvailableVendors(vendors);
    // By default, pre-invite all vendors who submitted quotations
    const quotedIds = vendors.filter((v: any) => v.hasSubmittedQuote).map((v: any) => v.vendorId);
    setInvitedVendorIds(quotedIds.length > 0 ? quotedIds : vendors.map((v: any) => v.vendorId));

    // Populate items
    setAuctionItems(
      (rfq.lines || []).map((l: any) => ({
        rfqLineId: l.id,
        itemCode: l.itemCode,
        description: l.description,
        boqDescription: l.boqDescription,
        category: l.category,
        subCategory: l.subCategory,
        uom: l.uom,
        quantity: l.quantity,
        startPrice: l.estimatedRate || '',
      }))
    );

    // Initialize default schedule dates: tomorrow starting 10:00 AM IST to 12:00 PM IST
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dateStr = tomorrow.toISOString().split('T')[0];
    if (!startDate) setStartDate(dateStr);
    if (!startTime) setStartTime('10:00');
    if (!endDate) setEndDate(dateStr);
    if (!endTime) setEndTime('12:00');
  }, [selectedRfqId, rfqOptions]);

  const fetchAuctions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/procurement/auctions?tab=${activeTab}`);
      const data = await res.json();
      if (data.auctions) {
        setAuctions(data.auctions);
      }
      if (data.kpis) {
        setKpis(data.kpis);
      }
    } catch (err) {
      console.error(err);
      toast.error({ title: 'Error', message: 'Failed to load auction events' });
    } finally {
      setLoading(false);
    }
  };

  const fetchRfqOptions = async () => {
    setRfqOptionsLoading(true);
    try {
      const res = await fetch('/api/procurement/auctions/rfq-options');
      const data = await res.json();
      if (data.rfqs) {
        setRfqOptions(data.rfqs);
      }
      if (data.projectUsers) {
        setProjectUsers(data.projectUsers);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRfqOptionsLoading(false);
    }
  };

  // Re-fetch when active tab changes
  useEffect(() => {
    fetchAuctions();
  }, [activeTab]);

  // Selected RFQ object
  const currentRfq = useMemo(() => {
    return rfqOptions.find((r) => r.id === selectedRfqId) || null;
  }, [rfqOptions, selectedRfqId]);

  // Quoted vendors that are NOT invited
  const nonInvitedQuotedVendors = useMemo(() => {
    return availableVendors.filter(
      (v) => v.hasSubmittedQuote && !invitedVendorIds.includes(v.vendorId)
    );
  }, [availableVendors, invitedVendorIds]);

  // Filtered auctions list
  const filteredAuctions = useMemo(() => {
    return auctions.filter((auc) => {
      if (categoryFilter !== 'ALL' && auc.auctionCategory !== categoryFilter) return false;
      if (typeFilter !== 'ALL' && auc.auctionType !== typeFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchNum = auc.auctionNumber?.toLowerCase().includes(q);
        const matchTitle = auc.title?.toLowerCase().includes(q);
        const matchRfq = auc.rfqNumber?.toLowerCase().includes(q);
        const matchPr = auc.prNumber?.toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchRfq && !matchPr) return false;
      }
      return true;
    });
  }, [auctions, categoryFilter, typeFilter, searchTerm]);

  // Handle Save / Schedule Auction
  const handleSaveAuction = async (isDraft: boolean) => {
    if (!selectedRfqId) {
      toast.error({ title: 'Validation', message: 'Please select an RFQ package.' });
      setWizardStep(1);
      return;
    }
    if (!auctionName.trim()) {
      toast.error({ title: 'Validation', message: 'Please enter an Auction Name.' });
      setWizardStep(1);
      return;
    }
    if (!isDraft && invitedVendorIds.length === 0) {
      toast.error({ title: 'Validation', message: 'Please invite at least one vendor.' });
      setWizardStep(4);
      return;
    }
    if (!isDraft && nonInvitedQuotedVendors.length > 0 && !nonInvitedJustification.trim()) {
      toast.error({
        title: 'Mandatory Policy Requirement',
        message: 'Please provide justification comments for excluding quoted vendors.',
      });
      setWizardStep(4);
      return;
    }

    // Build ISO timestamps in IST
    const startIso = startDate && startTime ? new Date(`${startDate}T${startTime}:00+05:30`).toISOString() : new Date().toISOString();
    const endIso = endDate && endTime ? new Date(`${endDate}T${endTime}:00+05:30`).toISOString() : new Date(Date.now() + 2 * 3600000).toISOString();

    if (!isDraft && new Date(endIso) <= new Date(startIso)) {
      toast.error({ title: 'Invalid Schedule', message: 'Auction End Time must be later than Start Time.' });
      setWizardStep(2);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        rfqId: selectedRfqId,
        title: auctionName,
        auctionCategory,
        auctionType,
        currency,
        refreshIntervalSeconds: Number(refreshInterval),
        scrollingText,
        quantityType,
        hasStartPrice,
        startingPrice: hasStartPrice && startingPrice ? Number(startingPrice) : null,
        hasLeadingPrice: auctionType === 'SEALED_BID' ? false : hasLeadingPrice,
        hasMinBidReduction,
        minDecrement: hasMinBidReduction && minDecrement ? Number(minDecrement) : 0,
        hasAutoExtension,
        autoExtensionMinutes: Number(autoExtensionMinutes),
        hasBidLimit,
        maxBidsPerParticipant: auctionType === 'SEALED_BID' ? 1 : Number(maxBids),
        inviteProjectUser,
        projectUserId: inviteProjectUser ? selectedProjectUserId : null,
        invitedVendorIds,
        nonInvitedJustification,
        items: auctionItems,
        documents,
        termsAndConditions,
        startTime: startIso,
        endTime: endIso,
        isDraft,
      };

      const res = await fetch('/api/procurement/auctions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save auction');

      toast.success({
        title: isDraft ? 'Draft Saved' : 'Auction Scheduled',
        message: data.message || `Auction ${data.auction?.auctionNumber} saved successfully.`,
      });

      setShowCreateWizard(false);
      resetWizard();
      fetchAuctions();
    } catch (err: any) {
      toast.error({ title: 'Auction Creation Failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setSelectedRfqId('');
    setAuctionName('');
    setStartingPrice('');
    setInvitedVendorIds([]);
    setNonInvitedJustification('');
    setAuctionItems([]);
  };

  // Vendor shuttle helpers
  const toggleVendorInvite = (vendorId: string) => {
    setInvitedVendorIds((prev) =>
      prev.includes(vendorId) ? prev.filter((id) => id !== vendorId) : [...prev, vendorId]
    );
  };

  const inviteAllVendors = () => {
    setInvitedVendorIds(availableVendors.map((v) => v.vendorId));
  };

  const removeAllVendors = () => {
    setInvitedVendorIds([]);
  };

  const formatIST = (dateStr: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }) + ' IST';
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Page Header */}
      <PageHeader
        title="B2B E-Auction Management Workspace"
        subtitle="Configure, schedule, monitor live bidding, and govern Reverse Auctions, Forward Auctions, and Sealed Bids in India Standard Time (IST)"
        breadcrumbs={[
          { label: 'Procurement', href: '/procurement/rfqs' },
          { label: 'Auctions Workspace' },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={fetchAuctions}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  resetWizard();
                  setShowCreateWizard(true);
                }}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={14} /> Create E-Auction
              </button>
            )}
          </div>
        }
      />

      {/* Observer Mode Notice Banner */}
      {!canManage && userRole && (
        <div
          style={{
            padding: '12px 18px',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 8,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#92400e',
            fontSize: 13,
          }}
        >
          <Shield size={18} color="#d97706" />
          <div>
            <strong>Observer Access ({userRole})</strong>: You are viewing the Auctions Workspace in read-only mode. Event configuration, scheduling, and live buyer controls are restricted to procurement officers.
          </div>
        </div>
      )}

      {/* 6 Summary KPI Cards */}
      <div className="mb-6">
        <SummaryCardGrid columns={6}>
          <SummaryCard
            label="Total Auctions"
            value={kpis.total}
            secondary="All tenant auctions"
            icon={<Gavel size={16} />}
            accent="default"
          />
          <SummaryCard
            label="Live Auctions"
            value={kpis.live}
            secondary="Accepting real-time bids"
            icon={<Clock size={16} />}
            accent="amber"
          />
          <SummaryCard
            label="Upcoming"
            value={kpis.upcoming}
            secondary="Scheduled events"
            icon={<Calendar size={16} />}
            accent="blue"
          />
          <SummaryCard
            label="Drafts"
            value={kpis.draft}
            secondary="Configurations in progress"
            icon={<FileText size={16} />}
            accent="default"
          />
          <SummaryCard
            label="Completed"
            value={kpis.completed}
            secondary="Concluded & awarded"
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
          <SummaryCard
            label="Pending Actions"
            value={kpis.pending}
            secondary="Drafts & awards pending"
            icon={<AlertCircle size={16} />}
            accent="rose"
          />
        </SummaryCardGrid>
      </div>

      {/* Main Register Card */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {/* Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 16px' }}>
          {[
            { id: 'ALL', label: 'All Auctions', count: kpis.total },
            { id: 'LIVE', label: 'Live Bidding', count: kpis.live, pulse: kpis.live > 0 },
            { id: 'UPCOMING', label: 'Upcoming', count: kpis.upcoming },
            { id: 'DRAFT', label: 'Drafts', count: kpis.draft },
            { id: 'COMPLETED', label: 'Completed', count: kpis.completed },
            { id: 'RESULTS', label: 'Results & History', count: kpis.completed },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '12px 18px',
                fontSize: 13,
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? '#0284c7' : '#64748b',
                borderBottom: activeTab === tab.id ? '2px solid #0284c7' : '2px solid transparent',
                background: 'transparent',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {tab.pulse && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#f59e0b',
                    display: 'inline-block',
                    boxShadow: '0 0 0 2px rgba(245, 158, 11, 0.4)',
                  }}
                />
              )}
              {tab.label}
              <span
                style={{
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 10,
                  background: activeTab === tab.id ? '#e0f2fe' : '#f1f5f9',
                  color: activeTab === tab.id ? '#0369a1' : '#64748b',
                  fontWeight: 600,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Toolbar & Filters */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: '#ffffff' }}>
          <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: 400 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search by Auction #, Title, RFQ, PR..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: 32, fontSize: 13, height: 36 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="form-control"
              style={{ fontSize: 12, height: 36, width: 160 }}
            >
              <option value="ALL">All Categories</option>
              <option value="RFQ_TOTAL_WISE">RFQ Total Wise</option>
              <option value="ITEM_WISE">Item Wise</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="form-control"
              style={{ fontSize: 12, height: 36, width: 170 }}
            >
              <option value="ALL">All Auction Types</option>
              <option value="REVERSE_AUCTION">Reverse Auction</option>
              <option value="FORWARD_AUCTION">Forward Auction</option>
              <option value="SEALED_BID">Sealed Bid</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>
            Showing <strong>{filteredAuctions.length}</strong> events
          </div>
        </div>

        {/* Auction Table */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            Synchronising auction data with server...
          </div>
        ) : filteredAuctions.length === 0 ? (
          <div style={{ padding: 48 }}>
            <EmptyState
              icon={<Gavel size={40} strokeWidth={1.5} color="#94a3b8" />}
              title="No Auctions Matching Filters"
              description="Schedule a new Reverse Auction, Forward Auction, or Sealed Bid from any active RFQ package."
              actionText={canManage ? 'Create New E-Auction' : undefined}
              onAction={canManage ? () => setShowCreateWizard(true) : undefined}
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ width: 140, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>Auction ID</th>
                  <th style={{ minWidth: 200, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>Auction Name</th>
                  <th style={{ width: 150, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>PR / BOQ Ref</th>
                  <th style={{ width: 130, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>RFQ Ref</th>
                  <th style={{ width: 130, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>Auction Type</th>
                  <th style={{ width: 130, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>Category</th>
                  <th style={{ width: 170, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>Start Time (IST)</th>
                  <th style={{ width: 170, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>End Time (IST)</th>
                  <th style={{ width: 110, padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>Vendors</th>
                  <th style={{ width: 120, padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>Status</th>
                  <th style={{ width: 140, padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuctions.map((auc) => {
                  const isLive = auc.status === 'LIVE' || auc.status === 'EXTENDED';
                  return (
                    <tr
                      key={auc.id}
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        background: isLive ? '#fefce8' : '#ffffff',
                      }}
                    >
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#0284c7' }}>
                        {auc.auctionNumber}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{auc.title}</div>
                        {auc.currentLeadingBid ? (
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>
                            Leading: {auc.currency} {Number(auc.currentLeadingBid).toLocaleString('en-IN')}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                            Ceiling: {auc.currency} {Number(auc.startingPrice || 0).toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{auc.prNumber || '—'}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{auc.boqNumber || auc.costCentre || ''}</div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Link href={`/procurement/rfqs/${auc.rfqId}`} className="font-mono" style={{ fontSize: 12, color: '#0284c7', fontWeight: 600 }}>
                          {auc.rfqNumber}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          className={`badge ${
                            auc.auctionType === 'REVERSE_AUCTION'
                              ? 'badge-info'
                              : auc.auctionType === 'FORWARD_AUCTION'
                              ? 'badge-warning'
                              : 'badge-purple'
                          }`}
                          style={{ fontSize: 11 }}
                        >
                          {auc.auctionType === 'REVERSE_AUCTION'
                            ? 'Reverse'
                            : auc.auctionType === 'FORWARD_AUCTION'
                            ? 'Forward'
                            : 'Sealed Bid'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12 }}>
                        {auc.auctionCategory === 'ITEM_WISE' ? 'Item Wise' : 'RFQ Total Wise'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#334155' }}>
                        {formatIST(auc.startTime)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#334155' }}>
                        {formatIST(auc.scheduledEndTime || auc.endTime)}
                        {auc.extensionCount > 0 && (
                          <span style={{ display: 'block', fontSize: 10, color: '#d97706', fontWeight: 600 }}>
                            Extended ({auc.extensionCount}x)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{auc.invitedVendorsCount}</span> invited
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <StatusBadge status={auc.status} />
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <Link
                          href={`/procurement/auctions/${auc.id}`}
                          className={`btn btn-sm ${isLive ? 'btn-primary' : 'btn-secondary'}`}
                          style={{
                            fontSize: 12,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            fontWeight: 600,
                          }}
                        >
                          {isLive ? (
                            <>
                              <Clock size={12} className="animate-pulse" /> Monitor Live
                            </>
                          ) : auc.status === 'DRAFT' ? (
                            'Edit Draft'
                          ) : (
                            'View Details'
                          )}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* GUIDED CREATE AUCTION WORKSPACE MODAL */}
      {showCreateWizard && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 1060,
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
            }}
          >
            {/* Wizard Header */}
            <div
              style={{
                padding: '18px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Gavel size={20} color="#0284c7" /> Configure & Schedule E-Auction Event
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                  Step {wizardStep} of 6 — Fully aligned with ProCapex mandatory procurement auction rules
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateWizard(false)}
                className="btn btn-secondary btn-sm"
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Step Progress Indicator */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid #e2e8f0',
                background: '#ffffff',
                overflowX: 'auto',
              }}
            >
              {[
                { step: 1, label: '1. Auction Details' },
                { step: 2, label: '2. Scheduling & IST' },
                { step: 3, label: '3. Rules & Options' },
                { step: 4, label: '4. Vendor Selection' },
                { step: 5, label: '5. Items & Pricing' },
                { step: 6, label: '6. Review & Schedule' },
              ].map((s) => (
                <button
                  key={s.step}
                  type="button"
                  onClick={() => setWizardStep(s.step)}
                  style={{
                    flex: '1 1 auto',
                    padding: '12px 14px',
                    fontSize: 12,
                    fontWeight: wizardStep === s.step ? 700 : 500,
                    color: wizardStep === s.step ? '#0284c7' : wizardStep > s.step ? '#059669' : '#64748b',
                    background: wizardStep === s.step ? '#f0f9ff' : 'transparent',
                    border: 'none',
                    borderBottom: wizardStep === s.step ? '2px solid #0284c7' : '2px solid transparent',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                  }}
                >
                  {wizardStep > s.step ? `✓ ${s.label.split('. ')[1]}` : s.label}
                </button>
              ))}
            </div>

            {/* Step Content Body */}
            <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, background: '#ffffff' }}>
              {/* STEP 1: AUCTION DETAILS */}
              {wizardStep === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                        Select Sourcing RFQ Package <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <select
                        value={selectedRfqId}
                        onChange={(e) => setSelectedRfqId(e.target.value)}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      >
                        <option value="">-- Choose Approved RFQ --</option>
                        {rfqOptions.map((rfq) => (
                          <option key={rfq.id} value={rfq.id}>
                            {rfq.rfqNumber} — {rfq.title} ({rfq.quotedVendors?.length || 0} quoted vendors)
                          </option>
                        ))}
                      </select>
                      {currentRfq && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
                          Linked PR: <strong>{currentRfq.prNumber || '—'}</strong> | BOQ: <strong>{currentRfq.boqNumber || '—'}</strong>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                        Auction Event Name <span style={{ color: '#ef4444' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={auctionName}
                        onChange={(e) => setAuctionName(e.target.value)}
                        placeholder="e.g. Reverse Auction — Electrical Substation Equipment"
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  {/* Auction Category: RFQ Total Wise vs Item Wise */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                      Auction Category <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div
                        onClick={() => setAuctionCategory('RFQ_TOTAL_WISE')}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          border: auctionCategory === 'RFQ_TOTAL_WISE' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: auctionCategory === 'RFQ_TOTAL_WISE' ? '#f0f9ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>RFQ Total Wise</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          Bidders submit decrements on the combined overall package amount.
                        </div>
                      </div>

                      <div
                        onClick={() => setAuctionCategory('ITEM_WISE')}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          border: auctionCategory === 'ITEM_WISE' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: auctionCategory === 'ITEM_WISE' ? '#f0f9ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>Item Wise</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                          Bidders compete on individual line items independently.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Auction Type: Reverse, Forward, Sealed Bid */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
                      Auction Type <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                      <div
                        onClick={() => setAuctionType('REVERSE_AUCTION')}
                        style={{
                          padding: 14,
                          borderRadius: 8,
                          border: auctionType === 'REVERSE_AUCTION' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: auctionType === 'REVERSE_AUCTION' ? '#f0f9ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Reverse Auction</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                          Eligible vendors submit successively lower prices to compete for L1.
                        </div>
                      </div>

                      <div
                        onClick={() => setAuctionType('FORWARD_AUCTION')}
                        style={{
                          padding: 14,
                          borderRadius: 8,
                          border: auctionType === 'FORWARD_AUCTION' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: auctionType === 'FORWARD_AUCTION' ? '#f0f9ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Forward Auction</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                          Participants submit higher prices (asset disposals / scrap sale).
                        </div>
                      </div>

                      <div
                        onClick={() => setAuctionType('SEALED_BID')}
                        style={{
                          padding: 14,
                          borderRadius: 8,
                          border: auctionType === 'SEALED_BID' ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: auctionType === 'SEALED_BID' ? '#f0f9ff' : '#ffffff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Sealed Bid</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                          Strictly 1 confidential bid per participant. Revealed only after closure.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Currency, Refresh Interval & Scrolling Text */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                        Auction Currency
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      >
                        <option value="INR">INR (₹) — Indian Rupee</option>
                        <option value="USD">USD ($) — US Dollar</option>
                        <option value="EUR">EUR (€) — Euro</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                        Automatic Page Refresh Interval (Seconds)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      />
                      <span style={{ fontSize: 11, color: '#64748b' }}>Default 15 seconds. Prevents input disruption.</span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                      Scrolling Announcement Banner (Visible to all participants)
                    </label>
                    <input
                      type="text"
                      value={scrollingText}
                      onChange={(e) => setScrollingText(e.target.value)}
                      placeholder="e.g. Critical: Please note that taxes are excluded from unit rates."
                      className="form-control"
                      style={{ height: 38, fontSize: 13 }}
                    />
                  </div>
                </div>
              )}

              {/* STEP 2: SCHEDULING (IST) */}
              {wizardStep === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div
                    style={{
                      padding: 16,
                      background: '#f0f9ff',
                      border: '1px solid #bae6fd',
                      borderRadius: 8,
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Clock size={24} color="#0284c7" />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0369a1' }}>
                        Time Zone Authority: India Standard Time (IST, UTC+05:30)
                      </div>
                      <div style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>
                        All countdown timers, auction opening, closing, and automatic extensions will be governed strictly by server-authoritative IST.
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                        Auction Start Time (IST)
                      </h4>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Date</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="form-control"
                            style={{ height: 38 }}
                          />
                        </div>
                        <div style={{ width: 120 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Time</label>
                          <input
                            type="time"
                            value={startTime}
                            onChange={(e) => setStartTime(e.target.value)}
                            className="form-control"
                            style={{ height: 38 }}
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                        Auction End Time (IST)
                      </h4>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Date</label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="form-control"
                            style={{ height: 38 }}
                          />
                        </div>
                        <div style={{ width: 120 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>Time</label>
                          <input
                            type="time"
                            value={endTime}
                            onChange={(e) => setEndTime(e.target.value)}
                            className="form-control"
                            style={{ height: 38 }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Duration Buttons */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
                      Quick Schedule Presets:
                    </label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { label: 'Next 1 Hour', dur: 1 },
                        { label: 'Next 2 Hours', dur: 2 },
                        { label: 'Tomorrow 10:00 AM – 12:00 PM', tomorrow: true },
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const now = new Date();
                            if (preset.tomorrow) {
                              const tom = new Date(now.getTime() + 24 * 3600000);
                              const d = tom.toISOString().split('T')[0];
                              setStartDate(d);
                              setStartTime('10:00');
                              setEndDate(d);
                              setEndTime('12:00');
                            } else {
                              const dur = preset.dur || 1;
                              const s = new Date(now.getTime() + 5 * 60000); // 5 mins from now
                              const e = new Date(s.getTime() + dur * 3600000);
                              setStartDate(s.toISOString().split('T')[0]);
                              setStartTime(s.toTimeString().slice(0, 5));
                              setEndDate(e.toISOString().split('T')[0]);
                              setEndTime(e.toTimeString().slice(0, 5));
                            }
                          }}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: 12 }}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: RULES & CONTROLS */}
              {wizardStep === 3 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Quantity Type */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Auction Quantity Basis</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Full = complete RFQ BOQ quantity. Single = unit-rate basis competition.
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="quantityType"
                          checked={quantityType === 'FULL'}
                          onChange={() => setQuantityType('FULL')}
                        />
                        Full Quantity
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="quantityType"
                          checked={quantityType === 'SINGLE'}
                          onChange={() => setQuantityType('SINGLE')}
                        />
                        Single Unit Rate
                      </label>
                    </div>
                  </div>

                  {/* Start Price */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Auction Start Price</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          If enabled, bidders cannot exceed this ceiling (Reverse) or floor (Forward).
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasStartPrice"
                            checked={hasStartPrice}
                            onChange={() => setHasStartPrice(true)}
                          />
                          Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasStartPrice"
                            checked={!hasStartPrice}
                            onChange={() => setHasStartPrice(false)}
                          />
                          No
                        </label>
                      </div>
                    </div>
                    {hasStartPrice && auctionCategory === 'RFQ_TOTAL_WISE' && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Starting Price ({currency}):</span>
                        <input
                          type="number"
                          value={startingPrice}
                          onChange={(e) => setStartingPrice(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 1500000"
                          className="form-control"
                          style={{ width: 220, height: 36 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Display Leading Price */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Display Leading Price to Participants</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {auctionType === 'SEALED_BID'
                          ? 'Strictly disabled for Sealed Bid to enforce complete bid confidentiality.'
                          : 'Show the lowest (Reverse) or highest (Forward) valid bid on vendor live screens.'}
                      </div>
                    </div>
                    {auctionType === 'SEALED_BID' ? (
                      <span className="badge badge-warning" style={{ fontSize: 11 }}>Confidential (Disabled)</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasLeadingPrice"
                            checked={hasLeadingPrice}
                            onChange={() => setHasLeadingPrice(true)}
                          />
                          Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasLeadingPrice"
                            checked={!hasLeadingPrice}
                            onChange={() => setHasLeadingPrice(false)}
                          />
                          No (Rank Only)
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Minimum Bid Reduction / Increment */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Minimum Bid Reduction / Increment</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          Enforce minimum decrements (Reverse) or increments (Forward) between subsequent bids.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasMinBidReduction"
                            checked={hasMinBidReduction}
                            onChange={() => setHasMinBidReduction(true)}
                          />
                          Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasMinBidReduction"
                            checked={!hasMinBidReduction}
                            onChange={() => setHasMinBidReduction(false)}
                          />
                          No
                        </label>
                      </div>
                    </div>
                    {hasMinBidReduction && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Minimum Delta Amount ({currency}):</span>
                        <input
                          type="number"
                          value={minDecrement}
                          onChange={(e) => setMinDecrement(e.target.value ? Number(e.target.value) : '')}
                          placeholder="e.g. 5000"
                          className="form-control"
                          style={{ width: 180, height: 36 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Automatic Auction Extension */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>Automatic Rolling Extension</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>
                          Extends end time automatically when a valid bid is logged in the final minutes.
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasAutoExtension"
                            checked={hasAutoExtension}
                            onChange={() => setHasAutoExtension(true)}
                          />
                          Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasAutoExtension"
                            checked={!hasAutoExtension}
                            onChange={() => setHasAutoExtension(false)}
                          />
                          No
                        </label>
                      </div>
                    </div>
                    {hasAutoExtension && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Extension Duration (Minutes):</span>
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={autoExtensionMinutes}
                          onChange={(e) => setAutoExtensionMinutes(Number(e.target.value))}
                          className="form-control"
                          style={{ width: 140, height: 36 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Bid Limits & Project User Observer */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                        Limit Bids Per Participant
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasBidLimit"
                            checked={hasBidLimit}
                            onChange={() => setHasBidLimit(true)}
                          />
                          Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasBidLimit"
                            checked={!hasBidLimit}
                            onChange={() => setHasBidLimit(false)}
                          />
                          No
                        </label>
                      </div>
                      {hasBidLimit && (
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={maxBids}
                          onChange={(e) => setMaxBids(Number(e.target.value))}
                          className="form-control"
                          style={{ width: 140, height: 36 }}
                        />
                      )}
                    </div>

                    <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>
                        Invite Project User (Observer)
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="inviteProjectUser"
                            checked={inviteProjectUser}
                            onChange={() => setInviteProjectUser(true)}
                          />
                          Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="inviteProjectUser"
                            checked={!inviteProjectUser}
                            onChange={() => setInviteProjectUser(false)}
                          />
                          No
                        </label>
                      </div>
                      {inviteProjectUser && (
                        <select
                          value={selectedProjectUserId}
                          onChange={(e) => setSelectedProjectUserId(e.target.value)}
                          className="form-control"
                          style={{ height: 36, fontSize: 12 }}
                        >
                          <option value="">-- Select Project Observer --</option>
                          {projectUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name} ({u.role})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: VENDOR SELECTION (SHUTTLE) */}
              {wizardStep === 4 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                        Invite Eligible Quoted Vendors
                      </h4>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                        Vendors who submitted quotes for this RFQ are displayed below.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={inviteAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 12 }}
                      >
                        Invite All
                      </button>
                      <button
                        type="button"
                        onClick={removeAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 12 }}
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>

                  {/* Shuttle Dual List */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 14, alignItems: 'center' }}>
                    {/* Available Vendors */}
                    <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', fontWeight: 700, fontSize: 12, color: '#1e293b' }}>
                        Available Quoted Vendors ({availableVendors.length})
                      </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
                        {availableVendors.length === 0 ? (
                          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                            No quoted vendors for this RFQ
                          </div>
                        ) : (
                          availableVendors.map((v) => {
                            const isInvited = invitedVendorIds.includes(v.vendorId);
                            return (
                              <div
                                key={v.vendorId}
                                onClick={() => toggleVendorInvite(v.vendorId)}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  border: '1px solid',
                                  borderColor: isInvited ? '#0284c7' : '#e2e8f0',
                                  background: isInvited ? '#f0f9ff' : '#ffffff',
                                  marginBottom: 6,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a' }}>{v.name}</div>
                                  <div style={{ fontSize: 11, color: '#64748b' }}>
                                    {v.code} | Quoted: ₹{v.quoteAmount ? v.quoteAmount.toLocaleString('en-IN') : '—'}
                                  </div>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isInvited ? '#0284c7' : '#94a3b8' }}>
                                  {isInvited ? '✓ Invited' : '+ Add'}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Transfer Icons */}
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={inviteAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 10px' }}
                        title="Add All"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        onClick={removeAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 10px' }}
                        title="Remove All"
                      >
                        ←
                      </button>
                    </div>

                    {/* Invited Vendors List */}
                    <div style={{ border: '1px solid #0284c7', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', fontWeight: 700, fontSize: 12, color: '#0369a1' }}>
                        Invited Auction Participants ({invitedVendorIds.length})
                      </div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
                        {invitedVendorIds.length === 0 ? (
                          <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontSize: 12 }}>
                            No vendors invited yet. Please select at least one vendor.
                          </div>
                        ) : (
                          availableVendors
                            .filter((v) => invitedVendorIds.includes(v.vendorId))
                            .map((v) => (
                              <div
                                key={v.vendorId}
                                style={{
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  background: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  marginBottom: 6,
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                }}
                              >
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 12, color: '#0f172a' }}>{v.name}</div>
                                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
                                    L-Benchmark: ₹{v.quoteAmount ? v.quoteAmount.toLocaleString('en-IN') : '—'}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleVendorInvite(v.vendorId)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '2px 8px', fontSize: 11, color: '#ef4444' }}
                                >
                                  Remove
                                </button>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mandatory Non-Invited Vendor Justification */}
                  {nonInvitedQuotedVendors.length > 0 && (
                    <div
                      style={{
                        padding: 16,
                        background: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: 8,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <AlertCircle size={18} color="#d97706" />
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>
                          Mandatory Compliance Justification for Non-Invited Vendors *
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78350f' }}>
                        {nonInvitedQuotedVendors.length} vendor(s) who submitted quotations ({nonInvitedQuotedVendors.map((v) => v.name).join(', ')}) are excluded from this auction. In accordance with procurement governance policy, provide an explicit justification for the audit trail:
                      </p>
                      <textarea
                        rows={3}
                        value={nonInvitedJustification}
                        onChange={(e) => setNonInvitedJustification(e.target.value)}
                        placeholder="State technical, commercial, or compliance rationale for excluding quoted vendors..."
                        className="form-control"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* STEP 5: ITEMS & PRICING */}
              {wizardStep === 5 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                        RFQ Scope Items ({auctionItems.length})
                      </h4>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                        {auctionCategory === 'ITEM_WISE'
                          ? 'Item-Wise Auction: configure starting prices for each individual item line.'
                          : 'RFQ Total-Wise Auction: items are bundled under the total starting ceiling price.'}
                      </p>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                    <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ width: 50, padding: 8 }}>S.No</th>
                          <th style={{ width: 110, padding: 8 }}>Item Code</th>
                          <th style={{ width: 140, padding: 8 }}>Category</th>
                          <th style={{ minWidth: 200, padding: 8 }}>Description</th>
                          <th style={{ width: 80, padding: 8 }}>UOM</th>
                          <th style={{ width: 90, padding: 8, textAlign: 'right' }}>Qty</th>
                          {hasStartPrice && (
                            <th style={{ width: 150, padding: 8, textAlign: 'right' }}>
                              Start Price ({currency})
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {auctionItems.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: 8, textAlign: 'center' }}>{idx + 1}</td>
                            <td style={{ padding: 8, fontFamily: 'monospace', fontWeight: 600 }}>{item.itemCode}</td>
                            <td style={{ padding: 8 }}>{item.category}</td>
                            <td style={{ padding: 8 }}>
                              <div style={{ fontWeight: 600 }}>{item.description}</div>
                              {item.boqDescription && (
                                <div style={{ fontSize: 11, color: '#64748b' }}>{item.boqDescription}</div>
                              )}
                            </td>
                            <td style={{ padding: 8 }}>{item.uom}</td>
                            <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{item.quantity}</td>
                            {hasStartPrice && (
                              <td style={{ padding: 8, textAlign: 'right' }}>
                                <input
                                  type="number"
                                  value={item.startPrice}
                                  onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : '';
                                    setAuctionItems((prev) =>
                                      prev.map((it, i) => (i === idx ? { ...it, startPrice: val } : it))
                                    );
                                  }}
                                  placeholder="0.00"
                                  className="form-control"
                                  style={{ height: 32, fontSize: 12, textAlign: 'right' }}
                                />
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* STEP 6: REVIEW & SCHEDULE */}
              {wizardStep === 6 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ padding: 16, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      Executive Summary & Pre-Schedule Verification
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>Auction Event:</span> <strong>{auctionName}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>RFQ Package:</span> <strong>{currentRfq?.rfqNumber}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Category & Type:</span>{' '}
                        <strong>
                          {auctionCategory === 'ITEM_WISE' ? 'Item Wise' : 'RFQ Total Wise'} | {auctionType}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Currency:</span> <strong>{currency}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Start Time (IST):</span>{' '}
                        <strong>{startDate} {startTime} IST</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>End Time (IST):</span>{' '}
                        <strong>{endDate} {endTime} IST</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Invited Vendors:</span>{' '}
                        <strong>{invitedVendorIds.length} vendors</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Rolling Extension:</span>{' '}
                        <strong>{hasAutoExtension ? `${autoExtensionMinutes} Minutes` : 'Disabled'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Start Ceiling Price:</span>{' '}
                        <strong>{hasStartPrice && startingPrice ? `${currency} ${Number(startingPrice).toLocaleString('en-IN')}` : 'None'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Min Decrement Delta:</span>{' '}
                        <strong>{hasMinBidReduction && minDecrement ? `${currency} ${Number(minDecrement).toLocaleString('en-IN')}` : 'Standard'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Conditions preview */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
                      Auction Terms & Conditions (Mandatory Acknowledgement for Vendors)
                    </label>
                    <textarea
                      rows={4}
                      value={termsAndConditions}
                      onChange={(e) => setTermsAndConditions(e.target.value)}
                      className="form-control"
                      style={{ fontSize: 12, fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Wizard Action Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid #e2e8f0',
                background: '#f8fafc',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                {wizardStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => prev - 1)}
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <ArrowLeft size={14} /> Back
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateWizard(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSaveAuction(true)}
                  className="btn btn-secondary btn-sm"
                >
                  Save as Draft
                </button>

                {wizardStep < 6 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((prev) => prev + 1)}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    Next Step <ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSaveAuction(false)}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Check size={14} /> {submitting ? 'Scheduling...' : 'Confirm & Schedule Auction'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
