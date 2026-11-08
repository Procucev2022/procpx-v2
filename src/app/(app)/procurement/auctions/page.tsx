'use client';
// app/(app)/procurement/auctions/page.tsx
// Complete Enterprise Auction Workspace: Dashboard, KPIs, Register, and Step-Based Guided Creation
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';
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
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";


export default function AuctionsHubPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: 32 }}>{UI_STRINGS.appAppProcurementAuctionsPage.loadingAuctionWorkspace}</div>}>
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
      .catch((error: unknown) => reportHandledClientFailure(error, {
        operation: 'load_auction_user_role', route: '/api/auth/session',
      }));
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
  const [selectedRfqDetails, setSelectedRfqDetails] = useState<(typeof rfqOptions)[number] | null>(null);
  const [projectUsers, setProjectUsers] = useState<any[]>([]);
  const [rfqOptionsLoading, setRfqOptionsLoading] = useState(false);
  const [rfqDetailsLoading, setRfqDetailsLoading] = useState(false);
  const [rfqListPage, setRfqListPage] = useState(1);
  const [rfqListPageSize, setRfqListPageSize] = useState(50);
  const [rfqListHasMore, setRfqListHasMore] = useState(false);
  const [loadingMoreRfqs, setLoadingMoreRfqs] = useState(false);
  const [projectUsersPage, setProjectUsersPage] = useState(1);
  const [projectUsersPageSize, setProjectUsersPageSize] = useState(50);
  const [projectUsersHasMore, setProjectUsersHasMore] = useState(false);
  const [loadingMoreProjectUsers, setLoadingMoreProjectUsers] = useState(false);
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

  // Load the selected RFQ's expanded line and quote data only when the buyer chooses it.
  useEffect(() => {
    if (!selectedRfqId) {
      setSelectedRfqDetails(null);
      setAvailableVendors([]);
      setAuctionItems([]);
      setInvitedVendorIds([]);
      setRfqDetailsLoading(false);
      return;
    }

    let active = true;
    setSelectedRfqDetails(null);
    setAvailableVendors([]);
    setAuctionItems([]);
    setInvitedVendorIds([]);
    setRfqDetailsLoading(true);

    const loadSelectedRfq = async () => {
      try {
        const res = await fetch(`/api/procurement/auctions/rfq-options?rfqId=${encodeURIComponent(selectedRfqId)}&includeObservers=false`);
        const data = await res.json();
        const rfq = Array.isArray(data.rfqs) ? data.rfqs[0] : null;
        if (!res.ok || !rfq) throw new Error(UI_STRINGS.common.userMessages.failedToFetchRfqOptions);
        if (!active) return;

        setSelectedRfqDetails(rfq);
        setAuctionName((current) => current || `${rfq.packageName || rfq.title} — E-Auction Event`);
        setStartingPrice((current) => current || rfq.lowestQuotedAmount || '');
        const vendors = rfq.quotedVendors || [];
        setAvailableVendors(vendors);
        const quotedIds = vendors.filter((vendor: any) => vendor.hasSubmittedQuote).map((vendor: any) => vendor.vendorId);
        setInvitedVendorIds(quotedIds.length > 0 ? quotedIds : vendors.map((vendor: any) => vendor.vendorId));
        setAuctionItems((rfq.lines || []).map((line: any) => ({
          rfqLineId: line.id,
          itemCode: line.itemCode,
          description: line.description,
          boqDescription: line.boqDescription,
          category: line.category,
          subCategory: line.subCategory,
          uom: line.uom,
          quantity: line.quantity,
          startPrice: line.estimatedRate || '',
        })));

        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        setStartDate((current) => current || tomorrow);
        setStartTime((current) => current || '10:00');
        setEndDate((current) => current || tomorrow);
        setEndTime((current) => current || '12:00');
      } catch {
        if (active) toast.error({ title: UI_STRINGS.common.error, message: UI_STRINGS.common.userMessages.failedToFetchRfqOptions });
      } finally {
        if (active) setRfqDetailsLoading(false);
      }
    };

    void loadSelectedRfq();
    return () => { active = false; };
  }, [selectedRfqId]);

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
      toast.error({ title: UI_STRINGS.common.error, message: UI_STRINGS.appAppProcurementAuctionsPage.failedToLoadAuctionEvents });
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
      setRfqListPage(data.rfqPage);
      setRfqListPageSize(data.rfqPageSize);
      setRfqListHasMore(data.rfqHasMore === true);
      if (data.projectUsers) {
        setProjectUsers(data.projectUsers);
      }
      if (Number.isSafeInteger(data.projectUsersPage)) setProjectUsersPage(data.projectUsersPage);
      if (Number.isSafeInteger(data.projectUsersPageSize)) setProjectUsersPageSize(data.projectUsersPageSize);
      setProjectUsersHasMore(data.projectUsersHasMore === true);
    } catch (err) {
      console.error(err);
    } finally {
      setRfqOptionsLoading(false);
    }
  };

  const loadMoreRfqs = async () => {
    const nextPage = rfqListPage + 1;
    setLoadingMoreRfqs(true);
    try {
      const res = await fetch(`/api/procurement/auctions/rfq-options?rfqPage=${nextPage}&rfqPageSize=${rfqListPageSize}&includeObservers=false`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.rfqs)) throw new Error(UI_STRINGS.common.userMessages.failedToFetchRfqOptions);
      setRfqOptions([...rfqOptions, ...data.rfqs]);
      setRfqListPage(data.rfqPage);
      setRfqListPageSize(data.rfqPageSize);
      setRfqListHasMore(data.rfqHasMore === true);
    } catch {
      toast.error({ title: UI_STRINGS.common.error, message: UI_STRINGS.common.userMessages.failedToFetchRfqOptions });
    } finally {
      setLoadingMoreRfqs(false);
    }
  };

  const loadMoreProjectUsers = async () => {
    const nextPage = projectUsersPage + 1;
    setLoadingMoreProjectUsers(true);
    try {
      const res = await fetch(`/api/procurement/auctions/rfq-options?usersOnly=true&page=${nextPage}&pageSize=${projectUsersPageSize}`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.projectUsers)) {
        throw new Error(UI_STRINGS.common.userMessages.failedToFetchRfqOptions);
      }
      setProjectUsers([...projectUsers, ...data.projectUsers]);
      setProjectUsersPage(data.projectUsersPage);
      setProjectUsersPageSize(data.projectUsersPageSize);
      setProjectUsersHasMore(data.projectUsersHasMore === true);
    } catch {
      toast.error({ title: UI_STRINGS.common.error, message: UI_STRINGS.common.userMessages.failedToFetchRfqOptions });
    } finally {
      setLoadingMoreProjectUsers(false);
    }
  };

  // Re-fetch when active tab changes
  useEffect(() => {
    fetchAuctions();
  }, [activeTab]);

  // Selected RFQ object
  const currentRfq = useMemo(() => {
    return (selectedRfqDetails?.id === selectedRfqId ? selectedRfqDetails : null)
      || rfqOptions.find((rfq) => rfq.id === selectedRfqId)
      || null;
  }, [rfqOptions, selectedRfqId, selectedRfqDetails]);

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
    if (!selectedRfqId || selectedRfqDetails?.id !== selectedRfqId || rfqDetailsLoading) {
      toast.error({ title: UI_STRINGS.common.validation, message: UI_STRINGS.appAppProcurementAuctionsPage.pleaseSelectAnRFQPackage });
      setWizardStep(1);
      return;
    }
    if (!auctionName.trim()) {
      toast.error({ title: UI_STRINGS.common.validation, message: UI_STRINGS.appAppProcurementAuctionsPage.pleaseEnterAnAuctionName });
      setWizardStep(1);
      return;
    }
    if (!isDraft && invitedVendorIds.length === 0) {
      toast.error({ title: UI_STRINGS.common.validation, message: UI_STRINGS.appAppProcurementAuctionsPage.pleaseInviteAtLeastOneVendor });
      setWizardStep(4);
      return;
    }
    if (!isDraft && nonInvitedQuotedVendors.length > 0 && !nonInvitedJustification.trim()) {
      toast.error({
        title: UI_STRINGS.appAppProcurementAuctionsPage.mandatoryPolicyRequirement,
        message: UI_STRINGS.appAppProcurementAuctionsPage.pleaseProvideJustificationCommentsForExcludingQuotedVendors,
      });
      setWizardStep(4);
      return;
    }

    // Build ISO timestamps in IST
    const startIso = startDate && startTime ? new Date(`${startDate}T${startTime}:00+05:30`).toISOString() : new Date().toISOString();
    const endIso = endDate && endTime ? new Date(`${endDate}T${endTime}:00+05:30`).toISOString() : new Date(Date.now() + 2 * 3600000).toISOString();

    if (!isDraft && new Date(endIso) <= new Date(startIso)) {
      toast.error({ title: UI_STRINGS.appAppProcurementAuctionsPage.invalidSchedule, message: UI_STRINGS.common.auctionEndTimeMustBeLaterThanStartTime });
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
      if (!res.ok) throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToSaveAuction }));

      toast.success({
        title: isDraft ? UI_STRINGS.common.userMessages.draftSaved : UI_STRINGS.common.userMessages.auctionScheduled,
        message: interpolateUiString(UI_STRINGS.common.value1, { "value1": data.message || interpolateUiString(UI_STRINGS.common.userMessages.auctionSavedSuccessfully, { "auctionNumber": data.auction?.auctionNumber }) }),
      });

      setShowCreateWizard(false);
      resetWizard();
      fetchAuctions();
    } catch (err: any) {
      toast.error({ title: UI_STRINGS.appAppProcurementAuctionsPage.auctionCreationFailed, message: err.message });
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
      return d.toLocaleString(I18N_CONFIG.defaultLocale, {
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
        title={UI_STRINGS.appAppProcurementAuctionsPage.b2BEAuctionManagementWorkspace}
        subtitle={UI_STRINGS.appAppProcurementAuctionsPage.configureScheduleMonitorLiveBiddingAndGovernReverseAuctionsForwardAuctionsAndSealedBidsInIndiaStandardTimeIST}
        breadcrumbs={[
          { label: UI_STRINGS.common.procurement, href: '/procurement/rfqs' },
          { label: UI_STRINGS.appAppProcurementAuctionsPage.auctionsWorkspace },
        ]}
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={fetchAuctions}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />{UI_STRINGS.common.refresh}</button>
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
                <Plus size={14} />{UI_STRINGS.appAppProcurementAuctionsPage.createEAuction}</button>
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
            <strong>{UI_STRINGS.appAppProcurementAuctionsPage.observerAccess}{userRole}{UI_STRINGS.common.copyc7zu6c}</strong>{UI_STRINGS.appAppProcurementAuctionsPage.youAreViewingTheAuctionsWorkspaceInReadOnlyModeEventConfigurationSchedulingAndLiveBuyerControlsAreRestrictedToProcurementOfficers}</div>
        </div>
      )}

      {/* 6 Summary KPI Cards */}
      <div className="mb-6">
        <SummaryCardGrid columns={6}>
          <SummaryCard
            label={UI_STRINGS.appAppProcurementAuctionsPage.totalAuctions}
            value={kpis.total}
            secondary={UI_STRINGS.appAppProcurementAuctionsPage.allTenantAuctions}
            icon={<Gavel size={16} />}
            accent="default"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementAuctionsPage.liveAuctions}
            value={kpis.live}
            secondary={UI_STRINGS.appAppProcurementAuctionsPage.acceptingRealTimeBids}
            icon={<Clock size={16} />}
            accent="amber"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementAuctionsPage.upcoming}
            value={kpis.upcoming}
            secondary={UI_STRINGS.appAppProcurementAuctionsPage.scheduledEvents}
            icon={<Calendar size={16} />}
            accent="blue"
          />
          <SummaryCard
            label={UI_STRINGS.common.drafts}
            value={kpis.draft}
            secondary={UI_STRINGS.appAppProcurementAuctionsPage.configurationsInProgress}
            icon={<FileText size={16} />}
            accent="default"
          />
          <SummaryCard
            label={UI_STRINGS.common.completed}
            value={kpis.completed}
            secondary={UI_STRINGS.appAppProcurementAuctionsPage.concludedAwarded}
            icon={<CheckCircle2 size={16} />}
            accent="emerald"
          />
          <SummaryCard
            label={UI_STRINGS.appAppProcurementAuctionsPage.pendingActions}
            value={kpis.pending}
            secondary={UI_STRINGS.appAppProcurementAuctionsPage.draftsAwardsPending}
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
            { id: 'ALL', label: UI_STRINGS.appAppProcurementAuctionsPage.allAuctions, count: kpis.total },
            { id: 'LIVE', label: UI_STRINGS.appAppProcurementAuctionsPage.liveBidding, count: kpis.live, pulse: kpis.live > 0 },
            { id: 'UPCOMING', label: UI_STRINGS.appAppProcurementAuctionsPage.upcoming, count: kpis.upcoming },
            { id: 'DRAFT', label: UI_STRINGS.common.drafts, count: kpis.draft },
            { id: 'COMPLETED', label: UI_STRINGS.common.completed, count: kpis.completed },
            { id: 'RESULTS', label: UI_STRINGS.appAppProcurementAuctionsPage.resultsHistory, count: kpis.completed },
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
              placeholder={UI_STRINGS.appAppProcurementAuctionsPage.searchByAuctionTitleRFQPR}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: 32, fontSize: 13, height: 36 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.common.category3}</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="form-control"
              style={{ fontSize: 12, height: 36, width: 160 }}
            >
              <option value="ALL">{UI_STRINGS.common.allCategories}</option>
              <option value="RFQ_TOTAL_WISE">{UI_STRINGS.common.rFQTotalWise}</option>
              <option value="ITEM_WISE">{UI_STRINGS.common.itemWise}</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppProcurementAuctionsPage.type}</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="form-control"
              style={{ fontSize: 12, height: 36, width: 170 }}
            >
              <option value="ALL">{UI_STRINGS.appAppProcurementAuctionsPage.allAuctionTypes}</option>
              <option value="REVERSE_AUCTION">{UI_STRINGS.appAppProcurementAuctionsPage.reverseAuction}</option>
              <option value="FORWARD_AUCTION">{UI_STRINGS.appAppProcurementAuctionsPage.forwardAuction}</option>
              <option value="SEALED_BID">{UI_STRINGS.common.sealedBid}</option>
            </select>
          </div>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#64748b' }}>{UI_STRINGS.common.showing}<strong>{filteredAuctions.length}</strong>{UI_STRINGS.appAppProcurementAuctionsPage.events}</div>
        </div>

        {/* Auction Table */}
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />{UI_STRINGS.appAppProcurementAuctionsPage.synchronisingAuctionDataWithServer}</div>
        ) : filteredAuctions.length === 0 ? (
          <div style={{ padding: 48 }}>
            <EmptyState
              icon={<Gavel size={40} strokeWidth={1.5} color="#94a3b8" />}
              title={UI_STRINGS.appAppProcurementAuctionsPage.noAuctionsMatchingFilters}
              description={UI_STRINGS.appAppProcurementAuctionsPage.scheduleANewReverseAuctionForwardAuctionOrSealedBidFromAnyActiveRFQPackage}
              actionText={canManage ? UI_STRINGS.appAppProcurementAuctionsPage.createNewEAuction : undefined}
              onAction={canManage ? () => setShowCreateWizard(true) : undefined}
            />
          </div>
        ) : (
          <div className="table-container" style={{ overflowX: 'auto', width: '100%' }}>
            <table className="data-table enterprise-table" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ width: 140, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.auctionID}</th>
                  <th style={{ minWidth: 200, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionName}</th>
                  <th style={{ width: 150, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.pRBOQRef}</th>
                  <th style={{ width: 130, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.rFQRef}</th>
                  <th style={{ width: 130, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.auctionType}</th>
                  <th style={{ width: 130, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.category2}</th>
                  <th style={{ width: 170, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.startTimeIST}</th>
                  <th style={{ width: 170, padding: '12px 14px', textAlign: 'left', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.endTimeIST}</th>
                  <th style={{ width: 110, padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.vendors}</th>
                  <th style={{ width: 120, padding: '12px 14px', textAlign: 'center', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.status}</th>
                  <th style={{ width: 140, padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>{UI_STRINGS.common.actions}</th>
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
                          <div style={{ fontSize: 11, color: '#059669', fontWeight: 600, marginTop: 2 }}>{UI_STRINGS.appAppProcurementAuctionsPage.leading}{auc.currency} {Number(auc.currentLeadingBid).toLocaleString(I18N_CONFIG.defaultLocale)}
                          </div>
                        ) : (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppProcurementAuctionsPage.ceiling}{auc.currency} {Number(auc.startingPrice || 0).toLocaleString(I18N_CONFIG.defaultLocale)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12 }}>
                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{auc.prNumber || UI_STRINGS.common.copy4s9bsz}</div>
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
                            ? UI_STRINGS.common.reverse
                            : auc.auctionType === 'FORWARD_AUCTION'
                            ? UI_STRINGS.common.forward
                            : UI_STRINGS.common.sealedBid}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12 }}>
                        {auc.auctionCategory === 'ITEM_WISE' ? UI_STRINGS.common.itemWise : UI_STRINGS.common.rFQTotalWise}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#334155' }}>
                        {formatIST(auc.startTime)}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#334155' }}>
                        {formatIST(auc.scheduledEndTime || auc.endTime)}
                        {auc.extensionCount > 0 && (
                          <span style={{ display: 'block', fontSize: 10, color: '#d97706', fontWeight: 600 }}>{UI_STRINGS.appAppProcurementAuctionsPage.extended}{auc.extensionCount}{UI_STRINGS.appAppProcurementAuctionsPage.x}</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', fontSize: 12 }}>
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{auc.invitedVendorsCount}</span>{UI_STRINGS.appAppProcurementAuctionsPage.invited}</td>
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
                              <Clock size={12} className="animate-pulse" />{UI_STRINGS.appAppProcurementAuctionsPage.monitorLive}</>
                          ) : auc.status === 'DRAFT' ? (
                            UI_STRINGS.appAppProcurementAuctionsPage.editDraft
                          ) : (
                            UI_STRINGS.common.viewDetails
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
                  <Gavel size={20} color="#0284c7" />{UI_STRINGS.appAppProcurementAuctionsPage.configureScheduleEAuctionEvent}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{interpolateUiString(UI_STRINGS.appAppProcurementAuctionsPage.wizardProgress, { wizardStep })}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateWizard(false)}
                className="btn btn-secondary btn-sm"
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}
              >{UI_STRINGS.common.copy4i33ao}</button>
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
                { step: 1, label: UI_STRINGS.appAppProcurementAuctionsPage.copy3l8vx1 },
                { step: 2, label: UI_STRINGS.appAppProcurementAuctionsPage.copy11qgvuv },
                { step: 3, label: UI_STRINGS.appAppProcurementAuctionsPage.copy13vrfjn },
                { step: 4, label: UI_STRINGS.appAppProcurementAuctionsPage.copy1rl9kx },
                { step: 5, label: UI_STRINGS.appAppProcurementAuctionsPage.copy1yuec8e },
                { step: 6, label: UI_STRINGS.appAppProcurementAuctionsPage.copyt8xw82 },
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
                  {wizardStep > s.step ? interpolateUiString(UI_STRINGS.appAppProcurementAuctionsPage.value1, { "value1": s.label.split('. ')[1] }) : s.label}
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
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementAuctionsPage.selectSourcingRFQPackage}<span style={{ color: '#ef4444' }}>{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <select
                        value={selectedRfqId}
                        onChange={(e) => setSelectedRfqId(e.target.value)}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      >
                        <option value="">{UI_STRINGS.appAppProcurementAuctionsPage.chooseApprovedRFQ}</option>
                        {rfqOptions.map((rfq) => (
                          <option key={rfq.id} value={rfq.id}>
                            {rfq.rfqNumber}{UI_STRINGS.common.copyq9aflv}{rfq.title}{UI_STRINGS.common.copy1b3t0c5}{rfq.quotedVendorCount ?? rfq.quotedVendors?.length ?? 0}{UI_STRINGS.appAppProcurementAuctionsPage.quotedVendors}</option>
                        ))}
                      </select>
                      {rfqListHasMore && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={loadMoreRfqs}
                          disabled={loadingMoreRfqs}
                          style={{ marginTop: 8 }}
                        >{loadingMoreRfqs ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}</button>
                      )}
                      {rfqDetailsLoading && <div role="status" style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>{UI_STRINGS.common.loading}</div>}
                      {currentRfq && (
                        <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.linkedPR}<strong>{currentRfq.prNumber || UI_STRINGS.common.copy4s9bsz}</strong>{UI_STRINGS.appAppProcurementAuctionsPage.bOQ}<strong>{currentRfq.boqNumber || UI_STRINGS.common.copy4s9bsz}</strong>
                        </div>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionEventName}<span style={{ color: '#ef4444' }}>{UI_STRINGS.common.copyd1yn99}</span>
                      </label>
                      <input
                        type="text"
                        value={auctionName}
                        onChange={(e) => setAuctionName(e.target.value)}
                        placeholder={UI_STRINGS.appAppProcurementAuctionsPage.eGReverseAuctionElectricalSubstationEquipment}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  {/* Auction Category: RFQ Total Wise vs Item Wise */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionCategory}<span style={{ color: '#ef4444' }}>{UI_STRINGS.common.copyd1yn99}</span>
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
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{UI_STRINGS.common.rFQTotalWise}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.biddersSubmitDecrementsOnTheCombinedOverallPackageAmount}</div>
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
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{UI_STRINGS.common.itemWise}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.biddersCompeteOnIndividualLineItemsIndependently}</div>
                      </div>
                    </div>
                  </div>

                  {/* Auction Type: Reverse, Forward, Sealed Bid */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{UI_STRINGS.common.auctionType}<span style={{ color: '#ef4444' }}>{UI_STRINGS.common.copyd1yn99}</span>
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
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.reverseAuction}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.eligibleVendorsSubmitSuccessivelyLowerPricesToCompeteForL1}</div>
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
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.forwardAuction}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.participantsSubmitHigherPricesAssetDisposalsScrapSale}</div>
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
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.common.sealedBid}</div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.strictly1ConfidentialBidPerParticipantRevealedOnlyAfterClosure}</div>
                      </div>
                    </div>
                  </div>

                  {/* Currency, Refresh Interval & Scrolling Text */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionCurrency}</label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      >
                        <option value="INR">{UI_STRINGS.appAppProcurementAuctionsPage.iNRIndianRupee}</option>
                        <option value="USD">{UI_STRINGS.appAppProcurementAuctionsPage.uSDUSDollar}</option>
                        <option value="EUR">{UI_STRINGS.appAppProcurementAuctionsPage.eUREuro}</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementAuctionsPage.automaticPageRefreshIntervalSeconds}</label>
                      <input
                        type="number"
                        min={5}
                        max={300}
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="form-control"
                        style={{ height: 38, fontSize: 13 }}
                      />
                      <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.default15SecondsPreventsInputDisruption}</span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementAuctionsPage.scrollingAnnouncementBannerVisibleToAllParticipants}</label>
                    <input
                      type="text"
                      value={scrollingText}
                      onChange={(e) => setScrollingText(e.target.value)}
                      placeholder={UI_STRINGS.appAppProcurementAuctionsPage.eGCriticalPleaseNoteThatTaxesAreExcludedFromUnitRates}
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0369a1' }}>{UI_STRINGS.appAppProcurementAuctionsPage.timeZoneAuthorityIndiaStandardTimeISTUTC0530}</div>
                      <div style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>{UI_STRINGS.appAppProcurementAuctionsPage.allCountdownTimersAuctionOpeningClosingAndAutomaticExtensionsWillBeGovernedStrictlyByServerAuthoritativeIST}</div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                      <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionStartTimeIST}</h4>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>{UI_STRINGS.common.date}</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="form-control"
                            style={{ height: 38 }}
                          />
                        </div>
                        <div style={{ width: 120 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>{UI_STRINGS.common.time}</label>
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
                      <h4 style={{ margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionEndTimeIST}</h4>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>{UI_STRINGS.common.date}</label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="form-control"
                            style={{ height: 38 }}
                          />
                        </div>
                        <div style={{ width: 120 }}>
                          <label style={{ fontSize: 12, color: '#64748b', display: 'block', marginBottom: 4 }}>{UI_STRINGS.common.time}</label>
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
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>{UI_STRINGS.appAppProcurementAuctionsPage.quickSchedulePresets}</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { label: UI_STRINGS.appAppProcurementAuctionsPage.next1Hour, dur: 1 },
                        { label: UI_STRINGS.appAppProcurementAuctionsPage.next2Hours, dur: 2 },
                        { label: UI_STRINGS.appAppProcurementAuctionsPage.tomorrow1000AM1200PM, tomorrow: true },
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionQuantityBasis}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.fullCompleteRFQBOQQuantitySingleUnitRateBasisCompetition}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="quantityType"
                          checked={quantityType === 'FULL'}
                          onChange={() => setQuantityType('FULL')}
                        />{UI_STRINGS.appAppProcurementAuctionsPage.fullQuantity}</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="quantityType"
                          checked={quantityType === 'SINGLE'}
                          onChange={() => setQuantityType('SINGLE')}
                        />{UI_STRINGS.appAppProcurementAuctionsPage.singleUnitRate}</label>
                    </div>
                  </div>

                  {/* Start Price */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionStartPrice}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.ifEnabledBiddersCannotExceedThisCeilingReverseOrFloorForward}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasStartPrice"
                            checked={hasStartPrice}
                            onChange={() => setHasStartPrice(true)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.yes}</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasStartPrice"
                            checked={!hasStartPrice}
                            onChange={() => setHasStartPrice(false)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.no}</label>
                      </div>
                    </div>
                    {hasStartPrice && auctionCategory === 'RFQ_TOTAL_WISE' && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{UI_STRINGS.appAppProcurementAuctionsPage.startingPrice}{currency}{UI_STRINGS.appAppProcurementAuctionsPage.copy626bdm}</span>
                        <input
                          type="number"
                          value={startingPrice}
                          onChange={(e) => setStartingPrice(e.target.value ? Number(e.target.value) : '')}
                          placeholder={UI_STRINGS.appAppProcurementAuctionsPage.eG1500000}
                          className="form-control"
                          style={{ width: 220, height: 36 }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Display Leading Price */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.displayLeadingPriceToParticipants}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {auctionType === 'SEALED_BID'
                          ? UI_STRINGS.appAppProcurementAuctionsPage.strictlyDisabledForSealedBidToEnforceCompleteBidConfidentiality
                          : UI_STRINGS.appAppProcurementAuctionsPage.showTheLowestReverseOrHighestForwardValidBidOnVendorLiveScreens}
                      </div>
                    </div>
                    {auctionType === 'SEALED_BID' ? (
                      <span className="badge badge-warning" style={{ fontSize: 11 }}>{UI_STRINGS.appAppProcurementAuctionsPage.confidentialDisabled}</span>
                    ) : (
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasLeadingPrice"
                            checked={hasLeadingPrice}
                            onChange={() => setHasLeadingPrice(true)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.yes}</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasLeadingPrice"
                            checked={!hasLeadingPrice}
                            onChange={() => setHasLeadingPrice(false)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.noRankOnly}</label>
                      </div>
                    )}
                  </div>

                  {/* Minimum Bid Reduction / Increment */}
                  <div style={{ padding: 14, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.minimumBidReductionIncrement}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.enforceMinimumDecrementsReverseOrIncrementsForwardBetweenSubsequentBids}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasMinBidReduction"
                            checked={hasMinBidReduction}
                            onChange={() => setHasMinBidReduction(true)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.yes}</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasMinBidReduction"
                            checked={!hasMinBidReduction}
                            onChange={() => setHasMinBidReduction(false)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.no}</label>
                      </div>
                    </div>
                    {hasMinBidReduction && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{UI_STRINGS.appAppProcurementAuctionsPage.minimumDeltaAmount}{currency}{UI_STRINGS.appAppProcurementAuctionsPage.copy626bdm}</span>
                        <input
                          type="number"
                          value={minDecrement}
                          onChange={(e) => setMinDecrement(e.target.value ? Number(e.target.value) : '')}
                          placeholder={UI_STRINGS.appAppProcurementAuctionsPage.eG5000}
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
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.automaticRollingExtension}</div>
                        <div style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.extendsEndTimeAutomaticallyWhenAValidBidIsLoggedInTheFinalMinutes}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasAutoExtension"
                            checked={hasAutoExtension}
                            onChange={() => setHasAutoExtension(true)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.yes}</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasAutoExtension"
                            checked={!hasAutoExtension}
                            onChange={() => setHasAutoExtension(false)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.no}</label>
                      </div>
                    </div>
                    {hasAutoExtension && (
                      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{UI_STRINGS.appAppProcurementAuctionsPage.extensionDurationMinutes}</span>
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.limitBidsPerParticipant}</div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasBidLimit"
                            checked={hasBidLimit}
                            onChange={() => setHasBidLimit(true)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.yes}</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="hasBidLimit"
                            checked={!hasBidLimit}
                            onChange={() => setHasBidLimit(false)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.no}</label>
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
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', marginBottom: 4 }}>{UI_STRINGS.appAppProcurementAuctionsPage.inviteProjectUserObserver}</div>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="inviteProjectUser"
                            checked={inviteProjectUser}
                            onChange={() => setInviteProjectUser(true)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.yes}</label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="inviteProjectUser"
                            checked={!inviteProjectUser}
                            onChange={() => setInviteProjectUser(false)}
                          />{UI_STRINGS.appAppProcurementAuctionsPage.no}</label>
                      </div>
                      {inviteProjectUser && (
                        <>
                          <select
                            value={selectedProjectUserId}
                            onChange={(e) => setSelectedProjectUserId(e.target.value)}
                            className="form-control"
                            style={{ height: 36, fontSize: 12 }}
                          >
                            <option value="">{UI_STRINGS.appAppProcurementAuctionsPage.selectProjectObserver}</option>
                            {projectUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}{UI_STRINGS.common.copy1b3t0c5}{u.role}{UI_STRINGS.common.copyc7zu6c}</option>
                            ))}
                          </select>
                          {projectUsersHasMore && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={loadMoreProjectUsers}
                              disabled={loadingMoreProjectUsers}
                              style={{ marginTop: 8 }}
                            >{loadingMoreProjectUsers ? UI_STRINGS.common.loading : UI_STRINGS.common.loadMore}</button>
                          )}
                        </>
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
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.inviteEligibleQuotedVendors}</h4>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.vendorsWhoSubmittedQuotesForThisRFQAreDisplayedBelow}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={inviteAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 12 }}
                      >{UI_STRINGS.appAppProcurementAuctionsPage.inviteAll}</button>
                      <button
                        type="button"
                        onClick={removeAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: 12 }}
                      >{UI_STRINGS.common.clearSelection}</button>
                    </div>
                  </div>

                  {/* Shuttle Dual List */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr', gap: 14, alignItems: 'center' }}>
                    {/* Available Vendors */}
                    <div style={{ border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #cbd5e1', fontWeight: 700, fontSize: 12, color: '#1e293b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.availableQuotedVendors}{availableVendors.length}{UI_STRINGS.common.copyc7zu6c}</div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
                        {availableVendors.length === 0 ? (
                          <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{UI_STRINGS.appAppProcurementAuctionsPage.noQuotedVendorsForThisRFQ}</div>
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
                                    {v.code}{UI_STRINGS.appAppProcurementAuctionsPage.quoted}{v.quoteAmount ? v.quoteAmount.toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.copy4s9bsz}
                                  </div>
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: isInvited ? '#0284c7' : '#94a3b8' }}>
                                  {isInvited ? UI_STRINGS.common.invited : UI_STRINGS.appAppProcurementAuctionsPage.add}
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
                        title={UI_STRINGS.appAppProcurementAuctionsPage.addAll}
                      >{UI_STRINGS.common.copy15ynnjp}</button>
                      <button
                        type="button"
                        onClick={removeAllVendors}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '6px 10px' }}
                        title={UI_STRINGS.appAppProcurementAuctionsPage.removeAll}
                      >{UI_STRINGS.appAppProcurementAuctionsPage.copy15eog5r}</button>
                    </div>

                    {/* Invited Vendors List */}
                    <div style={{ border: '1px solid #0284c7', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', fontWeight: 700, fontSize: 12, color: '#0369a1' }}>{UI_STRINGS.appAppProcurementAuctionsPage.invitedAuctionParticipants}{invitedVendorIds.length}{UI_STRINGS.common.copyc7zu6c}</div>
                      <div style={{ maxHeight: 260, overflowY: 'auto', padding: 8 }}>
                        {invitedVendorIds.length === 0 ? (
                          <div style={{ padding: 20, textAlign: 'center', color: '#ef4444', fontSize: 12 }}>{UI_STRINGS.appAppProcurementAuctionsPage.noVendorsInvitedYetPleaseSelectAtLeastOneVendor}</div>
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
                                  <div style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>{UI_STRINGS.appAppProcurementAuctionsPage.lBenchmark}{v.quoteAmount ? v.quoteAmount.toLocaleString(I18N_CONFIG.defaultLocale) : UI_STRINGS.common.copy4s9bsz}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleVendorInvite(v.vendorId)}
                                  className="btn btn-secondary btn-sm"
                                  style={{ padding: '2px 8px', fontSize: 11, color: '#ef4444' }}
                                >{UI_STRINGS.appAppProcurementAuctionsPage.remove}</button>
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
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>{UI_STRINGS.appAppProcurementAuctionsPage.mandatoryComplianceJustificationForNonInvitedVendors}</span>
                      </div>
                      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#78350f' }}>
                        {nonInvitedQuotedVendors.length}{UI_STRINGS.appAppProcurementAuctionsPage.vendorSWhoSubmittedQuotations}{nonInvitedQuotedVendors.map((v) => v.name).join(', ')}{UI_STRINGS.appAppProcurementAuctionsPage.areExcludedFromThisAuctionInAccordanceWithProcurementGovernancePolicyProvideAnExplicitJustificationForTheAuditTrail}</p>
                      <textarea
                        rows={3}
                        value={nonInvitedJustification}
                        onChange={(e) => setNonInvitedJustification(e.target.value)}
                        placeholder={UI_STRINGS.appAppProcurementAuctionsPage.stateTechnicalCommercialOrComplianceRationaleForExcludingQuotedVendors}
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
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.rFQScopeItems}{auctionItems.length}{UI_STRINGS.common.copyc7zu6c}</h4>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                        {auctionCategory === 'ITEM_WISE'
                          ? UI_STRINGS.appAppProcurementAuctionsPage.itemWiseAuctionConfigureStartingPricesForEachIndividualItemLine
                          : UI_STRINGS.appAppProcurementAuctionsPage.rFQTotalWiseAuctionItemsAreBundledUnderTheTotalStartingCeilingPrice}
                      </p>
                    </div>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: 8 }}>
                    <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
                          <th style={{ width: 50, padding: 8 }}>{UI_STRINGS.common.sNo}</th>
                          <th style={{ width: 110, padding: 8 }}>{UI_STRINGS.common.itemCode}</th>
                          <th style={{ width: 140, padding: 8 }}>{UI_STRINGS.common.category2}</th>
                          <th style={{ minWidth: 200, padding: 8 }}>{UI_STRINGS.common.description}</th>
                          <th style={{ width: 80, padding: 8 }}>{UI_STRINGS.common.uOM}</th>
                          <th style={{ width: 90, padding: 8, textAlign: 'right' }}>{UI_STRINGS.common.qty}</th>
                          {hasStartPrice && (
                            <th style={{ width: 150, padding: 8, textAlign: 'right' }}>{UI_STRINGS.appAppProcurementAuctionsPage.startPrice}{currency}{UI_STRINGS.common.copyc7zu6c}</th>
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
                                  placeholder={UI_STRINGS.common.copywwhtor}
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
                    <h4 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppProcurementAuctionsPage.executiveSummaryPreScheduleVerification}</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionEvent}</span> <strong>{auctionName}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.rFQPackage}</span> <strong>{currentRfq?.rfqNumber}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.categoryType}</span>{' '}
                        <strong>
                          {auctionCategory === 'ITEM_WISE' ? UI_STRINGS.common.itemWise : UI_STRINGS.common.rFQTotalWise}{UI_STRINGS.common.copy17xhom3}{auctionType}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.currency}</span> <strong>{currency}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.startTimeIST2}</span>{' '}
                        <strong>{startDate} {startTime}{UI_STRINGS.appAppProcurementAuctionsPage.iST}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.endTimeIST2}</span>{' '}
                        <strong>{endDate} {endTime}{UI_STRINGS.appAppProcurementAuctionsPage.iST}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.common.invitedVendors}</span>{' '}
                        <strong>{invitedVendorIds.length}{UI_STRINGS.common.vendors}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.rollingExtension}</span>{' '}
                        <strong>{hasAutoExtension ? interpolateUiString(UI_STRINGS.appAppProcurementAuctionsPage.autoExtensionMinutesMinutes, { "autoExtensionMinutes": autoExtensionMinutes }) : UI_STRINGS.appAppProcurementAuctionsPage.disabled}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.startCeilingPrice}</span>{' '}
                        <strong>{hasStartPrice && startingPrice ? interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { "currency": currency, "toLocaleString": Number(startingPrice).toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.none}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppProcurementAuctionsPage.minDecrementDelta}</span>{' '}
                        <strong>{hasMinBidReduction && minDecrement ? interpolateUiString(UI_STRINGS.common.currencyToLocaleString, { "currency": currency, "toLocaleString": Number(minDecrement).toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.standard}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Terms & Conditions preview */}
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>{UI_STRINGS.appAppProcurementAuctionsPage.auctionTermsConditionsMandatoryAcknowledgementForVendors}</label>
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
                    <ArrowLeft size={14} />{UI_STRINGS.appAppProcurementAuctionsPage.back}</button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowCreateWizard(false)}
                  className="btn btn-secondary btn-sm"
                >{UI_STRINGS.common.cancel}</button>
                <button
                  type="button"
                  disabled={submitting || (selectedRfqId !== '' && (rfqDetailsLoading || selectedRfqDetails?.id !== selectedRfqId))}
                  onClick={() => handleSaveAuction(true)}
                  className="btn btn-secondary btn-sm"
                >{UI_STRINGS.common.saveAsDraft}</button>

                {wizardStep < 6 ? (
                  <button
                    type="button"
                    disabled={selectedRfqId !== '' && (rfqDetailsLoading || selectedRfqDetails?.id !== selectedRfqId)}
                    onClick={() => setWizardStep((prev) => prev + 1)}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >{UI_STRINGS.appAppProcurementAuctionsPage.nextStep}<ArrowRight size={14} />
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting || rfqDetailsLoading || selectedRfqDetails?.id !== selectedRfqId}
                    onClick={() => handleSaveAuction(false)}
                    className="btn btn-primary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <Check size={14} /> {submitting ? UI_STRINGS.appAppProcurementAuctionsPage.scheduling : UI_STRINGS.appAppProcurementAuctionsPage.confirmScheduleAuction}
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
