'use client';
// src/app/(app)/boq/studio/page.tsx - Consolidated BOQ Creation, Generation, Edit, AI Cost & Review Workspace
import { I18N_CONFIG } from '@/lib/i18n.constants';
import { reportHandledClientFailure } from '@/lib/observability/client-reporter';
import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Sparkles,
  FileSpreadsheet,
  Upload,
  Image as ImageIcon,
  PenTool,
  CheckCircle2,
  AlertTriangle,
  Download,
  Send,
  Landmark,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  ShieldCheck,
  RefreshCw,
  Info,
  Search,
  X,
  ExternalLink,
  FolderKanban,
} from 'lucide-react';
import SpecificationCell from '@/components/ui/SpecificationCell';
import StatusBadge from '@/components/ui/StatusBadge';
import PageHeader from '@/components/ui/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { computeLineCostBreakdown } from '@/lib/boq-cost-breakdown';
import { SECTOR_PROJECT_TYPES, ALL_STANDARD_CATEGORIES, BOQ_FINANCIAL_CATEGORY_KEYS } from "./page.constants";
import { BOQ_LINE_DETAIL_PAGE_SIZE, BOQ_LINE_MAX_BATCH_EDITS } from '@/lib/boq-line-pagination.constants';
import { UI_STRINGS } from "@/lib/ui-strings.constants";
import { interpolateUiString } from "@/lib/i18n";
import type { CostCentreLookupApiResponse, CostCentreLookupPayload, CostCentreLookupOption } from '@app-types/app/api/cost-centres.types';
import type { BoqLineSummary } from '@app-types/lib/boq-line-summary.types';



export default function BoqStudioPage() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [savingParameters, setSavingParameters] = useState(false);

  const paramProjectId = searchParams.get('projectId') || '';
  const paramCostCentreId = searchParams.get('costCentreId') || '';
  const paramBoqId = searchParams.get('boqId') || '';

  // Core Data
  const [projects, setProjects] = useState<any[]>([]);
  const [costCentres, setCostCentres] = useState<CostCentreLookupOption[]>([]);
  const [costCentreSearch, setCostCentreSearch] = useState('');
  const [costCentrePage, setCostCentrePage] = useState(1);
  const [costCentreTotal, setCostCentreTotal] = useState(0);
  const [costCentreHasMore, setCostCentreHasMore] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(paramProjectId);
  const [selectedCostCentreId, setSelectedCostCentreId] = useState(paramCostCentreId);

  // All BOQs List
  const [boqs, setBoqs] = useState<any[]>([]);
  const [loadingBoqs, setLoadingBoqs] = useState(true);

  // Dynamic Master Categories
  const [masterCategories, setMasterCategories] = useState<string[]>(ALL_STANDARD_CATEGORIES);

  useEffect(() => {
    fetch('/api/masters/categories')
      .then(r => r.json())
      .then(d => {
        const cats = d.data || d || [];
        if (Array.isArray(cats) && cats.length > 0) {
          const names = cats.map((c: any) => c.name);
          const merged = Array.from(new Set([...names, ...ALL_STANDARD_CATEGORIES]));
          setMasterCategories(merged);
        }
      })
      .catch((error: unknown) => reportHandledClientFailure(error, {
        operation: 'load_boq_studio_categories', route: '/api/masters/categories',
      }));
  }, []);

  // Active BOQ & Revision in Workspace
  const [activeBoq, setActiveBoq] = useState<any | null>(null);
  const [activeRevision, setActiveRevision] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [lineSummary, setLineSummary] = useState<BoqLineSummary | null>(null);
  const [lineTotal, setLineTotal] = useState(0);
  const [lineNextCursor, setLineNextCursor] = useState<string | null>(null);
  const [linePageCursors, setLinePageCursors] = useState<string[]>([]);
  const [linePageIndex, setLinePageIndex] = useState(1);
  const [loadingLines, setLoadingLines] = useState(false);

  // BOQ Creation Context / Parameters (Top Setup Bar)
  const [setupProject, setSetupProject] = useState(paramProjectId);
  const [setupCostCentre, setSetupCostCentre] = useState(paramCostCentreId);
  const [setupTitle, setSetupTitle] = useState('');
  const [userEditedTitle, setUserEditedTitle] = useState(false);
  const [setupDescription, setSetupDescription] = useState('');
  const [setupPurpose, setSetupPurpose] = useState<'BUDGET' | 'PR'>('BUDGET');
  const [setupSector, setSetupSector] = useState('RETAIL');
  const [setupProjectType, setSetupProjectType] = useState('Retail Store Fitout');
  const [setupArea, setSetupArea] = useState('10,000');
  const [setupCategories, setSetupCategories] = useState<string[]>(['Civil & Interior', 'Electrical']);

  // Method 1: Upload Existing BOQ
  const [uploadingMethod1, setUploadingMethod1] = useState(false);
  const fileInputMethod1Ref = useRef<HTMLInputElement | null>(null);

  // Method 2: Download Standard BOQ
  const [stdSector, setStdSector] = useState('RETAIL');
  const [stdProjectType, setStdProjectType] = useState('Retail Store Fitout');
  const [stdCategories, setStdCategories] = useState<string[]>(['Civil & Interior', 'Electrical']);
  const [downloadingStd, setDownloadingStd] = useState(false);
  const [stdDownloaded, setStdDownloaded] = useState(false);
  const [uploadingMethod2, setUploadingMethod2] = useState(false);
  const fileInputMethod2Ref = useRef<HTMLInputElement | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');

  // Expandable Line-Item AI Cost Breakdown
  const [expandedCostLineId, setExpandedCostLineId] = useState<string | null>(null);

  // Method 3: Drawing to BOQ
  const [drawingNumber, setDrawingNumber] = useState('DWG-A-101');
  const [extractingDrawing, setExtractingDrawing] = useState(false);
  const [drawingProgressText, setDrawingProgressText] = useState('');
  const [extractedDrawingData, setExtractedDrawingData] = useState<any | null>(null);
  const [reviewLines, setReviewLines] = useState<any[]>([]);
  const [drawingReviewModalOpen, setDrawingReviewModalOpen] = useState(false);
  const [generatingDrawingBoq, setGeneratingDrawingBoq] = useState(false);

  // Method 4: Manual Entry
  const [savingManual, setSavingManual] = useState(false);

  // Active Creation Method Card Selection: 1 | 2 | 3 | 4
  const [selectedMethod, setSelectedMethod] = useState<number | null>(2);

  // Status & Notification Banners
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [statusType, setStatusType] = useState<'success' | 'error' | 'info'>('info');

  // Import Result Card State (Section 6)
  const [importResult, setImportResult] = useState<{
    totalImported: number;
    quantitiesValid: number;
    uomsRecognised: number;
    warningsCount: number;
    issues: any[];
  } | null>(null);
  const [showWarningModal, setShowWarningModal] = useState(false);

  // Edit BOQ In-Place State (Section 9)
  const [isEditingBoq, setIsEditingBoq] = useState(false);
  const [editableLines, setEditableLines] = useState<any[]>([]);
  const [savingEditChanges, setSavingEditChanges] = useState(false);

  // Single Line Edit Modal & Add Line Modal
  const [editingLineModal, setEditingLineModal] = useState<any | null>(null);
  const [addLineModalOpen, setAddLineModalOpen] = useState(false);
  const [newLineData, setNewLineData] = useState({
    description: '',
    specification: '',
    category: 'Civil & Interior',
    uom: 'NOS',
    quantity: 1,
    location: '',
    brand: '',
    remarks: '',
    aiUnitCost: 150,
  });

  // AI Refine & AI Cost Engine State (Sections 10 & 11)
  const [refiningLineId, setRefiningLineId] = useState<string | null>(null);
  const [proposedRefinements, setProposedRefinements] = useState<Record<string, {
    suggestedDescription: string;
    suggestedSpec: string;
    reason: string;
    confidence: number;
  }>>({});
  const [estimatingCost, setEstimatingCost] = useState(false);
  const [validatingQuality, setValidatingQuality] = useState(false);

  const [showDetails, setShowDetails] = useState(false);
  const [showCategoryBreakdown, setShowCategoryBreakdown] = useState(false);

  // Modals for Dual Purpose Actions (Sections 13 & 14)
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [addingToBudget, setAddingToBudget] = useState(false);
  const [prModalOpen, setPrModalOpen] = useState(false);
  const [creatingPr, setCreatingPr] = useState(false);

  // Existing BOQs Filtering (Section 21)
  const [filterSearch, setFilterSearch] = useState('');

  // Search filter for lines within workspace
  const [linesSearch, setLinesSearch] = useState('');

  // Workspace Ref for smooth auto-scroll
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const costCentreRequestSequence = useRef(0);
  const boqDetailsRequestSequence = useRef(0);
  const boqLinePageRequestSequence = useRef(0);
  const linesSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    boqDetailsRequestSequence.current += 1;
    boqLinePageRequestSequence.current += 1;
    if (linesSearchTimer.current) clearTimeout(linesSearchTimer.current);
  }, []);

  // -------------------------------------------------------------
  // INITIAL DATA LOADING & URL REFRESH RESTORATION (Section 22)
  // -------------------------------------------------------------
  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      loadCostCentres(selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if (setupProject) {
      loadCostCentres(setupProject);
      const prj = projects.find(p => p.id === setupProject);
      if (prj) {
        if (prj.sector) {
          setSetupSector(prj.sector.toUpperCase());
          setStdSector(prj.sector.toUpperCase());
        }
        if (prj.projectType) {
          setSetupProjectType(prj.projectType);
          setStdProjectType(prj.projectType);
        }
        if (prj.areaSqFt) {
          setSetupArea(prj.areaSqFt.toLocaleString());
        }
      }
    }
  }, [setupProject, projects]);

  useEffect(() => {
    if (setupCostCentre) {
      const cc = costCentres.find(c => c.id === setupCostCentre);
      if (cc && cc.areaSqFt) {
        setSetupArea(cc.areaSqFt.toLocaleString());
      }
    }
  }, [setupCostCentre, costCentres]);

  // Auto-generate BOQ Title: Category Name + Project Name (Requirement 5)
  const computeSuggestedTitle = (cats: string[], projId: string, ccId: string) => {
    let projName = '';
    const prj = projects.find(p => p.id === projId);
    if (prj?.name) {
      projName = prj.name;
    } else if (ccId) {
      const cc = costCentres.find(c => c.id === ccId);
      if (cc?.project?.name) {
        projName = cc.project.name;
      } else if (cc?.projectId) {
        const parentP = projects.find(p => p.id === cc.projectId);
        if (parentP?.name) projName = parentP.name;
      }
      if (!projName && cc?.name) {
        projName = cc.name;
      }
    }

    const catName = cats && cats.length > 0 ? (cats.length === 1 ? cats[0] : cats.slice(0, 2).join(' & ')) : '';

    if (catName && projName) {
      return `${catName} — ${projName}`;
    } else if (catName) {
      return `${catName} BOQ`;
    } else if (projName) {
      return `${projName} BOQ`;
    }
    return '';
  };

  useEffect(() => {
    // Only auto-update suggested title if the user has not deliberately typed their own custom title and no existing BOQ with title is loaded
    if (!userEditedTitle && (!activeBoq || !activeBoq.title)) {
      const activeCats = stdCategories.length > 0 ? stdCategories : setupCategories;
      const suggested = computeSuggestedTitle(activeCats, setupProject, setupCostCentre);
      if (suggested) {
        setSetupTitle(suggested);
      }
    }
  }, [setupProject, setupCostCentre, stdCategories, setupCategories, projects, costCentres, userEditedTitle, activeBoq]);

  const loadInitial = async () => {
    setLoadingBoqs(true);
    try {
      const [pRes, bRes] = await Promise.all([
        fetch('/api/projects'),
        fetch('/api/boq'),
      ]);

      let loadedProjects: any[] = [];
      if (pRes.ok) {
        const pData = await pRes.json();
        loadedProjects = pData.data || pData || [];
        setProjects(loadedProjects);

        // Find Kundanahalli or first project
        const kundanahalli = loadedProjects.find(p => p.name?.toLowerCase().includes('kundanahalli'));
        const defaultProjId = paramProjectId || (kundanahalli ? kundanahalli.id : loadedProjects[0]?.id || '');
        setSelectedProjectId(defaultProjId);
        setSetupProject(defaultProjId);
        if (defaultProjId) {
          loadCostCentres(defaultProjId);
        }
      }

      if (bRes.ok) {
        const bData = await bRes.json();
        const bList = bData.data || bData || [];
        setBoqs(bList);

        // Resolve active BOQ from URL or localStorage
        const storedBoqId = typeof window !== 'undefined' ? localStorage.getItem('procpx_active_boq_id') : null;
        const targetBoqId = paramBoqId || storedBoqId;

        if (targetBoqId) {
          await loadBoqDetails(targetBoqId);
        }
      }
    } catch (e) {
      console.error('Error loading initial data:', e);
    } finally {
      setLoadingBoqs(false);
    }
  };

  const loadCostCentres = async (pId: string, search = '', page = 1, append = false, exactId = '') => {
    const sequence = ++costCentreRequestSequence.current;
    try {
      const query = new URLSearchParams({ projectId: pId, page: String(page), pageSize: '100' });
      if (search.trim()) query.set('search', search.trim());
      if (exactId) query.set('costCentreId', exactId);
      const res = await fetch(`/api/cost-centres?${query.toString()}`);
      if (res.ok) {
        const data = await res.json() as CostCentreLookupApiResponse;
        if (sequence !== costCentreRequestSequence.current) return;
        const payload: CostCentreLookupPayload = data.data ?? data;
        const rows = Array.isArray(payload) ? payload : payload.costCentres ?? [];
        const pagination = Array.isArray(payload) ? undefined : payload.pagination;
        setCostCentres((current) => {
          const existing = !append && !exactId
            ? current.find((item) => item.id === setupCostCentre && item.projectId === pId)
            : undefined;
          const base = append || exactId ? current : existing ? [existing] : [];
          const ids = new Set(base.map((item) => item.id));
          return [...base, ...rows.filter((item) => !ids.has(item.id))];
        });
        if (!exactId) {
          setCostCentrePage(page);
          setCostCentreTotal(pagination?.total ?? rows.length);
          setCostCentreHasMore(Boolean(pagination?.hasMore));
        }
        if (rows.length > 0 && !setupCostCentre && !search && !exactId) {
          // If cc45 exists, prefer it
          const cc45 = rows.find((c) => c.code?.toLowerCase().includes('cc45') || c.name?.toLowerCase().includes('cc45'));
          const defaultCc = cc45 ? cc45.id : rows[0].id;
          setSetupCostCentre(defaultCc);
          setSelectedCostCentreId(defaultCc);
        }
      }
    } catch (e) {
      if (sequence === costCentreRequestSequence.current) console.error(e);
    }
  };

  const loadAllBoqs = async () => {
    try {
      const res = await fetch('/api/boq');
      if (res.ok) {
        const data = await res.json();
        setBoqs(data.data || data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const syncActiveBoqUrl = (boqId: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('procpx_active_boq_id', boqId);
      const url = new URL(window.location.href);
      url.searchParams.set('boqId', boqId);
      window.history.replaceState(null, '', url.toString());
    }
  };

  const loadBoqLinePage = async (
    revisionId: string,
    cursor: string | null,
    search: string,
    transition: 'reset' | 'next' | 'previous',
  ) => {
    const requestSequence = ++boqLinePageRequestSequence.current;
    setLoadingLines(true);
    try {
      const query = new URLSearchParams({ pageSize: String(BOQ_LINE_DETAIL_PAGE_SIZE) });
      if (cursor) query.set('cursor', cursor);
      if (search.trim()) query.set('search', search.trim());
      if (transition !== 'reset') query.set('includeTotal', 'false');
      const response = await fetch(`/api/boq/${encodeURIComponent(revisionId)}/lines?${query.toString()}`);
      if (!response.ok) throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
      const responseBody = await response.json();
      const payload = responseBody?.data && !Array.isArray(responseBody.data)
        ? responseBody.data
        : responseBody;
      if (!Array.isArray(payload?.data)) throw new Error(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
      if (requestSequence !== boqLinePageRequestSequence.current) return;

      const pageLines = payload.data;
      const nextCursor = typeof payload.nextCursor === 'string' ? payload.nextCursor : null;
      const responseTotal = Number(payload.total);
      const hasResponseTotal = payload.total !== undefined
        && Number.isSafeInteger(responseTotal)
        && responseTotal >= 0;
      setLines(pageLines);
      setLineTotal((current) => hasResponseTotal
        ? responseTotal
        : transition === 'reset' ? pageLines.length : current);
      setLineNextCursor(nextCursor);
      if (transition === 'reset') {
        setLinePageCursors([]);
        setLinePageIndex(1);
      } else if (transition === 'next' && cursor) {
        setLinePageCursors((current) => [...current, cursor]);
        setLinePageIndex((current) => current + 1);
      } else if (transition === 'previous') {
        setLinePageCursors((current) => current.slice(0, -1));
        setLinePageIndex((current) => Math.max(1, current - 1));
      }
    } catch (error) {
      if (requestSequence === boqLinePageRequestSequence.current) {
        console.error('Error loading BOQ line page:', error);
        setStatusType('error');
        setStatusMessage(UI_STRINGS.common.userMessages.failedToLoadLineItemDetails);
      }
    } finally {
      if (requestSequence === boqLinePageRequestSequence.current) setLoadingLines(false);
    }
  };

  const loadBoqDetails = async (boqId: string) => {
    const requestSequence = ++boqDetailsRequestSequence.current;
    boqLinePageRequestSequence.current += 1;
    if (linesSearchTimer.current) clearTimeout(linesSearchTimer.current);
    setLoadingLines(true);
    try {
      const res = await fetch(`/api/boq/${boqId}`);
      if (res.ok) {
        const d = await res.json();
        if (requestSequence !== boqDetailsRequestSequence.current) return;
        const boqData = d.boq || d.data?.boq;
        const revData = d.revision || d.data?.revision;
        const lineItems = d.lines || d.data?.lines || [];
        const totalLines = Number(d.totalLines ?? d.data?.totalLines ?? lineItems.length);
        const nextCursor = d.nextCursor ?? d.data?.nextCursor ?? null;

        if (boqData) {
          setActiveBoq(boqData);
          setSelectedProjectId(boqData.projectId);
          setSelectedCostCentreId(boqData.costCentreId || '');
          setSetupProject(boqData.projectId);
          setSetupCostCentre(boqData.costCentreId || '');
          if (boqData.costCentreId) {
            void loadCostCentres(boqData.projectId, '', 1, true, boqData.costCentreId);
          }
          setSetupTitle(boqData.title || '');
          setUserEditedTitle(true); // Preserve existing title in saved records
          setSetupDescription(boqData.description || '');
          const boqPurpose = (boqData.purpose === 'PR' ? 'PR' : 'BUDGET') as 'BUDGET' | 'PR';
          setSetupPurpose(boqPurpose);
          syncActiveBoqUrl(boqData.id);
        }

        if (revData) {
          setActiveRevision(revData);
        }

        setIsEditingBoq(false);
        setEditableLines([]);
        setLines(lineItems);
        setLineSummary(d.summary ?? d.data?.summary ?? null);
        setLineTotal(Number.isSafeInteger(totalLines) && totalLines >= 0 ? totalLines : lineItems.length);
        setLineNextCursor(typeof nextCursor === 'string' ? nextCursor : null);
        setLinePageCursors([]);
        setLinePageIndex(1);
        setLinesSearch('');

        // Precompute category breakdown and totals
      }
    } catch (e) {
      if (requestSequence === boqDetailsRequestSequence.current) {
        console.error('Error loading BOQ details:', e);
      }
    } finally {
      if (requestSequence === boqDetailsRequestSequence.current) {
        setLoadingLines(false);
      }
    }
  };

  const handleLinesSearchChange = (search: string) => {
    setLinesSearch(search);
    if (linesSearchTimer.current) clearTimeout(linesSearchTimer.current);
    if (!activeRevision?.id || isEditingBoq) return;
    setLoadingLines(true);
    linesSearchTimer.current = setTimeout(() => {
      void loadBoqLinePage(activeRevision.id, null, search, 'reset');
    }, 250);
  };

  const handleNextLinesPage = () => {
    if (!activeRevision?.id || !lineNextCursor || loadingLines || isEditingBoq) return;
    if (linesSearchTimer.current) clearTimeout(linesSearchTimer.current);
    void loadBoqLinePage(activeRevision.id, lineNextCursor, linesSearch, 'next');
  };

  const handlePreviousLinesPage = () => {
    if (!activeRevision?.id || linePageIndex <= 1 || loadingLines || isEditingBoq) return;
    if (linesSearchTimer.current) clearTimeout(linesSearchTimer.current);
    const cursor = linePageIndex > 2 ? linePageCursors[linePageCursors.length - 2] ?? null : null;
    if (linePageIndex > 2 && !cursor) return;
    void loadBoqLinePage(activeRevision.id, cursor, linesSearch, 'previous');
  };

  const handlePurposeChange = (newPurpose: 'BUDGET' | 'PR') => {
    setSetupPurpose(newPurpose);
    if (activeBoq?.id) {
      setActiveBoq((prev: any) => ({ ...prev, purpose: newPurpose }));
      setBoqs((prev: any[]) => prev.map(b => b.id === activeBoq.id ? { ...b, purpose: newPurpose } : b));
    }
  };

  const handleSaveParameters = async () => {
    if (!activeBoq?.id) {
      toast.info(UI_STRINGS.common.userMessages.targetParametersConfiguredForNewBoqCreation);
      return;
    }
    setSavingParameters(true);
    try {
      const res = await fetch(`/api/boq/${activeBoq.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: setupProject || undefined,
          costCentreId: setupCostCentre || undefined,
          category: stdCategories[0] || 'Standard',
          purpose: setupPurpose,
          title: setupTitle,
          description: setupDescription,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSaveParameters }));
      }
      toast.success(UI_STRINGS.appAppBoqStudioPage.targetParametersSavedSuccessfully);
      setStatusType('success');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.targetParametersSavedSuccessfully);
      await loadBoqDetails(activeBoq.id);
      await loadAllBoqs();
    } catch (e: any) {
      toast.error(e.message || UI_STRINGS.common.userMessages.errorSavingParameters);
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.errorSavingParametersMessage, { "message": e.message }));
    } finally {
      setSavingParameters(false);
    }
  };

  // Helper to ensure an active BOQ record exists before generating lines
  const ensureActiveBoqRecord = async (): Promise<any> => {
    if (activeBoq) return activeBoq;

    const projId = setupProject || selectedProjectId || projects[0]?.id;
    const ccId = setupCostCentre || selectedCostCentreId || costCentres[0]?.id;
    const proj = projects.find(p => p.id === projId);

    const title = setupTitle.trim() || interpolateUiString(UI_STRINGS.appAppBoqStudioPage.projectStandardFitoutBoq, {
      projectName: proj?.name || UI_STRINGS.common.project,
    });

    const res = await fetch('/api/boq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: projId,
        costCentreId: ccId,
        title,
        description: interpolateUiString(UI_STRINGS.common.value1, { "value1": setupDescription.trim() || null }),
        category: setupCategories,
        purpose: setupPurpose,
        sector: setupSector,
        projectType: setupProjectType,
        areaSqFt: parseFloat(setupArea.replace(/,/g, '')) || 10000,
        remarks: 'Created via BOQ Studio',
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToInitializeBoq }));
    }

    const data = await res.json();
    const createdBoq = data.data?.boq || data.boq;
    const rev = createdBoq?.latestRevision;

    setActiveBoq(createdBoq);
    setActiveRevision(rev);
    syncActiveBoqUrl(createdBoq.id);
    await loadAllBoqs();
    return createdBoq;
  };

  // -------------------------------------------------------------
  // METHOD 1: UPLOAD EXISTING BOQ (Section 3)
  // -------------------------------------------------------------
  const handleDownloadSimpleTemplate = () => {
    window.location.href = '/api/boq/simple-template/download';
    setStatusType('success');
    setStatusMessage(UI_STRINGS.appAppBoqStudioPage.simpleBOQTemplateDownloadedSuccessfully);
  };

  const handleUploadExistingBoq = async (file: File) => {
    setUploadingMethod1(true);
    setStatusMessage('');

    try {
      const currentBoq = await ensureActiveBoqRecord();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectId', currentBoq.projectId);
      fd.append('costCentreId', currentBoq.costCentreId || '');
      fd.append('boqId', currentBoq.id);
      fd.append('purpose', setupPurpose);
      if (setupTitle.trim()) fd.append('title', setupTitle.trim());
      if (stdCategories.length > 0) fd.append('category', stdCategories[0]);
      if (setupDescription.trim()) fd.append('description', setupDescription.trim());

      const res = await fetch('/api/boq/upload-template', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToUploadExistingBoq }));
      }

      const data = await res.json();
      const payload = data.data || data;

      setImportResult({
        totalImported: payload.totalLines || payload.validLines || 0,
        quantitiesValid: payload.validLines || 0,
        uomsRecognised: payload.validLines || 0,
        warningsCount: payload.warningLines || 0,
        issues: payload.exceptions || [],
      });

      setStatusType('success');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.bOQUploadedSuccessfullyValue1LineItemsImported, { "value1": payload.totalLines || payload.validLines || 0 }));

      await loadAllBoqs();
      await loadBoqDetails(currentBoq.id);

      // Smooth scroll to BOQ workspace
      workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.uploadErrorMessage, { "message": e.message }));
    } finally {
      setUploadingMethod1(false);
      if (fileInputMethod1Ref.current) fileInputMethod1Ref.current.value = '';
    }
  };

  // -------------------------------------------------------------
  // METHOD 2: DOWNLOAD STANDARD BOQ → UPLOAD (Section 4 & 5)
  // -------------------------------------------------------------
  const handleDownloadStandardBoq = async () => {
    setDownloadingStd(true);
    setStatusMessage('');
    try {
      const q = new URLSearchParams({
        sector: stdSector,
        projectType: stdProjectType,
        projectId: activeBoq?.projectId || setupProject || selectedProjectId,
        costCentreId: activeBoq?.costCentreId || setupCostCentre || selectedCostCentreId,
        categories: stdCategories.join(','),
      });

      const res = await fetch(`/api/boq/standard/download?${q.toString()}`);
      if (!res.ok) throw new Error(UI_STRINGS.appAppBoqStudioPage.failedToGenerateStandardBOQDownload);

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Standard_BOQ_${stdSector}_${stdProjectType.replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStdDownloaded(true);
      setStatusType('success');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.standardBOQDownloadedSuccessfully);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.downloadErrorMessage, { "message": e.message }));
    } finally {
      setDownloadingStd(false);
    }
  };

  const handleUploadCompletedStandardBoq = async (file: File) => {
    setUploadingMethod2(true);
    setStatusMessage('');

    try {
      const currentBoq = await ensureActiveBoqRecord();

      // Step 1: Validate Excel in background
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectId', currentBoq.projectId);
      fd.append('costCentreId', currentBoq.costCentreId || '');
      fd.append('sector', stdSector);
      fd.append('projectType', stdProjectType);
      fd.append('purpose', setupPurpose);

      const valRes = await fetch('/api/boq/standard/upload-validate', { method: 'POST', body: fd });
      const valData = await valRes.json();
      if (!valRes.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": valData.error || UI_STRINGS.common.userMessages.failedToValidateUploadedFile }));
      }

      const valPayload = valData.data || valData;
      const validLines = valPayload.validLines || [];

      if (validLines.length === 0) {
        // Fallback: try uploading through template parser in case file is in alternative format
        const fbFd = new FormData();
        fbFd.append('file', file);
        fbFd.append('projectId', currentBoq.projectId);
        fbFd.append('costCentreId', currentBoq.costCentreId || '');
        fbFd.append('boqId', currentBoq.id);
        fbFd.append('purpose', setupPurpose);
        if (setupTitle.trim()) fbFd.append('title', setupTitle.trim());

        const fbRes = await fetch('/api/boq/upload-template', { method: 'POST', body: fbFd });
        if (fbRes.ok) {
          const fbData = await fbRes.json();
          const fbPayload = fbData.data || fbData;
          if (fbPayload.totalLines > 0) {
            setImportResult({
              totalImported: fbPayload.totalLines,
              quantitiesValid: fbPayload.validLines || fbPayload.totalLines,
              uomsRecognised: fbPayload.validLines || fbPayload.totalLines,
              warningsCount: fbPayload.warningLines || 0,
              issues: fbPayload.exceptions || [],
            });
            setStatusType('success');
            setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.bOQUploadedSuccessfullyTotalLinesLineItemsImported, { "totalLines": fbPayload.totalLines }));
            await loadAllBoqs();
            await loadBoqDetails(currentBoq.id);
            workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
            return;
          }
        }
        throw new Error(UI_STRINGS.appAppBoqStudioPage.theUploadedExcelFileDoesNotContainAnyRecognizableItemRowsPleaseEnsureYourFileContainsItemDescriptions);
      }

      // Step 2: Auto Generate into Draft BOQ
      const genRes = await fetch('/api/boq/standard/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boqId: currentBoq.id,
          projectId: currentBoq.projectId,
          costCentreId: currentBoq.costCentreId || null,
          sector: stdSector,
          projectType: stdProjectType,
          validLines,
          fileName: file.name,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": setupTitle.trim() || undefined }),
          purpose: setupPurpose,
          categories: stdCategories,
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": setupDescription.trim() || undefined }),
        }),
      });

      const genData = await genRes.json();
      if (!genRes.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": genData.error || UI_STRINGS.common.userMessages.failedToPopulateBoqWithLines }));
      }

      const genPayload = genData.data || genData;

      const pendingCount = valPayload.pendingQuantityCount !== undefined ? valPayload.pendingQuantityCount : (genPayload.warningLines || 0);

      // Set Import Result for display (Section 6)
      setImportResult({
        totalImported: genPayload.totalLines || validLines.length,
        quantitiesValid: valPayload.validQuantityCount !== undefined ? valPayload.validQuantityCount : (validLines.length - pendingCount),
        uomsRecognised: valPayload.validRows || validLines.length,
        warningsCount: pendingCount,
        issues: valPayload.issues || [],
      });

      if (pendingCount > 0) {
        setStatusType('info');
        setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.standardBOQUploadedSuccessfullyValue1StandardItemsImportedPendingCountItemsRequireQuantity, { "value1": genPayload.totalLines || validLines.length, "pendingCount": pendingCount }));
      } else {
        setStatusType('success');
        setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.standardBOQUploadedSuccessfullyValue1LineItemsImported, { "value1": genPayload.totalLines || validLines.length }));
      }

      await loadAllBoqs();
      await loadBoqDetails(currentBoq.id);

      // Smooth scroll to workspace
      workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.uploadErrorMessage, { "message": e.message }));
    } finally {
      setUploadingMethod2(false);
      if (fileInputMethod2Ref.current) fileInputMethod2Ref.current.value = '';
    }
  };

  // -------------------------------------------------------------
  // METHOD 3: DRAWING TO BOQ
  // -------------------------------------------------------------
  const handleDrawingExtract = async (file: File) => {
    const projId = setupProject || selectedProjectId || projects[0]?.id;
    if (!projId) {
      toast.error(UI_STRINGS.common.userMessages.pleaseSelectOrConfigureATargetProjectFirst);
      return;
    }

    setExtractingDrawing(true);
    setDrawingProgressText('Analyzing architectural drawing & extracting schedule...');
    setStatusMessage('');

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectId', projId);
      fd.append('costCentreId', setupCostCentre || selectedCostCentreId || '');
      fd.append('drawingNumber', drawingNumber.trim() || 'DWG-A-101');
      fd.append('purpose', setupPurpose);
      if (setupTitle.trim()) fd.append('title', setupTitle.trim());
      if (setupDescription.trim()) fd.append('description', setupDescription.trim());

      const res = await fetch('/api/boq/drawing-extract', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.drawingExtractionFailed }));
      }

      const payload = data.data || data;
      setExtractedDrawingData(payload);
      setReviewLines(payload.items || []);
      setDrawingReviewModalOpen(true);
      toast.success(interpolateUiString(UI_STRINGS.common.userMessages.drawingParsedLineItemsExtractedForReview, { "totalDetected": payload.totalDetected }));
      setStatusType('info');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.drawingParsedTotalDetectedLineItemsExtractedPleaseReviewAndConfirmToGenerateDraftBOQ, { "totalDetected": payload.totalDetected }));
    } catch (e: any) {
      toast.error(UI_STRINGS.common.userMessages.drawingExtractionFailedPleaseTryAgain);
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.drawingExtractionErrorMessage, { "message": e.message }));
    } finally {
      setExtractingDrawing(false);
      setDrawingProgressText('');
    }
  };

  const handleUpdateReviewLine = (index: number, field: string, val: any) => {
    setReviewLines(prev => {
      const next = [...prev];
      const updated = { ...next[index], [field]: val };
      if (field === 'quantity') {
        const num = parseFloat(val);
        if (!isNaN(num) && num > 0) {
          updated.quantity = num;
          updated.quantityType = 'EXPLICIT';
          updated.uncertainReason = undefined;
        } else if (val === '' || val === null) {
          updated.quantity = null;
          updated.quantityType = 'UNCERTAIN';
        }
      }
      next[index] = updated;
      return next;
    });
  };

  const handleAddReviewLine = () => {
    const newLine = {
      lineNumber: String(reviewLines.length + 1),
      mark: `M-${reviewLines.length + 1}`,
      description: UI_STRINGS.appAppBoqStudioPage.newExtractedLineItem,
      specification: 'Commercial grade specification',
      category: 'Civil & Interior',
      uom: 'NOS',
      quantity: 1,
      quantityType: 'EXPLICIT',
      location: 'Store / Floor',
      confidence: 1.0,
      drawingReference: drawingNumber,
      sheet: 'Sheet 01',
    };
    setReviewLines(prev => [...prev, newLine]);
  };

  const handleRemoveReviewLine = (index: number) => {
    setReviewLines(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateDrawingBoq = async () => {
    if (!extractedDrawingData || reviewLines.length === 0) {
      toast.error(UI_STRINGS.common.userMessages.noItemsAvailableToGenerateBoq);
      return;
    }

    for (let i = 0; i < reviewLines.length; i++) {
      if (!reviewLines[i].description?.trim()) {
        toast.error(interpolateUiString(UI_STRINGS.common.userMessages.lineIsMissingAnItemDescription, { "lineNumber": i + 1 }));
        return;
      }
    }

    setGeneratingDrawingBoq(true);
    try {
      const projId = setupProject || selectedProjectId || projects[0]?.id;
      const ccId = setupCostCentre || selectedCostCentreId || costCentres[0]?.id || null;
      const proj = projects.find(p => p.id === projId);

      const computedTitle = setupTitle.trim() || `Architectural Drawing — ${proj?.name || 'Project'}`;

      const res = await fetch('/api/boq/drawing-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          projectId: projId,
          costCentreId: ccId,
          drawingNumber: extractedDrawingData.drawingNumber || drawingNumber,
          fileName: extractedDrawingData.fileName,
          savedDocumentId: extractedDrawingData.documentId,
          fileSize: extractedDrawingData.fileSize,
          title: computedTitle,
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": setupDescription.trim() || `Extracted from architectural drawing ${extractedDrawingData.drawingNumber}` }),
          purpose: setupPurpose,
          lines: reviewLines,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": data.error || UI_STRINGS.common.userMessages.failedToGenerateDraftBoq }));
      }

      const payload = data.data || data;
      setDrawingReviewModalOpen(false);
      setExtractedDrawingData(null);
      setReviewLines([]);

      toast.success(interpolateUiString(UI_STRINGS.common.userMessages.draftBoqGeneratedSuccessfullyWithLines, { "boqCode": payload.boqCode, "totalLines": payload.totalLines }));
      setStatusType('success');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.draftBOQBoqCodeRevisionCodeGeneratedFromDrawingWithTotalLinesLines, { "boqCode": payload.boqCode, "revisionCode": payload.revisionCode, "totalLines": payload.totalLines }));

      await loadAllBoqs();
      await loadBoqDetails(payload.boqId);
      syncActiveBoqUrl(payload.boqId);

      workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e: any) {
      toast.error(UI_STRINGS.common.userMessages.boqGenerationFailedPleaseTryAgain);
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.errorGeneratingBOQMessage, { "message": e.message }));
    } finally {
      setGeneratingDrawingBoq(false);
    }
  };

  // -------------------------------------------------------------
  // METHOD 4: MANUAL ENTRY
  // -------------------------------------------------------------
  const handleSaveManual = async () => {
    setSavingManual(true);
    setStatusMessage('');

    try {
      const currentBoq = await ensureActiveBoqRecord();
      const res = await fetch('/api/boq/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: currentBoq.projectId,
          costCentreId: currentBoq.costCentreId,
          boqId: currentBoq.id,
          purpose: setupPurpose,
          title: interpolateUiString(UI_STRINGS.common.value1, { "value1": setupTitle.trim() || undefined }),
          description: interpolateUiString(UI_STRINGS.common.value1, { "value1": setupDescription.trim() || undefined }),
          lines: [],
          action: 'APPEND',
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSaveManualLines }));
      }

      const data = await res.json();
      setStatusType('success');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.manualBOQBoqCodeUpdatedWithValue2Lines, { "boqCode": currentBoq.boqCode, "value2": data.totalLines ?? 0 }));

      await loadAllBoqs();
      await loadBoqDetails(currentBoq.id);
      workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    } finally {
      setSavingManual(false);
    }
  };

  // -------------------------------------------------------------
  // BOQ EDIT ACTIONS (Section 9)
  // -------------------------------------------------------------
  const handleToggleEditMode = () => {
    if (!isEditingBoq) {
      if (activeBoq?.status === 'APPROVED') {
        setStatusType('error');
        setStatusMessage(UI_STRINGS.appAppBoqStudioPage.approvedBOQRevisionsAreLockedAndCannotBeEditedPleaseCreateANewRevision);
        return;
      }
      if (lines.length > BOQ_LINE_MAX_BATCH_EDITS) {
        setStatusType('error');
        setStatusMessage(interpolateUiString(UI_STRINGS.appApiBoqRevisionIdLinesRoute.batchLineUpdateLimitExceeded, {
          limit: BOQ_LINE_MAX_BATCH_EDITS,
        }));
        return;
      }
      setEditableLines(lines.map((l: any) => ({ ...l })));
      setIsEditingBoq(true);
    } else {
      setIsEditingBoq(false);
      setEditableLines([]);
    }
  };

  const handleUpdateEditableLineField = (index: number, field: string, value: any) => {
    setEditableLines(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSaveEditableChanges = async () => {
    if (!activeRevision) return;
    setSavingEditChanges(true);
    setStatusMessage('');

    try {
      const res = await fetch(`/api/boq/${activeRevision.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: editableLines.map((l: any) => ({
            id: l.id,
            standardDescription: l.standardDescription || l.originalDescription,
            originalDescription: l.originalDescription,
            specification: l.specification,
            quantity: l.quantity,
            uomRaw: l.uomRaw || l.uom?.code || 'NOS',
            location: l.location,
            brand: l.brand,
            remarks: l.remarks,
            aiUnitCost: l.aiUnitCost,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSaveChanges }));
      }

      setIsEditingBoq(false);
      setStatusType('success');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.bOQUpdatedSuccessfully);
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    } finally {
      setSavingEditChanges(false);
    }
  };

  // -------------------------------------------------------------
  // AI REFINE AT LINE-ITEM LEVEL (Section 10 - Requirement 2)
  // -------------------------------------------------------------
  const handleRequestRefineLine = async (line: any) => {
    if (!activeRevision || !line.id) return;
    setRefiningLineId(line.id);
    setStatusMessage('');

    try {
      const res = await fetch('/api/boq/refine-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boqRevisionId: activeRevision.id,
          lineIds: [line.id],
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToRefineLineDescription }));
      }

      const data = await res.json();
      const refinedLine = data.data?.lines?.[0] || data.lines?.[0];

      if (refinedLine) {
        setProposedRefinements(prev => ({
          ...prev,
          [line.id]: {
            suggestedDescription: refinedLine.aiSuggestedDescription,
            suggestedSpec: refinedLine.aiSuggestedSpec || refinedLine.aiSuggestedDescription,
            reason: refinedLine.aiReason || 'Standardized against catalogue benchmarks',
            confidence: refinedLine.aiConfidence || 0.9,
          },
        }));
        setStatusType('info');
        setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.proposedDescriptionReadyForLineLineNumberReviewAndClickApplyDescriptionToConfirm, { "lineNumber": line.lineNumber }));
      }
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.aIRefineErrorMessage, { "message": e.message }));
    } finally {
      setRefiningLineId(null);
    }
  };

  const handleApplyProposedDescription = async (line: any, proposal: any) => {
    if (!activeRevision || !line.id) return;
    try {
      const res = await fetch(`/api/boq/${activeRevision.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: line.id,
          updates: {
            specification: proposal.suggestedSpec || proposal.suggestedDescription,
            standardDescription: proposal.suggestedDescription,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToApplyDescription }));
      }

      // Clear the proposal for this line
      setProposedRefinements(prev => {
        const next = { ...prev };
        delete next[line.id];
        return next;
      });

      setStatusType('success');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.appliedRefinedBOQDescriptionForLineLineNumberOriginalContentPreservedInHistory, { "lineNumber": line.lineNumber }));
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    }
  };

  const handleAcceptAiSuggestion = async (line: any) => {
    if (!activeRevision) return;
    try {
      await fetch(`/api/boq/${activeRevision.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: line.id,
          updates: {
            standardDescription: line.aiSuggestedDescription || line.standardDescription,
          },
        }),
      });
      setStatusType('success');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.acceptedAISuggestionForLineLineNumber, { "lineNumber": line.lineNumber }));
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    }
  };

  const handleRejectAiSuggestion = async (line: any) => {
    if (!activeRevision) return;
    try {
      await fetch(`/api/boq/${activeRevision.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: line.id,
          updates: {
            standardDescription: line.originalDescription,
          },
        }),
      });
      setStatusType('info');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.retainedOriginalDescriptionForLineLineNumber, { "lineNumber": line.lineNumber }));
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    }
  };

  // -------------------------------------------------------------
  // GENERATE AI COST (Section 11)
  // -------------------------------------------------------------
  const handleGenerateAiCost = async () => {
    if (!activeRevision) return;
    setEstimatingCost(true);
    setStatusMessage('');

    try {
      const unestimated = lines.filter(l => !l.aiUnitCost || l.aiTotalCost === null);
      const payload: any = { boqRevisionId: activeRevision.id };
      if (unestimated.length > 0 && unestimated.length < lines.length) {
        payload.lineIds = unestimated.map(l => l.id);
      }

      const res = await fetch('/api/boq/estimate-cost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(UI_STRINGS.appAppBoqStudioPage.aICostEstimationFailed);
      const rawData = await res.json();
      const resData = rawData.data || rawData;

      setStatusType('success');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.aICostGeneratedSuccessfullyToLocaleString, { "toLocaleString": (resData.totalEstimatedBenchmarkValue || 0).toLocaleString(I18N_CONFIG.defaultLocale) }));
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.costGenerationErrorMessage, { "message": e.message }));
    } finally {
      setEstimatingCost(false);
    }
  };

  // -------------------------------------------------------------
  // VALIDATE BOQ QUALITY
  // -------------------------------------------------------------
  const handleValidateBoq = async () => {
    if (!activeRevision) return;
    setValidatingQuality(true);
    setStatusMessage('');

    try {
      const res = await fetch(`/api/boq/${activeRevision.id}/validate`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error(UI_STRINGS.appAppBoqStudioPage.validationFailed);

      setStatusType('success');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.bOQValidationCompleteAllSpecificationsAndQuantitiesVerified);
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.validationErrorMessage, { "message": e.message }));
    } finally {
      setValidatingQuality(false);
    }
  };

  // -------------------------------------------------------------
  // ADD TO BUDGET (Section 13)
  // -------------------------------------------------------------
  const handleAddToBudget = async () => {
    if (!activeRevision || !activeBoq) return;
    setAddingToBudget(true);
    setStatusMessage('');

    try {
      const res = await fetch('/api/boq/add-to-budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boqRevisionId: activeRevision.id,
          costCentreId: activeBoq.costCentreId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToAddToBudget }));
      }

      const data = await res.json();
      setBudgetModalOpen(false);
      setStatusType('success');
      setStatusMessage(
        data.alreadySubmitted
          ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.iBudgetContributionValue1IsAlreadyRecordedWithStatusUnderApproval, { "value1": data.transactionCode || '' })
          : interpolateUiString(UI_STRINGS.appAppBoqStudioPage.budgetContributionValue1RecordedWithStatusUnderApprovalRoutedToProjectApprover, { "value1": data.transactionCode || UI_STRINGS.common.userMessages.btx000001 })
      );
      if (activeBoq) await loadBoqDetails(activeBoq.id);
      await loadAllBoqs();
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.errorAddingToBudgetMessage, { "message": e.message }));
    } finally {
      setAddingToBudget(false);
    }
  };

  // -------------------------------------------------------------
  // CREATE PR (Section 14)
  // -------------------------------------------------------------
  const handleCreatePR = async () => {
    if (!activeRevision || !activeBoq) return;
    setCreatingPr(true);
    setStatusMessage('');

    try {
      const res = await fetch('/api/boq/create-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boqRevisionId: activeRevision.id,
          costCentreId: activeBoq.costCentreId,
          autoSubmit: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSubmitBoq }));
      }

      const data = await res.json();
      setPrModalOpen(false);
      setStatusType('success');
      setStatusMessage(UI_STRINGS.common.bOQSubmittedSuccessfully);
      toast.success(UI_STRINGS.common.bOQSubmittedSuccessfully, data.prNumber || activeBoq.boqCode, UI_STRINGS.appAppProcurementPposPage.awaitingProjectApprover);
      if (activeBoq) await loadBoqDetails(activeBoq.id);
      await loadAllBoqs();
    } catch (e: any) {
      toast.error(e.message || UI_STRINGS.common.userMessages.errorSubmittingBoq);
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.errorSubmittingBOQMessage, { "message": e.message }));
    } finally {
      setCreatingPr(false);
    }
  };

  // -------------------------------------------------------------
  // LINE ACTIONS (Add, Delete, Save Single Edit)
  // -------------------------------------------------------------
  const handleDeleteLine = async (lineId: string) => {
    if (!activeRevision || !confirm(UI_STRINGS.appAppBoqStudioPage.areYouSureYouWantToDeleteThisLine)) return;
    try {
      await fetch(`/api/boq/${activeRevision.id}/lines?lineId=${lineId}`, { method: 'DELETE' });
      setStatusType('info');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.lineItemDeleted);
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    }
  };

  const handleSaveSingleLineEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLineModal || !activeRevision) return;

    try {
      const res = await fetch(`/api/boq/${activeRevision.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineId: editingLineModal.id,
          updates: {
            standardDescription: editingLineModal.standardDescription,
            originalDescription: editingLineModal.originalDescription,
            specification: editingLineModal.specification,
            quantity: editingLineModal.quantity,
            uomRaw: editingLineModal.uomRaw || editingLineModal.uom?.code || 'NOS',
            location: editingLineModal.location,
            brand: editingLineModal.brand,
            remarks: editingLineModal.remarks,
            aiUnitCost: editingLineModal.aiUnitCost,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToSaveChanges }));
      }

      setEditingLineModal(null);
      setStatusType('success');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.lineItemUpdatedSuccessfully);
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRevision) return;

    try {
      const res = await fetch(`/api/boq/${activeRevision.id}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: newLineData.description,
          specification: newLineData.specification,
          uomRaw: newLineData.uom,
          quantity: newLineData.quantity,
          location: newLineData.location,
          brand: newLineData.brand,
          remarks: newLineData.remarks,
          aiUnitCost: newLineData.aiUnitCost,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(interpolateUiString(UI_STRINGS.common.value1, { "value1": err.error || UI_STRINGS.common.userMessages.failedToAddLine }));
      }

      setAddLineModalOpen(false);
      setNewLineData({
        description: '',
        specification: '',
        category: 'Civil & Interior',
        uom: 'NOS',
        quantity: 1,
        location: '',
        brand: '',
        remarks: '',
        aiUnitCost: 150,
      });

      setStatusType('success');
      setStatusMessage(UI_STRINGS.appAppBoqStudioPage.lineItemAddedSuccessfully);
      if (activeBoq) await loadBoqDetails(activeBoq.id);
    } catch (e: any) {
      setStatusType('error');
      setStatusMessage(interpolateUiString(UI_STRINGS.common.errorMessage, { "message": e.message }));
    }
  };

  // Helper metadata values
  const activeProjectObj = projects.find(p => p.id === (activeBoq?.projectId || setupProject || selectedProjectId));
  const activeCostCentreObj = costCentres.find(cc => cc.id === (activeBoq?.costCentreId || setupCostCentre || selectedCostCentreId));

  const filteredLines = isEditingBoq ? editableLines : lines;

  // Section 3: Comprehensive integrated financial summary
  const financialSummary = useMemo(() => {
    const rawArea = activeCostCentreObj?.areaSqFt || activeProjectObj?.areaSqFt || (setupArea ? parseFloat(setupArea.replace(/,/g, '')) : null);
    const areaSqFt = rawArea && !isNaN(rawArea) && rawArea > 0 ? rawArea : null;
    if (lineSummary) {
      const totalAiEstimate = lineSummary.totalAiEstimate;
      return {
        totalLines: lineSummary.totalLines,
        validQuantityLines: lineSummary.validQuantityLines,
        missingQuantityLines: lineSummary.missingQuantityLines,
        missingRateLines: lineSummary.missingRateLines,
        validationErrorLines: lineSummary.validationErrorLines,
        hasAiEstimates: lineSummary.estimatedLineCount > 0,
        totalAiEstimate,
        areaSqFt,
        costPerSqFt: areaSqFt && totalAiEstimate > 0
          ? Math.round((totalAiEstimate / areaSqFt) * 100) / 100
          : null,
        categoryTotals: lineSummary.categoryTotals,
      };
    }

    const currentLines = isEditingBoq ? editableLines : lines;
    const totalLines = lineTotal;

    let validQuantityLines = 0;
    let missingQuantityLines = 0;
    let missingRateLines = 0;
    let validationErrorLines = 0;

    let totalAiEstimate = 0;
    let hasAiEstimates = false;

    const categoryTotals: Record<string, number> = {
      Material: 0,
      Electrical: 0,
      Civil: 0,
      Interior: 0,
      Other: 0,
    };

    for (const l of currentLines) {
      const qty = (l.quantity !== null && l.quantity !== undefined && !isNaN(Number(l.quantity)) && Number(l.quantity) > 0)
        ? Number(l.quantity)
        : null;

      if (qty === null) {
        missingQuantityLines++;
      } else {
        validQuantityLines++;
      }

      const unitCost = (l.aiUnitCost !== null && l.aiUnitCost !== undefined && !isNaN(Number(l.aiUnitCost)) && Number(l.aiUnitCost) > 0)
        ? Number(l.aiUnitCost)
        : null;

      if (!unitCost) {
        missingRateLines++;
      }

      if (l.validationStatus === 'ERROR' || l.validationStatus === 'QUANTITY_REQUIRED') {
        validationErrorLines++;
      }

      // Crucial rule: Do not calculate a line total where the quantity is missing or invalid.
      if (qty !== null && unitCost !== null) {
        const lineCost = l.aiTotalCost !== null && l.aiTotalCost !== undefined ? Number(l.aiTotalCost) : (unitCost * qty);
        totalAiEstimate += lineCost;
        hasAiEstimates = true;

        const cName = (l.category?.name || l.category || '').toLowerCase();
        if (cName.includes('electrical')) categoryTotals.Electrical += lineCost;
        else if (cName.includes('civil')) categoryTotals.Civil += lineCost;
        else if (cName.includes('interior')) categoryTotals.Interior += lineCost;
        else if (cName.includes('material')) categoryTotals.Material += lineCost;
        else categoryTotals.Other += lineCost;
      }
    }

    // Cost per SqFt
    const costPerSqFt = (areaSqFt && hasAiEstimates && totalAiEstimate > 0)
      ? Math.round((totalAiEstimate / areaSqFt) * 100) / 100
      : null;

    return {
      totalLines,
      validQuantityLines,
      missingQuantityLines,
      missingRateLines,
      validationErrorLines,
      hasAiEstimates,
      totalAiEstimate: Math.round(totalAiEstimate * 100) / 100,
      areaSqFt,
      costPerSqFt,
      categoryTotals,
    };
  }, [isEditingBoq, editableLines, lines, lineSummary, lineTotal, activeCostCentreObj, activeProjectObj, setupArea]);

  const pendingQuantityCount = financialSummary.missingQuantityLines;
  const totalRevValue = financialSummary.totalAiEstimate;

  // Filtered BOQs for bottom list
  const filteredExistingBoqs = boqs.filter(b => {
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      return (
        b.boqCode?.toLowerCase().includes(q) ||
        b.title?.toLowerCase().includes(q) ||
        b.category?.toLowerCase().includes(q) ||
        b.project?.name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="container" style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto' }}>
      {/* =========================================================================
          TOP SECTION: BOQ CREATION HEADER & SETUP BAR
      ========================================================================= */}
      <PageHeader
        title={UI_STRINGS.appAppBoqStudioPage.bOQCreationStudio}
        subtitle={UI_STRINGS.appAppBoqStudioPage.unifiedBOQGenerationImportLineStandardisationAndAIMarketCostEstimationWorkspace}
        actions={
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setActiveBoq(null);
              setActiveRevision(null);
              setLines([]);
              setLineSummary(null);
              setLineTotal(0);
              setLineNextCursor(null);
              setLinePageCursors([]);
              setLinePageIndex(1);
              setLinesSearch('');
              setEditableLines([]);
              setImportResult(null);
              setSetupTitle('');
              setSetupDescription('');
              if (typeof window !== 'undefined') {
                localStorage.removeItem('procpx_active_boq_id');
                const url = new URL(window.location.href);
                url.searchParams.delete('boqId');
                window.history.replaceState(null, '', url.toString());
              }
              setStatusType('info');
              setStatusMessage(UI_STRINGS.appAppBoqStudioPage.readyToCreateANewBOQSelectYourProjectParametersAndChooseAGenerationMethod);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, padding: '8px 16px', fontSize: 13 }}
          >
            <Plus size={14} />{UI_STRINGS.appAppBoqStudioPage.cREATENEWBOQ}</button>
        }
      />

      {/* SETUP CONTEXT BAR (Project, Cost Centre, Sector, Area, Purpose) */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: '16px 20px', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderKanban size={16} color="#2563eb" />{UI_STRINGS.appAppBoqStudioPage.projectTargetParameters}</h3>
          <span style={{ fontSize: 11, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.defineScopeCostCentreAndTargetCategoriesForThisBOQ}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 14, alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.project}</label>
            <select
              className="select-field"
              value={setupProject}
              onChange={e => {
                setSetupProject(e.target.value);
                setSetupCostCentre('');
              }}
              style={{ width: '100%', height: 36, fontSize: 12 }}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}{UI_STRINGS.common.copy1b3t0c5}{p.projectCode}{UI_STRINGS.common.copyc7zu6c}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.costCentre}</label>
            <select
              className="select-field"
              value={setupCostCentre}
              onChange={e => setSetupCostCentre(e.target.value)}
              style={{ width: '100%', height: 36, fontSize: 12 }}
            >
              {costCentres.map(cc => (
                <option key={cc.id} value={cc.id}>{cc.code}{UI_STRINGS.common.copyq9aflv}{cc.name}</option>
              ))}
            </select>
            <div className="flex gap-2 mt-2">
              <input
                type="search"
                className="select-field"
                value={costCentreSearch}
                onChange={e => setCostCentreSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void loadCostCentres(setupProject, costCentreSearch, 1); } }}
                placeholder={UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation}
                aria-label={UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation}
                style={{ minWidth: 0, flex: 1 }}
              />
              <button type="button" className="btn btn-secondary" aria-label={UI_STRINGS.appAppCostCentresPage.searchCostCentreCodeNameZoneOrLocation}
                onClick={() => void loadCostCentres(setupProject, costCentreSearch, 1)}><Search size={16} /></button>
            </div>
            {costCentreTotal > costCentres.length && (
              <p className="text-xs text-slate-500 mt-1">
                {interpolateUiString(UI_STRINGS.appAppCostCentresPage.showingCostCentreCountOfTotal, { loaded: costCentres.length, total: costCentreTotal })}
              </p>
            )}
            {costCentreHasMore && (
              <button type="button" className="text-sm text-blue-600 underline mt-1" onClick={() => void loadCostCentres(setupProject, costCentreSearch, costCentrePage + 1, true)}>
                {UI_STRINGS.appAppCostCentresPage.loadMoreCostCentres}
              </button>
            )}
          </div>

          {/* Category Selection directly under Project & Target Parameters (Requirement 1) */}
          <div style={{ position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.categories}{stdCategories.length}{UI_STRINGS.common.copyc7zu6c}</label>
            <button
              type="button"
              className="select-field"
              onClick={() => setCategoryDropdownOpen(prev => !prev)}
              style={{
                width: '100%',
                height: 36,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                padding: '0 10px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                {stdCategories.length === 0
                  ? UI_STRINGS.appAppBoqStudioPage.selectCategories
                  : stdCategories.length === masterCategories.length
                  ? UI_STRINGS.common.allCategories
                  : stdCategories.join(', ')}
              </span>
              {categoryDropdownOpen ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
            </button>

            {categoryDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 42,
                  left: 0,
                  zIndex: 50,
                  width: 300,
                  padding: 12,
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                }}
              >
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      className="input-field"
                      value={categorySearchQuery}
                      onChange={e => setCategorySearchQuery(e.target.value)}
                      placeholder={UI_STRINGS.appAppBoqStudioPage.searchCategories}
                      style={{ width: '100%', height: 28, fontSize: 11, paddingLeft: 26 }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStdCategories([...masterCategories]);
                      setSetupCategories([...masterCategories]);
                    }}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >{UI_STRINGS.appAppBoqStudioPage.all}</button>
                  <span style={{ color: '#cbd5e1' }}>{UI_STRINGS.common.copy1x3o5rv}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStdCategories([]);
                      setSetupCategories([]);
                    }}
                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >{UI_STRINGS.common.clear}</button>
                </div>

                <div style={{ maxHeight: 200, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
                  {masterCategories
                    .filter(cat => cat.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                    .map(cat => {
                      const checked = stdCategories.includes(cat);
                      return (
                        <label
                          key={cat}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 11,
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: 4,
                            background: checked ? '#eff6ff' : 'transparent',
                            color: checked ? '#1e40af' : '#475569',
                            fontWeight: checked ? 600 : 400,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...stdCategories, cat]
                                : stdCategories.filter(c => c !== cat);
                              setStdCategories(next);
                              setSetupCategories(next);
                            }}
                          />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.sectorProjectType}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="select-field"
                value={setupSector}
                onChange={e => {
                  const s = e.target.value;
                  setSetupSector(s);
                  setStdSector(s);
                  const av = SECTOR_PROJECT_TYPES[s] || [];
                  if (av.length > 0) {
                    setSetupProjectType(av[0]);
                    setStdProjectType(av[0]);
                  }
                }}
                style={{ width: '45%', height: 36, fontSize: 12 }}
              >
                <option value="RETAIL">{UI_STRINGS.appAppBoqStudioPage.retail}</option>
                <option value="HOSPITALITY">{UI_STRINGS.appAppBoqStudioPage.hospitality}</option>
                <option value="BANKING">{UI_STRINGS.appAppBoqStudioPage.banking}</option>
                <option value="INSURANCE">{UI_STRINGS.appAppBoqStudioPage.insurance}</option>
                <option value="OFFICE">{UI_STRINGS.appAppBoqStudioPage.office}</option>
                <option value="SERVICES">{UI_STRINGS.appAppBoqStudioPage.services}</option>
              </select>
              <select
                className="select-field"
                value={setupProjectType}
                onChange={e => {
                  setSetupProjectType(e.target.value);
                  setStdProjectType(e.target.value);
                }}
                style={{ width: '55%', height: 36, fontSize: 12 }}
              >
                {(SECTOR_PROJECT_TYPES[setupSector] || ['Retail Store Fitout']).map(pt => (
                  <option key={pt} value={pt}>{pt}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.areaSqft}</label>
            <input
              type="text"
              className="input-field"
              value={setupArea}
              onChange={e => setSetupArea(e.target.value)}
              placeholder={UI_STRINGS.appAppBoqStudioPage.copy1slme3c}
              style={{ width: '100%', height: 36, fontSize: 12 }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.bOQPurpose}</label>
            <select
              className="select-field"
              value={setupPurpose}
              onChange={e => handlePurposeChange(e.target.value as any)}
              style={{ width: '100%', height: 36, fontSize: 12, fontWeight: 600, color: setupPurpose === 'BUDGET' ? '#047857' : '#1e40af' }}
            >
              <option value="BUDGET">{UI_STRINGS.appAppBoqStudioPage.bUILDPROJECTBUDGET}</option>
              <option value="PR">{UI_STRINGS.appAppBoqStudioPage.bOQSUBMISSIONPROCUREMENT}</option>
            </select>
          </div>
        </div>

        {/* Row 2: BOQ Title and BOQ Description */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 14, alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.bOQTitleName}</label>
              <span style={{ fontSize: 10, color: userEditedTitle ? '#475569' : '#2563eb', fontWeight: 600 }}>
                {userEditedTitle ? UI_STRINGS.appAppBoqStudioPage.customTitle : UI_STRINGS.appAppBoqStudioPage.autoCategoryProject}
              </span>
            </div>
            <input
              type="text"
              className="input-field"
              value={setupTitle}
              onChange={e => {
                setSetupTitle(e.target.value);
                setUserEditedTitle(true);
              }}
              placeholder={UI_STRINGS.appAppBoqStudioPage.eGCivilInteriorKundanahalliProject}
              style={{ width: '100%', height: 36, fontSize: 12 }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{UI_STRINGS.common.bOQDescription}</label>
            <textarea
              className="input-field"
              rows={2}
              value={setupDescription}
              onChange={e => setSetupDescription(e.target.value)}
              placeholder={UI_STRINGS.appAppBoqStudioPage.describeThePurposeScopeOrSpecificRequirementsOfThisBOQ}
              style={{ width: '100%', fontSize: 12, padding: '7px 10px', resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Row 3: Action Button to Explicitly Save/Apply Target Parameters */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: '#64748b' }}>
            {activeBoq ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.activeBOQBoqCode, { "boqCode": activeBoq.boqCode }) : UI_STRINGS.appAppBoqStudioPage.configureParametersBeforeGeneratingBOQ}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSaveParameters}
            disabled={savingParameters}
            style={{ fontWeight: 700, fontSize: 11, padding: '6px 16px' }}
          >
            {savingParameters ? UI_STRINGS.appAppBoqStudioPage.savingParameters : UI_STRINGS.appAppBoqStudioPage.sAVETARGETPARAMETERS}
          </button>
        </div>
      </div>

      {/* STATUS & FEEDBACK BANNER */}
      {statusMessage && (
        <div
          style={{
            background: statusType === 'success' ? '#f0fdf4' : statusType === 'error' ? '#fef2f2' : '#eff6ff',
            border: `1px solid ${statusType === 'success' ? '#bbf7d0' : statusType === 'error' ? '#fecaca' : '#bfdbfe'}`,
            color: statusType === 'success' ? '#166534' : statusType === 'error' ? '#991b1b' : '#1e40af',
            padding: '12px 18px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {statusType === 'success' ? <CheckCircle2 size={18} /> : statusType === 'error' ? <AlertTriangle size={18} /> : <Info size={18} />}
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 16 }}
          >{UI_STRINGS.common.copy4i33ao}</button>
        </div>
      )}

      {/* =========================================================================
          HOW WOULD YOU LIKE TO CREATE THIS BOQ? (ENTRY POINTS ONLY)
      ========================================================================= */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{UI_STRINGS.appAppBoqStudioPage.hOWWOULDYOULIKETOCREATETHISBOQ}</h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {/* Card 1: Upload Existing BOQ */}
          <div
            onClick={() => setSelectedMethod(1)}
            style={{
              padding: 16,
              borderRadius: 8,
              border: selectedMethod === 1 ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedMethod === 1 ? '#eff6ff' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: selectedMethod === 1 ? '0 4px 6px -1px rgba(37,99,235,0.1)' : 'none',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Upload size={18} color="#2563eb" />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.copy1ev40o2}</h3>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{UI_STRINGS.appAppBoqStudioPage.uploadAnExistingBOQUsingTheSimpleProCPXExcelFormat}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadSimpleTemplate();
                }}
                style={{ fontSize: 11, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, background: '#ffffff' }}
              >
                <Download size={13} />{UI_STRINGS.appAppBoqStudioPage.dOWNLOADSIMPLEBOQTEMPLATE}</button>

              <input
                type="file"
                ref={fileInputMethod1Ref}
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleUploadExistingBoq(e.target.files[0]);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploadingMethod1}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputMethod1Ref.current?.click();
                }}
                style={{ fontSize: 11, padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
              >
                <Upload size={13} />
                {uploadingMethod1 ? UI_STRINGS.appAppBoqStudioPage.uploading : UI_STRINGS.appAppBoqStudioPage.uPLOADEXISTINGBOQ}
              </button>
            </div>
          </div>

          {/* Card 2: Download Standard BOQ */}
          <div
            onClick={() => setSelectedMethod(2)}
            style={{
              padding: 16,
              borderRadius: 8,
              border: selectedMethod === 2 ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedMethod === 2 ? '#eff6ff' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: selectedMethod === 2 ? '0 4px 6px -1px rgba(37,99,235,0.1)' : 'none',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <FileSpreadsheet size={18} color="#2563eb" />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.copy1w28e12}</h3>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{UI_STRINGS.appAppBoqStudioPage.downloadACategorySpecificStandardBOQEnterQuantitiesAndProjectRequirementsThenUploadTheCompletedFile}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-outline"
                disabled={downloadingStd}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownloadStandardBoq();
                }}
                style={{ fontSize: 11, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, background: '#ffffff' }}
              >
                <Download size={13} />
                {downloadingStd ? UI_STRINGS.appAppBoqStudioPage.downloading : UI_STRINGS.appAppBoqStudioPage.dOWNLOADSTANDARDBOQ}
              </button>

              <input
                type="file"
                ref={fileInputMethod2Ref}
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    handleUploadCompletedStandardBoq(e.target.files[0]);
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={uploadingMethod2}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputMethod2Ref.current?.click();
                }}
                style={{
                  fontSize: 11,
                  padding: '7px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontWeight: 700,
                  background: stdDownloaded ? '#16a34a' : '#2563eb',
                  borderColor: stdDownloaded ? '#16a34a' : '#2563eb',
                }}
              >
                <Upload size={13} />
                {uploadingMethod2 ? UI_STRINGS.appAppBoqStudioPage.uploadingPopulating : UI_STRINGS.appAppBoqStudioPage.uPLOADCOMPLETEDBOQ}
              </button>
            </div>
          </div>

          {/* Card 3: Drawing to BOQ */}
          <div
            onClick={() => setSelectedMethod(3)}
            style={{
              padding: 16,
              borderRadius: 8,
              border: selectedMethod === 3 ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedMethod === 3 ? '#eff6ff' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: selectedMethod === 3 ? '0 4px 6px -1px rgba(37,99,235,0.1)' : 'none',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <ImageIcon size={18} color="#2563eb" />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.copyqn96kp}</h3>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{UI_STRINGS.appAppBoqStudioPage.uploadArchitecturalDrawingsAndGenerateADraftBOQUsingAIAssistedExtraction}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <input
                type="text"
                className="input-field"
                placeholder={UI_STRINGS.appAppBoqStudioPage.drawingRefEGDWGA101}
                value={drawingNumber}
                onChange={e => setDrawingNumber(e.target.value)}
                onClick={e => e.stopPropagation()}
                style={{ height: 32, fontSize: 11 }}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '7px 8px',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 700,
                  background: extractingDrawing ? '#94a3b8' : '#2563eb',
                  color: '#ffffff',
                  cursor: extractingDrawing ? 'not-allowed' : 'pointer',
                  textAlign: 'center',
                }}
              >
                <Upload size={13} />
                {extractingDrawing ? (drawingProgressText || UI_STRINGS.appAppBoqStudioPage.extracting) : UI_STRINGS.appAppBoqStudioPage.uPLOADDRAWING}
                <input
                  id="drawing-file-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  style={{ display: 'none' }}
                  disabled={extractingDrawing}
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      handleDrawingExtract(file);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
              {extractedDrawingData && !drawingReviewModalOpen && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setDrawingReviewModalOpen(true);
                  }}
                  style={{
                    padding: '5px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    background: '#ecfdf5',
                    color: '#065f46',
                    border: '1px solid #a7f3d0',
                    cursor: 'pointer',
                  }}
                >{UI_STRINGS.appAppBoqStudioPage.reviewExtractedItems}{reviewLines.length}{UI_STRINGS.common.copyc7zu6c}</button>
              )}
            </div>
          </div>

          {/* Card 4: Manual Entry */}
          <div
            onClick={() => setSelectedMethod(4)}
            style={{
              padding: 16,
              borderRadius: 8,
              border: selectedMethod === 4 ? '2px solid #2563eb' : '1px solid #cbd5e1',
              background: selectedMethod === 4 ? '#eff6ff' : '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: selectedMethod === 4 ? '0 4px 6px -1px rgba(37,99,235,0.1)' : 'none',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <PenTool size={18} color="#2563eb" />
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.copyuytobr}</h3>
              </div>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0, lineHeight: 1.4 }}>{UI_STRINGS.appAppBoqStudioPage.createABOQManuallyUsingStandardItemAndCatalogueSuggestions}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedMethod(4);
                }}
                style={{ fontSize: 11, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600, background: '#ffffff' }}
              >{interpolateUiString(UI_STRINGS.appAppBoqStudioPage.configureLinesCount, { count: editableLines.length })}</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={savingManual}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSaveManual();
                }}
                style={{ fontSize: 11, padding: '7px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 700 }}
              >
                <Plus size={13} />
                {savingManual ? UI_STRINGS.common.saving : UI_STRINGS.appAppBoqStudioPage.cREATEMANUALBOQ}
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* =========================================================================
          BELOW THE FOUR OPTIONS: CENTRAL BOQ WORKSPACE (Section 2, 7, 8, 9, 10, 11)
      ========================================================================= */}
      <div ref={workspaceRef} style={{ marginTop: 32, marginBottom: 36 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: -0.2 }}>{UI_STRINGS.appAppBoqStudioPage.bOQWORKSPACE}</h2>
          {activeBoq && (
            <span style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.workingDocumentAllChangesAndAICostsOperateInPlaceBelow}</span>
          )}
        </div>

        {!activeBoq || lines.length === 0 ? (
          /* Initial Empty State */
          <div className="card" style={{ background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
            <FileSpreadsheet size={44} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#334155', margin: '0 0 6px 0' }}>{UI_STRINGS.appAppBoqStudioPage.bOQWORKSPACEISCURRENTLYEMPTY}</h3>
            <p style={{ fontSize: 13, color: '#64748b', margin: '0 auto 16px auto', maxWidth: 500 }}>{UI_STRINGS.appAppBoqStudioPage.completeANYOneOfTheFourMethodsAboveToGenerateOrUploadYourBOQOrSelectAnExistingBOQFromTheListBelowTheActiveBOQWillAppearImmediatelyRightHere}</p>
          </div>
        ) : (
          /* Active Central BOQ Workspace - Compact Self-Contained Document */
          <div
            className="card boq-workspace-container"
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '16px 20px',
              marginBottom: 24,
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
            }}
          >
            {/* 1. COMPACT BOQ HEADER */}
            <div style={{ paddingBottom: 12, borderBottom: '1px solid #f1f5f9', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#1e40af', background: '#eff6ff', padding: '3px 8px', borderRadius: 4, fontFamily: 'monospace' }}>
                    {activeBoq.boqCode}
                  </span>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>
                    {activeBoq.title || activeBoq.boqCode}
                  </h3>
                  <span style={{ color: '#cbd5e1' }}>{UI_STRINGS.common.copy1x3o5rv}</span>
                  <span style={{ fontSize: 12, color: '#475569' }}>
                    <strong>{UI_STRINGS.common.costCentre3}</strong> {activeCostCentreObj?.code || UI_STRINGS.appAppBoqStudioPage.cC}{UI_STRINGS.common.copyq9aflv}{activeCostCentreObj?.name || UI_STRINGS.common.costCentre2}
                  </span>
                  <span style={{ color: '#cbd5e1' }}>{UI_STRINGS.common.copy1x3o5rv}</span>
                  <span style={{ fontSize: 12, color: '#475569' }}>
                    <strong>{UI_STRINGS.common.category3}</strong> {activeBoq.category || UI_STRINGS.common.standard}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', background: '#f1f5f9', padding: '2px 7px', borderRadius: 4 }}>
                    {activeRevision?.revisionCode || UI_STRINGS.common.r0}
                  </span>
                  <StatusBadge status={activeBoq.status || 'DRAFT'} />
                </div>

                <button
                  type="button"
                  onClick={() => setShowDetails(prev => !prev)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 11,
                    color: '#64748b',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    padding: '3px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title={UI_STRINGS.appAppBoqStudioPage.toggleProjectAreaAndScopeDetails}
                >
                  <Info size={12} />
                  {showDetails ? UI_STRINGS.appAppBoqStudioPage.hideDetails : UI_STRINGS.appAppBoqStudioPage.details}
                  {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Collapsible Secondary Metadata Row */}
              {showDetails && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: 6 }}>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.project2}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{activeProjectObj?.name || UI_STRINGS.common.project}</span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.area}</span>
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>
                      {activeCostCentreObj?.areaSqFt ? interpolateUiString(UI_STRINGS.common.toLocaleStringSqft, { "toLocaleString": activeCostCentreObj.areaSqFt.toLocaleString() }) : (setupArea ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.setupAreaSqft, { "setupArea": setupArea }) : UI_STRINGS.common.copy4s9bsz)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.purpose2}</span>
                    <span style={{
                      display: 'inline-block',
                      padding: '1px 6px',
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 700,
                      background: activeBoq.purpose === 'BUDGET' ? '#ecfdf5' : '#eff6ff',
                      color: activeBoq.purpose === 'BUDGET' ? '#047857' : '#1e40af',
                    }}>
                      {activeBoq.purpose === 'BUDGET' ? UI_STRINGS.appAppBoqStudioPage.budgetBaseline : UI_STRINGS.appAppBoqStudioPage.bOQSubmissionProcurement}
                    </span>
                  </div>
                  {activeBoq.description && (
                    <div style={{ width: '100%', marginTop: 2, paddingTop: 6, borderTop: '1px solid #f1f5f9', color: '#334155', fontStyle: 'italic', fontSize: 11 }}>
                      <span style={{ fontWeight: 600, fontStyle: 'normal', color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.scope}</span>
                      {activeBoq.description}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. SIMPLIFIED ACTION BAR */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 8,
                paddingBottom: 12,
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              {/* Secondary Actions Left */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleToggleEditMode}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    fontSize: 12,
                    padding: '5px 10px',
                    background: isEditingBoq ? '#eff6ff' : '#ffffff',
                    borderColor: isEditingBoq ? '#2563eb' : '#cbd5e1',
                    color: isEditingBoq ? '#1e40af' : '#334155',
                  }}
                >
                  <PenTool size={13} />
                  {isEditingBoq ? UI_STRINGS.appAppBoqStudioPage.exitEditMode : UI_STRINGS.appAppBoqStudioPage.editBOQ}
                </button>



                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleGenerateAiCost}
                  disabled={estimatingCost || lines.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    fontSize: 12,
                    padding: '5px 10px',
                    color: '#059669',
                  }}
                  title={UI_STRINGS.appAppBoqStudioPage.generateIndicativeBenchmarkEstimatesForUnestimatedLines}
                >
                  <TrendingUp size={13} color="#059669" />
                  {estimatingCost ? UI_STRINGS.appAppBoqStudioPage.calculating : UI_STRINGS.appAppBoqStudioPage.generateAICost}
                </button>

                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleValidateBoq}
                  disabled={validatingQuality || lines.length === 0}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    fontSize: 12,
                    padding: '5px 10px',
                    color: '#2563eb',
                  }}
                >
                  <ShieldCheck size={13} color="#2563eb" />
                  {validatingQuality ? UI_STRINGS.common.validating : UI_STRINGS.appAppBoqStudioPage.validate}
                </button>
              </div>

              {/* Primary Action Right */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {activeBoq.purpose === 'PR' ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (pendingQuantityCount > 0) {
                        setStatusType('error');
                        setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityRequiredForPendingQuantityCountItemValue2BeforeBOQSubmission, { "pendingQuantityCount": pendingQuantityCount, "value2": pendingQuantityCount > 1 ? 's' : '' }));
                        return;
                      }
                      setPrModalOpen(true);
                    }}
                    disabled={lines.length === 0}
                    title={pendingQuantityCount > 0 ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityRequiredForPendingQuantityCountItemsBeforeBOQSubmission, { "pendingQuantityCount": pendingQuantityCount }) : undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      fontSize: 12,
                      padding: '6px 14px',
                      background: pendingQuantityCount > 0 ? '#94a3b8' : '#2563eb',
                      borderColor: pendingQuantityCount > 0 ? '#94a3b8' : '#2563eb',
                      cursor: pendingQuantityCount > 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Send size={13} />{UI_STRINGS.appAppBoqStudioPage.submitBOQ}</button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (pendingQuantityCount > 0) {
                        setStatusType('error');
                        setStatusMessage(interpolateUiString(UI_STRINGS.appAppBoqStudioPage.pendingQuantityCountBOQLineValue2RequireQuantityBeforeThisBOQCanBeAddedToBudget, { "pendingQuantityCount": pendingQuantityCount, "value2": pendingQuantityCount > 1 ? 's' : '' }));
                        return;
                      }
                      setBudgetModalOpen(true);
                    }}
                    disabled={lines.length === 0}
                    title={pendingQuantityCount > 0 ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.pendingQuantityCountBOQLinesRequireQuantityBeforeAddingToBudget, { "pendingQuantityCount": pendingQuantityCount }) : undefined}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: 700,
                      fontSize: 12,
                      padding: '6px 14px',
                      background: pendingQuantityCount > 0 ? '#94a3b8' : '#059669',
                      borderColor: pendingQuantityCount > 0 ? '#94a3b8' : '#059669',
                      cursor: pendingQuantityCount > 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Landmark size={13} />{UI_STRINGS.appAppBoqStudioPage.addToBudget}</button>
                )}
              </div>
            </div>

            {/* 3. INTEGRATED FINANCIAL SUMMARY */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'stretch' }}>
                {/* Metric 1: Line Items */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 5, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.bOQLineItems}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                    {financialSummary.totalLines} <span style={{ fontSize: 11, fontWeight: 500, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.lines}</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                    {financialSummary.validQuantityLines}{UI_STRINGS.appAppBoqStudioPage.withQty}{financialSummary.missingQuantityLines > 0 ? (
                      <span style={{ color: '#b45309', fontWeight: 600 }}>{financialSummary.missingQuantityLines}{UI_STRINGS.appAppBoqStudioPage.missing}</span>
                    ) : (
                      <span style={{ color: '#059669', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.allComplete}</span>
                    )}
                  </div>
                </div>

                {/* Metric 2: AI Estimated Value (Benchmark) */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 5, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{UI_STRINGS.appAppBoqStudioPage.aIEstimatedValue}</span>
                    <span style={{ fontSize: 9, background: '#eff6ff', color: '#1e40af', padding: '1px 4px', borderRadius: 3, fontWeight: 600 }}>{UI_STRINGS.common.benchmark}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: financialSummary.hasAiEstimates ? '#047857' : '#94a3b8', marginTop: 2 }}>
                    {financialSummary.hasAiEstimates ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": financialSummary.totalAiEstimate.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{UI_STRINGS.appAppBoqStudioPage.indicativeBenchmarkNotApprovedBudget}</div>
                </div>

                {/* Metric 3: Cost per Sqft */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 5, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.costPerSqft}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: financialSummary.costPerSqFt !== null ? '#1e40af' : '#94a3b8', marginTop: 2 }}>
                    {financialSummary.costPerSqFt !== null ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": financialSummary.costPerSqFt.toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {financialSummary.areaSqFt ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.toLocaleStringSqftArea, { "toLocaleString": financialSummary.areaSqFt.toLocaleString() }) : UI_STRINGS.appAppBoqStudioPage.areaRequired}
                  </div>
                </div>

                {/* Metric 4: Data Readiness */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 5, padding: '8px 12px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.dataReadiness}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: financialSummary.missingQuantityLines === 0 && financialSummary.validationErrorLines === 0 ? '#059669' : '#b45309', marginTop: 2 }}>
                    {financialSummary.missingQuantityLines === 0 && financialSummary.validationErrorLines === 0
                      ? UI_STRINGS.appAppBoqStudioPage.readyToSubmit
                      : interpolateUiString(UI_STRINGS.appAppBoqStudioPage.value1ItemsAttention, { "value1": financialSummary.missingQuantityLines + financialSummary.validationErrorLines })}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                    {financialSummary.missingRateLines > 0 ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.missingRateLinesUnrated, { "missingRateLines": financialSummary.missingRateLines }) : ''}
                    {financialSummary.validationErrorLines > 0 ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.validationErrorLinesValidationIssues, { "validationErrorLines": financialSummary.validationErrorLines }) : UI_STRINGS.appAppBoqStudioPage.validationClean}
                  </div>
                </div>
              </div>

              {/* Category Breakdown Toggle */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => setShowCategoryBreakdown(prev => !prev)}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0 }}
                >
                  {showCategoryBreakdown ? UI_STRINGS.appAppBoqStudioPage.hideCategoryDistribution : UI_STRINGS.appAppBoqStudioPage.showCategoryDistribution}
                  {showCategoryBreakdown ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
              </div>

              {/* Collapsible Category Breakdown Strip */}
              {showCategoryBreakdown && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                  {BOQ_FINANCIAL_CATEGORY_KEYS.map(cat => (
                    <div key={cat} style={{ background: '#ffffff', padding: '6px 10px', borderRadius: 4, border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{cat}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
                        {financialSummary.categoryTotals[cat] > 0 ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": financialSummary.categoryTotals[cat].toLocaleString(I18N_CONFIG.defaultLocale) }) : UI_STRINGS.common.copy4s9bsz}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. QUANTITY REQUIRED ALERT (if any) */}
            {pendingQuantityCount > 0 && (
              <div
                style={{
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#92400e' }}>
                  <AlertTriangle size={15} color="#d97706" />
                  <span>
                    {interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityWarningCountBeforeAddingBudgetOrSubmit, { count: pendingQuantityCount, plural: pendingQuantityCount === 1 ? '' : 's' })}</span>
                </div>
                {!isEditingBoq && (
                  <button
                    type="button"
                    onClick={handleToggleEditMode}
                    style={{ background: '#ffffff', border: '1px solid #f59e0b', color: '#b45309', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >{UI_STRINGS.appAppBoqStudioPage.editQuantities}</button>
                )}
              </div>
            )}

            {/* 5. IMPORT RESULT BANNER (if any) */}
            {importResult && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#15803d' }}>
                  <span>{UI_STRINGS.appAppBoqStudioPage.copy1h4s0va}<strong>{importResult.totalImported}</strong>{UI_STRINGS.appAppBoqStudioPage.imported}</span>
                  <span>{UI_STRINGS.common.copyaw0l2d}</span>
                  <span>{UI_STRINGS.appAppBoqStudioPage.copy1h4s0va}<strong>{importResult.quantitiesValid}</strong>{UI_STRINGS.appAppBoqStudioPage.qtyValid}</span>
                  {importResult.warningsCount > 0 && (
                    <>
                      <span>{UI_STRINGS.common.copyaw0l2d}</span>
                      <span style={{ color: '#b45309', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.copy1xly971}{importResult.warningsCount}{UI_STRINGS.appAppBoqStudioPage.warnings}</span>
                    </>
                  )}
                </div>
                {importResult.warningsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowWarningModal(true)}
                    style={{ background: '#ffffff', border: '1px solid #fde68a', color: '#b45309', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >{UI_STRINGS.appAppBoqStudioPage.reviewWarnings}</button>
                )}
              </div>
            )}

            {/* 6. IN-PLACE EDIT MODE BAR (When Edit Mode active) */}
            {isEditingBoq && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #93c5fd',
                  borderRadius: 6,
                  padding: '8px 12px',
                  marginBottom: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af' }}>{UI_STRINGS.appAppBoqStudioPage.inPlaceEditModeActiveModifyQuantitiesDescriptionsOrRatesDirectlyInTheTable}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setAddLineModalOpen(true)}
                    style={{ background: '#ffffff', fontWeight: 600, fontSize: 11, padding: '4px 8px' }}
                  >
                    <Plus size={12} style={{ marginRight: 4 }} />{UI_STRINGS.appAppBoqStudioPage.addLine}</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={savingEditChanges}
                    onClick={handleSaveEditableChanges}
                    style={{ fontWeight: 700, fontSize: 11, padding: '4px 10px' }}
                  >
                    {savingEditChanges ? UI_STRINGS.common.saving : UI_STRINGS.common.saveChanges}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => {
                      setEditableLines([]);
                      setIsEditingBoq(false);
                    }}
                    style={{ background: '#ffffff', fontSize: 11, padding: '4px 8px' }}
                  >{UI_STRINGS.common.cancel}</button>
                </div>
              </div>
            )}

            {/* 7. BOQ LINE ITEMS TABLE */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0 }}>{UI_STRINGS.appAppBoqStudioPage.bOQLINEITEMS}{lineTotal}{UI_STRINGS.common.copyc7zu6c}</h4>
                  {pendingQuantityCount > 0 && (
                    <span style={{ fontSize: 11, background: '#fef3c7', color: '#b45309', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityWarningCountBadge, { count: pendingQuantityCount })}</span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder={UI_STRINGS.appAppBoqStudioPage.searchLineItems}
                      value={linesSearch}
                      onChange={e => handleLinesSearchChange(e.target.value)}
                      disabled={isEditingBoq}
                      className="input-field"
                      style={{ height: 28, fontSize: 12, width: 200, paddingLeft: 26 }}
                    />
                  </div>
                  {!isEditingBoq && (
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setAddLineModalOpen(true)}
                      style={{ fontSize: 11, padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: 4, height: 28 }}
                    >
                      <Plus size={12} />{UI_STRINGS.appAppBoqStudioPage.addLine}</button>
                  )}
                </div>
              </div>

              <div className="table-container" style={{ overflowX: 'auto', width: '100%', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table className="table enterprise-table" style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', height: 38, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <th style={{ padding: '0 8px', width: 45 }}>{UI_STRINGS.common.sNo2}</th>
                      <th style={{ padding: '0 10px', minWidth: 160 }}>{UI_STRINGS.appAppBoqStudioPage.originalDescription}</th>
                      <th style={{ padding: '0 10px', minWidth: 180 }}>{UI_STRINGS.common.itemDescription}</th>
                      <th style={{ padding: '0 10px', minWidth: 180 }}>{UI_STRINGS.common.bOQDescription}</th>
                      <th style={{ padding: '0 8px', width: 70 }}>{UI_STRINGS.common.uOM}</th>
                      <th style={{ padding: '0 8px', width: 90, textAlign: 'right' }}>{UI_STRINGS.common.quantity}</th>
                      <th style={{ padding: '0 8px', width: 90 }}>{UI_STRINGS.common.location}</th>
                      <th style={{ padding: '0 8px', width: 90 }}>{UI_STRINGS.common.brand}</th>
                      <th style={{ padding: '0 8px', width: 95, textAlign: 'right' }}>{UI_STRINGS.appAppBoqStudioPage.aIUnitCost}</th>
                      <th style={{ padding: '0 8px', width: 105, textAlign: 'right' }}>{UI_STRINGS.appAppBoqStudioPage.aITotal}</th>
                      <th style={{ padding: '0 8px', width: 130, textAlign: 'center' }}>{UI_STRINGS.common.status}</th>
                      {!isEditingBoq && <th style={{ padding: '0 8px', width: 90, textAlign: 'center' }}>{UI_STRINGS.common.actions}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLines.map((l, idx) => {
                      const hasAiSuggestion = l.aiSuggestedDescription && l.aiSuggestedDescription !== l.standardDescription;
                      const unitCost = l.aiUnitCost || 0;
                      const totalCost = (l.quantity !== null && l.quantity !== undefined && l.quantity > 0)
                        ? (l.aiTotalCost !== null && l.aiTotalCost !== undefined ? l.aiTotalCost : (unitCost ? unitCost * l.quantity : null))
                        : null;

                      if (isEditingBoq) {
                        return (
                          <tr key={l.id || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>{l.lineNumber || idx + 1}</td>
                            <td style={{ padding: '6px 10px', color: '#64748b' }}>
                              {l.originalDescription}
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <input
                                type="text"
                                className="input-field"
                                value={l.standardDescription || l.originalDescription || ''}
                                onChange={e => handleUpdateEditableLineField(idx, 'standardDescription', e.target.value)}
                                style={{ width: '100%', height: 28, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '6px 10px' }}>
                              <input
                                type="text"
                                className="input-field"
                                value={l.specification || ''}
                                onChange={e => handleUpdateEditableLineField(idx, 'specification', e.target.value)}
                                style={{ width: '100%', height: 28, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                className="input-field"
                                value={l.uomRaw || l.uom?.code || 'NOS'}
                                onChange={e => handleUpdateEditableLineField(idx, 'uomRaw', e.target.value)}
                                style={{ width: '100%', height: 28, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="number"
                                className="input-field"
                                placeholder={UI_STRINGS.appAppBoqStudioPage.enterQty}
                                value={l.quantity === null || l.quantity === undefined ? '' : l.quantity}
                                onChange={e => {
                                  const val = e.target.value.trim();
                                  handleUpdateEditableLineField(idx, 'quantity', val === '' ? null : parseFloat(val));
                                }}
                                style={{ width: '100%', height: 28, fontSize: 12, textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                className="input-field"
                                value={l.location || ''}
                                onChange={e => handleUpdateEditableLineField(idx, 'location', e.target.value)}
                                style={{ width: '100%', height: 28, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="text"
                                className="input-field"
                                value={l.brand || ''}
                                onChange={e => handleUpdateEditableLineField(idx, 'brand', e.target.value)}
                                style={{ width: '100%', height: 28, fontSize: 12 }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                type="number"
                                className="input-field"
                                value={l.aiUnitCost || ''}
                                onChange={e => handleUpdateEditableLineField(idx, 'aiUnitCost', parseFloat(e.target.value) || 0)}
                                style={{ width: '100%', height: 28, fontSize: 12, textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: (l.quantity && l.quantity > 0) ? '#047857' : '#94a3b8' }}>
                              {l.quantity && l.quantity > 0 && l.aiUnitCost ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": (l.aiUnitCost * l.quantity).toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              {l.quantity === null || l.quantity === undefined ? (
                                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.appAppBoqStudioPage.qUANTITYREQUIRED}</span>
                              ) : (
                                <span style={{ background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.appAppBoqStudioPage.vALID}</span>
                              )}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <Fragment key={l.id || idx}>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 8px', fontWeight: 600 }}>{l.lineNumber || idx + 1}</td>
                          <td style={{ padding: '8px 10px', color: '#334155', fontWeight: 600 }}>
                            {l.originalDescription}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>
                              {l.standardDescription || l.originalDescription}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                              {l.category?.name || l.category ? (
                                <span style={{ fontSize: 10, color: '#475569', background: '#f1f5f9', padding: '1px 5px', borderRadius: 3, fontWeight: 500 }}>
                                  {l.category?.name || l.category}
                                </span>
                              ) : (
                                <span style={{ fontSize: 10, color: '#b91c1c', background: '#fef2f2', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.categoryMappingRequired}</span>
                              )}
                            </div>
                            {/* AI REFINE INLINE ACTIONS (Section 10) */}
                            {hasAiSuggestion && (
                              <div style={{ marginTop: 4, padding: 6, background: '#eff6ff', borderRadius: 4, border: '1px dashed #93c5fd' }}>
                                <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 600, marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.aISuggested}{l.aiSuggestedDescription}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button
                                    type="button"
                                    onClick={() => handleAcceptAiSuggestion(l)}
                                    style={{ fontSize: 10, padding: '2px 8px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 700 }}
                                  >{UI_STRINGS.appAppBoqStudioPage.aCCEPT}</button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingLineModal({ ...l })}
                                    style={{ fontSize: 10, padding: '2px 8px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}
                                  >{UI_STRINGS.appAppBoqStudioPage.eDIT}</button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectAiSuggestion(l)}
                                    style={{ fontSize: 10, padding: '2px 8px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600 }}
                                  >{UI_STRINGS.appAppBoqStudioPage.rEJECT}</button>
                                </div>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <SpecificationCell
                                specification={l.specification || 'Commercial grade'}
                                lineNumber={l.lineNumber || idx + 1}
                                itemDescription={l.standardDescription || l.originalDescription}
                                lineId={l.id}
                                maxWidth={220}
                              />
                              {!isEditingBoq && l.id && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestRefineLine(l)}
                                  disabled={refiningLineId === l.id}
                                  className="btn btn-outline"
                                  title={UI_STRINGS.appAppBoqStudioPage.aISupportToRefineThisLineSBOQDescription}
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 8px',
                                    height: 22,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    color: '#4f46e5',
                                    borderColor: '#c7d2fe',
                                    background: '#eef2ff',
                                    fontWeight: 600,
                                    width: 'fit-content',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Sparkles size={11} color="#6366f1" />
                                  {refiningLineId === l.id ? UI_STRINGS.appAppBoqStudioPage.refining : UI_STRINGS.appAppBoqStudioPage.aISupportToRefine}
                                </button>
                              )}

                              {/* PROPOSED REFINEMENT BADGE WITH USER-CONFIRMED ACTION */}
                              {proposedRefinements[l.id] && (
                                <div
                                  style={{
                                    marginTop: 6,
                                    padding: 8,
                                    background: '#f0fdf4',
                                    border: '1px solid #86efac',
                                    borderRadius: 6,
                                    boxShadow: '0 2px 6px rgba(22,101,52,0.08)',
                                    minWidth: 220,
                                  }}
                                >
                                  <div style={{ fontSize: 10, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                                    <Sparkles size={11} color="#15803d" />{UI_STRINGS.appAppBoqStudioPage.proposedBOQDescription}</div>
                                  <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 600, marginBottom: 3, lineHeight: 1.3 }}>
                                    {proposedRefinements[l.id].suggestedSpec || proposedRefinements[l.id].suggestedDescription}
                                  </div>
                                  <div style={{ fontSize: 10, color: '#475569', fontStyle: 'italic', marginBottom: 6 }}>
                                    {proposedRefinements[l.id].reason}
                                  </div>
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleApplyProposedDescription(l, proposedRefinements[l.id])}
                                      style={{
                                        fontSize: 10,
                                        padding: '2px 8px',
                                        background: '#16a34a',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: 3,
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                    >{UI_STRINGS.appAppBoqStudioPage.applyDescription}</button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProposedRefinements(prev => {
                                          const next = { ...prev };
                                          delete next[l.id];
                                          return next;
                                        });
                                      }}
                                      style={{
                                        fontSize: 10,
                                        padding: '2px 6px',
                                        background: '#f1f5f9',
                                        color: '#64748b',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 3,
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                      }}
                                    >{UI_STRINGS.appAppBoqStudioPage.discard}</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '8px 8px', fontWeight: 600 }}>
                            {l.uom?.code || l.uomRaw || UI_STRINGS.common.nOS}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700 }}>
                            {l.quantity !== null && l.quantity !== undefined && l.quantity > 0 ? (
                              <span style={{ color: '#0f172a' }}>{Number(l.quantity).toLocaleString()}</span>
                            ) : l.quantity === 0 ? (
                              <span style={{ color: '#d97706', fontSize: 11 }}>{UI_STRINGS.appAppBoqStudioPage.copyf17g6a}</span>
                            ) : (
                              <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>{UI_STRINGS.appAppBoqStudioPage.enterQty}</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 8px', color: '#64748b' }}>
                            {l.location || UI_STRINGS.common.copy4s9bsz}
                          </td>
                          <td style={{ padding: '8px 8px', color: '#64748b' }}>
                            {l.brand || UI_STRINGS.common.copy4s9bsz}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', color: '#047857', fontWeight: 600 }}>
                            {unitCost ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                                <span>{UI_STRINGS.common.copytfdhmk}{unitCost.toLocaleString()}</span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedCostLineId(expandedCostLineId === (l.id || String(idx)) ? null : (l.id || String(idx)))}
                                  title={UI_STRINGS.appAppBoqStudioPage.viewLineItemCostBreakdown}
                                  style={{
                                    background: expandedCostLineId === (l.id || String(idx)) ? '#dcfce7' : '#f1f5f9',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 3,
                                    padding: '1px 4px',
                                    fontSize: 9,
                                    cursor: 'pointer',
                                    color: '#0f172a',
                                    fontWeight: 600,
                                  }}
                                >
                                  {expandedCostLineId === (l.id || String(idx)) ? UI_STRINGS.appAppBoqStudioPage.copy1eu23bp : UI_STRINGS.appAppBoqStudioPage.breakdown}
                                </button>
                              </div>
                            ) : UI_STRINGS.common.copy4s9bsz}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: (l.quantity && l.quantity > 0 && totalCost) ? '#047857' : '#94a3b8' }}>
                            {(l.quantity && l.quantity > 0 && totalCost) ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": totalCost.toLocaleString() }) : UI_STRINGS.common.copy4s9bsz}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            {l.quantity === null || l.quantity === undefined ? (
                              <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.appAppBoqStudioPage.qUANTITYREQUIRED}</span>
                            ) : (l.aiTotalCost !== null && l.aiTotalCost !== undefined) || (l.validationStatus === 'COST GENERATED') ? (
                              <span style={{ background: '#ecfdf5', color: '#047857', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.appAppBoqStudioPage.cOSTGENERATED}</span>
                            ) : (!l.specification || l.specification.trim() === '') ? (
                              <span style={{ background: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>{UI_STRINGS.appAppBoqStudioPage.sPECIFICATIONREQUIRED}</span>
                            ) : (
                              <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontSize: 10 }}>
                                {l.validationStatus || UI_STRINGS.appAppBoqStudioPage.vALID}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                              {l.id && (
                                <a
                                  href={`/boq/line/${l.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={UI_STRINGS.appAppBoqStudioPage.openDetailsDedicatedLineItemView}
                                  style={{ color: '#0284c7', display: 'inline-flex', alignItems: 'center', padding: 2 }}
                                >
                                  <ExternalLink size={13} />
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingLineModal({ ...l })}
                                title={UI_STRINGS.common.editLine}
                                style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 2 }}
                              >
                                <PenTool size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteLine(l.id)}
                                title={UI_STRINGS.appAppBoqStudioPage.deleteLine}
                                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: 2 }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedCostLineId === (l.id || String(idx)) && (() => {
                          const bd = l.costBreakdown || computeLineCostBreakdown(l);
                          return (
                            <tr key={`bd-${l.id || idx}`} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <td colSpan={isEditingBoq ? 11 : 12} style={{ padding: '10px 14px' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 6, padding: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.item2}{l.lineNumber || idx + 1}{UI_STRINGS.appAppBoqStudioPage.aICostBreakdown}{l.standardDescription || l.originalDescription}
                                      </span>
                                      <span style={{ fontSize: 10, background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 4, fontWeight: 700, border: '1px solid #bfdbfe' }}>{UI_STRINGS.appAppBoqStudioPage.eSTIMATEBENCHMARK}</span>
                                    </div>
                                    <span style={{ fontSize: 10, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.reconciledPer}{l.uom?.code || l.uomRaw || UI_STRINGS.common.unit}{UI_STRINGS.appAppBoqStudioPage.directBase10ContractorMargin}</span>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, marginBottom: 8 }}>
                                    <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.materialCost}{bd.materialPercent}{UI_STRINGS.common.copy1y4e1t7}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{UI_STRINGS.common.copytfdhmk}{bd.materialCost.toFixed(2)}</div>
                                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{UI_STRINGS.appAppBoqStudioPage.per}{l.uom?.code || l.uomRaw || UI_STRINGS.common.unit}</div>
                                    </div>
                                    <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.labourCost}{bd.labourPercent}{UI_STRINGS.common.copy1y4e1t7}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{UI_STRINGS.common.copytfdhmk}{bd.labourCost.toFixed(2)}</div>
                                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{UI_STRINGS.appAppBoqStudioPage.per}{l.uom?.code || l.uomRaw || UI_STRINGS.common.unit}</div>
                                    </div>
                                    <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.otherCharges}{bd.otherChargesPercent}{UI_STRINGS.common.copy1y4e1t7}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{UI_STRINGS.common.copytfdhmk}{bd.otherCharges.toFixed(2)}</div>
                                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{UI_STRINGS.appAppBoqStudioPage.equipLogisticsWaste}</div>
                                    </div>
                                    <div style={{ padding: '6px 8px', background: '#f8fafc', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                      <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.contractorMargin}{bd.contractorMarginPercent}{UI_STRINGS.common.copy1y4e1t7}</div>
                                      <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{UI_STRINGS.common.copytfdhmk}{bd.contractorMargin.toFixed(2)}</div>
                                      <div style={{ fontSize: 9, color: '#94a3b8' }}>{UI_STRINGS.appAppBoqStudioPage.copykoqioy}</div>
                                    </div>
                                    <div style={{ padding: '6px 8px', background: '#ecfdf5', borderRadius: 4, border: '1px solid #a7f3d0' }}>
                                      <div style={{ fontSize: 10, color: '#047857', fontWeight: 700 }}>{UI_STRINGS.common.totalAIUnitCost}</div>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: '#047857', marginTop: 2 }}>{UI_STRINGS.common.copytfdhmk}{bd.aiUnitCost.toFixed(2)}</div>
                                      <div style={{ fontSize: 9, color: '#059669' }}>{UI_STRINGS.appAppBoqStudioPage.sumReconciled}</div>
                                    </div>
                                    <div style={{ padding: '6px 8px', background: bd.aiLineTotal ? '#eff6ff' : '#fffbeb', borderRadius: 4, border: `1px solid ${bd.aiLineTotal ? '#bfdbfe' : '#fde68a'}` }}>
                                      <div style={{ fontSize: 10, color: bd.aiLineTotal ? '#1e40af' : '#b45309', fontWeight: 700 }}>{UI_STRINGS.common.aILineTotal}</div>
                                      <div style={{ fontSize: 12, fontWeight: 800, color: bd.aiLineTotal ? '#1e40af' : '#b45309', marginTop: 2 }}>
                                        {bd.aiLineTotal ? interpolateUiString(UI_STRINGS.common.toLocaleString, { "toLocaleString": bd.aiLineTotal.toLocaleString(I18N_CONFIG.defaultLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }) : UI_STRINGS.common.copy4s9bsz}
                                      </div>
                                      <div style={{ fontSize: 9, color: '#64748b' }}>
                                        {l.quantity && l.quantity > 0 ? interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityValue2, { "quantity": l.quantity, "value2": l.uom?.code || l.uomRaw || UI_STRINGS.common.unit }) : UI_STRINGS.appAppBoqStudioPage.quantityRequired}
                                      </div>
                                    </div>
                                  </div>

                                  <div style={{ fontSize: 11, color: '#64748b', background: '#f8fafc', padding: '5px 8px', borderRadius: 4, border: '1px solid #e2e8f0' }}>
                                    <strong>{UI_STRINGS.appAppBoqStudioPage.engineeringBasisAssumptions}</strong> {bd.engineeringBasis}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        })()}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {lineTotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handlePreviousLinesPage}
                    disabled={linePageIndex <= 1 || loadingLines || isEditingBoq}
                    style={{ fontSize: 11, padding: '4px 9px' }}
                  >
                    {UI_STRINGS.common.previousPage}
                  </button>
                  <span style={{ fontSize: 11, color: '#64748b' }}>
                    {interpolateUiString(UI_STRINGS.common.pageValue1OfValue2, {
                      value1: linePageIndex,
                      value2: Math.max(1, Math.ceil(lineTotal / BOQ_LINE_DETAIL_PAGE_SIZE)),
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={handleNextLinesPage}
                    disabled={!lineNextCursor || loadingLines || isEditingBoq}
                    style={{ fontSize: 11, padding: '4px 9px' }}
                  >
                    {UI_STRINGS.common.nextPage}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          BOTTOM SECTION: MY PROJECT BOQS (Section 21)
      ========================================================================= */}
      <div className="card" style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #e2e8f0', padding: 24, marginTop: 40 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0' }}>{UI_STRINGS.appAppBoqStudioPage.eXISTINGPROJECTBOQS}</h3>
            <span style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.clickOpenOnAnyBOQToLoadItImmediatelyIntoTheBOQWorkspaceAbove}</span>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              placeholder={UI_STRINGS.appAppBoqStudioPage.filterByCodeTitleCategory}
              value={filterSearch}
              onChange={e => setFilterSearch(e.target.value)}
              className="input-field"
              style={{ height: 34, fontSize: 12, width: 220 }}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={loadAllBoqs}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <RefreshCw size={13} />{UI_STRINGS.common.refresh}</button>
          </div>
        </div>

        {loadingBoqs ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.loadingBOQs}</div>
        ) : filteredExistingBoqs.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.noBOQsFound}</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', height: 38, borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                    <th style={{ padding: '0 12px', width: 140 }}>{UI_STRINGS.appAppBoqStudioPage.bOQNo}</th>
                    <th style={{ padding: '0 12px' }}>{UI_STRINGS.appAppBoqStudioPage.bOQTitle}</th>
                    <th style={{ padding: '0 12px', width: 140 }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ padding: '0 12px', width: 110 }}>{UI_STRINGS.common.status}</th>
                    <th style={{ padding: '0 12px', textAlign: 'right', width: 100 }}>{UI_STRINGS.common.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExistingBoqs.slice(0, 3).map(b => (
                    <tr
                      key={b.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        height: 44,
                        background: activeBoq?.id === b.id ? '#eff6ff' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0 12px', fontWeight: 800, color: '#1e40af' }}>
                        {b.boqCode}
                      </td>
                      <td style={{ padding: '0 12px', fontWeight: 600, color: '#0f172a' }}>
                        <div>{b.title || b.boqCode}</div>
                        {b.description && (
                          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginTop: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.description}>
                            {b.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0 12px', color: '#64748b' }}>
                        {b.category || UI_STRINGS.common.standard}
                      </td>
                      <td style={{ padding: '0 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 10,
                            fontWeight: 700,
                            background: b.status === 'APPROVED' ? '#ecfdf5' : '#f1f5f9',
                            color: b.status === 'APPROVED' ? '#047857' : '#334155',
                          }}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td style={{ padding: '0 12px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => {
                            loadBoqDetails(b.id);
                            workspaceRef.current?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          style={{
                            padding: '4px 12px',
                            fontSize: 11,
                            fontWeight: 700,
                            background: activeBoq?.id === b.id ? '#2563eb' : '#ffffff',
                            color: activeBoq?.id === b.id ? '#ffffff' : '#1e40af',
                            borderColor: '#2563eb',
                          }}
                        >{UI_STRINGS.appAppBoqStudioPage.oPEN}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredExistingBoqs.length > 3 && (
              <div
                style={{
                  marginTop: 14,
                  padding: '10px 14px',
                  background: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>{UI_STRINGS.appAppBoqStudioPage.showing3RecentBOQs}</span>
                <button
                  type="button"
                  onClick={() => router.push('/boq')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >{UI_STRINGS.appAppBoqStudioPage.viewAll}{filteredExistingBoqs.length}{UI_STRINGS.common.copydv17a2}</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* =========================================================================
          MODALS: ADD TO BUDGET & CREATE PR
      ========================================================================= */}
      {/* CONFIRMATION MODAL: ADD TO BUDGET (Section 13) */}
      {budgetModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 520, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Landmark size={22} color="#059669" />
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#065f46' }}>{UI_STRINGS.appAppBoqStudioPage.confirmBudgetContribution}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{UI_STRINGS.appAppBoqStudioPage.addThisBOQToTheProjectBudgetBaselineAllParametersInheritAutomaticallyFromTheActiveBOQRecord}</p>
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, fontSize: 13, marginBottom: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.bOQ2}</span>
                <strong>{activeBoq?.boqCode}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.project2}</span>
                <strong>{activeProjectObj?.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.costCentre3}</span>
                <strong>{activeCostCentreObj?.code}{UI_STRINGS.common.copyq9aflv}{activeCostCentreObj?.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.category3}</span>
                <strong>{activeBoq?.category || UI_STRINGS.common.standard}</strong>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#334155', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.bOQEstimatedValue}</span>
                <strong style={{ color: '#047857', fontSize: 15 }}>{UI_STRINGS.common.copytfdhmk}{totalRevValue.toLocaleString(I18N_CONFIG.defaultLocale)}</strong>
              </div>
              {pendingQuantityCount > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#92400e', fontWeight: 600 }}>{interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityWarningCountBeforeBudget, { count: pendingQuantityCount, plural: pendingQuantityCount === 1 ? '' : 's' })}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={() => setBudgetModalOpen(false)}>{UI_STRINGS.appAppBoqStudioPage.cANCEL}</button>
              {pendingQuantityCount > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setBudgetModalOpen(false);
                    handleToggleEditMode();
                  }}
                  style={{ background: '#ffffff', borderColor: '#f59e0b', color: '#b45309', fontWeight: 700 }}
                >{UI_STRINGS.appAppBoqStudioPage.eDITBOQ}</button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAddToBudget}
                  disabled={addingToBudget}
                  style={{ background: '#059669', borderColor: '#059669', fontWeight: 700 }}
                >
                  {addingToBudget ? UI_STRINGS.appAppBoqStudioPage.adding : UI_STRINGS.appAppBoqStudioPage.aDDTOBUDGET}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL: BOQ SUBMISSION (Requirement 3) */}
      {prModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 520, padding: 24, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Send size={22} color="#2563eb" />
              <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#1e40af' }}>{UI_STRINGS.appAppBoqStudioPage.confirmBOQSubmission}</h3>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{UI_STRINGS.appAppBoqStudioPage.submitThisCommercialBOQForProjectApproverReviewAndSubsequentReleaseToCategoryManager}</p>
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 6, fontSize: 13, marginBottom: 20, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.bOQ2}</span>
                <strong>{activeBoq?.boqCode}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.project2}</span>
                <strong>{activeProjectObj?.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.costCentre3}</span>
                <strong>{activeCostCentreObj?.code}{UI_STRINGS.common.copyq9aflv}{activeCostCentreObj?.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.common.category3}</span>
                <strong>{activeBoq?.category || UI_STRINGS.common.standard}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.bOQLines}</span>
                <strong>{lines.length}{UI_STRINGS.common.lines2}</strong>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#334155', fontWeight: 600 }}>{UI_STRINGS.appAppBoqStudioPage.estimatedCost}</span>
                <strong style={{ color: '#1e40af', fontSize: 15 }}>{UI_STRINGS.common.copytfdhmk}{totalRevValue.toLocaleString(I18N_CONFIG.defaultLocale)}</strong>
              </div>
              {pendingQuantityCount > 0 && (
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: '#92400e', fontWeight: 600 }}>{interpolateUiString(UI_STRINGS.appAppBoqStudioPage.quantityRequiredForItemsBeforeBOQSubmission, { count: pendingQuantityCount, plural: pendingQuantityCount === 1 ? '' : 's' })}</div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-outline" onClick={() => setPrModalOpen(false)}>{UI_STRINGS.appAppBoqStudioPage.cANCEL}</button>
              {pendingQuantityCount > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => {
                    setPrModalOpen(false);
                    handleToggleEditMode();
                  }}
                  style={{ background: '#ffffff', borderColor: '#f59e0b', color: '#b45309', fontWeight: 700 }}
                >{UI_STRINGS.appAppBoqStudioPage.eDITBOQ}</button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreatePR}
                  disabled={creatingPr}
                  style={{ fontWeight: 700 }}
                >
                  {creatingPr ? UI_STRINGS.appAppBoqStudioPage.submittingBOQ : UI_STRINGS.appAppBoqStudioPage.sUBMITBOQ}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SINGLE LINE EDIT MODAL */}
      {editingLineModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 560, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.editLineItem}{editingLineModal.lineNumber}{UI_STRINGS.common.copyc7zu6c}</h3>
              <button type="button" onClick={() => setEditingLineModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>{UI_STRINGS.common.copy4i33ao}</button>
            </div>
            <form onSubmit={handleSaveSingleLineEdit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.standardDescription}</label>
                <input
                  type="text"
                  className="input-field"
                  required
                  value={editingLineModal.standardDescription || editingLineModal.originalDescription || ''}
                  onChange={e => setEditingLineModal({ ...editingLineModal, standardDescription: e.target.value })}
                  style={{ width: '100%', height: 36 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.bOQDescription}</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={editingLineModal.specification || ''}
                  onChange={e => setEditingLineModal({ ...editingLineModal, specification: e.target.value })}
                  style={{ width: '100%', padding: 8, fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.quantity}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    className="input-field"
                    placeholder={UI_STRINGS.appAppBoqStudioPage.enterQty}
                    value={editingLineModal.quantity !== null && editingLineModal.quantity !== undefined ? editingLineModal.quantity : ''}
                    onChange={e => {
                      const v = e.target.value.trim();
                      setEditingLineModal({ ...editingLineModal, quantity: v === '' ? null : parseFloat(v) });
                    }}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.uOM2}</label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    value={editingLineModal.uomRaw || editingLineModal.uom?.code || 'NOS'}
                    onChange={e => setEditingLineModal({ ...editingLineModal, uomRaw: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.locationArea}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingLineModal.location || ''}
                    onChange={e => setEditingLineModal({ ...editingLineModal, location: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.brandMake}</label>
                  <input
                    type="text"
                    className="input-field"
                    value={editingLineModal.brand || ''}
                    onChange={e => setEditingLineModal({ ...editingLineModal, brand: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.estimatedUnitRate}</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input-field"
                  value={editingLineModal.aiUnitCost || ''}
                  onChange={e => setEditingLineModal({ ...editingLineModal, aiUnitCost: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', height: 36 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditingLineModal(null)}>{UI_STRINGS.appAppBoqStudioPage.cANCEL}</button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }}>{UI_STRINGS.appAppBoqStudioPage.sAVECHANGES}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD LINE MODAL */}
      {addLineModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 560, padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.addNewBOQLine}</h3>
              <button type="button" onClick={() => setAddLineModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>{UI_STRINGS.common.copy4i33ao}</button>
            </div>
            <form onSubmit={handleAddLine}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.description}</label>
                <input
                  type="text"
                  required
                  placeholder={UI_STRINGS.appAppBoqStudioPage.eG25SQMMCopperArmouredCable}
                  className="input-field"
                  value={newLineData.description}
                  onChange={e => setNewLineData({ ...newLineData, description: e.target.value })}
                  style={{ width: '100%', height: 36 }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.bOQDescription}</label>
                <textarea
                  className="input-field"
                  rows={2}
                  placeholder={UI_STRINGS.appAppBoqStudioPage.eG1100VGradeHeavyDutyCopperConductorWithFRLSSheath}
                  value={newLineData.specification}
                  onChange={e => setNewLineData({ ...newLineData, specification: e.target.value })}
                  style={{ width: '100%', padding: 8, fontSize: 12 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.quantity}</label>
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    required
                    className="input-field"
                    value={newLineData.quantity}
                    onChange={e => setNewLineData({ ...newLineData, quantity: parseFloat(e.target.value) || 0 })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.uOM2}</label>
                  <input
                    type="text"
                    required
                    placeholder={UI_STRINGS.appAppBoqStudioPage.mTRSQFTNOSLOT}
                    className="input-field"
                    value={newLineData.uom}
                    onChange={e => setNewLineData({ ...newLineData, uom: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.locationArea}</label>
                  <input
                    type="text"
                    placeholder={UI_STRINGS.appAppBoqStudioPage.eGRetailFloorServerRoom}
                    className="input-field"
                    value={newLineData.location}
                    onChange={e => setNewLineData({ ...newLineData, location: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.common.brandMake}</label>
                  <input
                    type="text"
                    placeholder={UI_STRINGS.appAppBoqStudioPage.eGPolycabHavellsSchneider}
                    className="input-field"
                    value={newLineData.brand}
                    onChange={e => setNewLineData({ ...newLineData, brand: e.target.value })}
                    style={{ width: '100%', height: 36 }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>{UI_STRINGS.appAppBoqStudioPage.estimatedUnitRate}</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="input-field"
                  value={newLineData.aiUnitCost}
                  onChange={e => setNewLineData({ ...newLineData, aiUnitCost: parseFloat(e.target.value) || 0 })}
                  style={{ width: '100%', height: 36 }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setAddLineModalOpen(false)}>{UI_STRINGS.appAppBoqStudioPage.cANCEL}</button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: 700 }}>{UI_STRINGS.appAppBoqStudioPage.aDDLINE}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WARNINGS REVIEW MODAL */}
      {showWarningModal && importResult && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 8, width: 600, padding: 24, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={18} color="#d97706" />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.importWarningsReview}{importResult.issues.length}{UI_STRINGS.common.copyc7zu6c}</h3>
              </div>
              <button type="button" onClick={() => setShowWarningModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>{UI_STRINGS.common.copy4i33ao}</button>
            </div>

            <div style={{ overflowX: 'auto', marginBottom: 16 }}>
              <table className="table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '6px 8px' }}>{UI_STRINGS.common.sNo2}</th>
                    <th style={{ padding: '6px 8px' }}>{UI_STRINGS.common.itemDescription}</th>
                    <th style={{ padding: '6px 8px' }}>{UI_STRINGS.common.warning}</th>
                    <th style={{ padding: '6px 8px' }}>{UI_STRINGS.appAppBoqStudioPage.actionTaken}</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.issues.map((iss, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{iss.rowNumber || i + 1}</td>
                      <td style={{ padding: '6px 8px' }}>{iss.description || iss.itemCode || UI_STRINGS.appAppBoqStudioPage.item}</td>
                      <td style={{ padding: '6px 8px', color: '#b45309' }}>{iss.issue}</td>
                      <td style={{ padding: '6px 8px', color: '#15803d' }}>{iss.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={() => setShowWarningModal(false)}>{UI_STRINGS.appAppBoqStudioPage.closeReview}</button>
            </div>
          </div>
        </div>
      )}

      {/* DRAWING TO BOQ: REVIEW & EDIT EXTRACTED ITEMS MODAL */}
      {drawingReviewModalOpen && extractedDrawingData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: 20 }}>
          <div className="card" style={{ background: '#ffffff', borderRadius: 10, width: '100%', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ImageIcon size={20} color="#2563eb" />
                  <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: '#0f172a' }}>{UI_STRINGS.appAppBoqStudioPage.reviewExtractedBOQItemsDrawing}{extractedDrawingData.drawingNumber || drawingNumber}
                  </h3>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0 0' }}>{UI_STRINGS.appAppBoqStudioPage.source}<strong>{extractedDrawingData.fileName}</strong>{UI_STRINGS.appAppBoqStudioPage.parser}<span style={{ color: '#2563eb', fontWeight: 600 }}>{extractedDrawingData.parserUsed === 'NATIVE_PDF_SCHEDULE' ? UI_STRINGS.appAppBoqStudioPage.nativeArchitecturalScheduleParser : (extractedDrawingData.parserUsed || UI_STRINGS.appAppBoqStudioPage.visionParser)}</span>
                  {extractedDrawingData.providerMessage && interpolateUiString(UI_STRINGS.appAppBoqStudioPage.providerMessage, { "providerMessage": extractedDrawingData.providerMessage })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawingReviewModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* KPI Badges Strip */}
            <div style={{ padding: '10px 20px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.totalItems}</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{reviewLines.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#16a34a' }}>{UI_STRINGS.appAppBoqStudioPage.explicitQuantities}</span>
                <span style={{ fontWeight: 700, color: '#16a34a' }}>
                  {reviewLines.filter(l => l.quantity !== null && l.quantityType === 'EXPLICIT').length}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: reviewLines.some(l => l.quantity === null || l.quantityType === 'UNCERTAIN') ? '#d97706' : '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.uncertainNeedsVerification}</span>
                <span style={{ fontWeight: 700, color: reviewLines.some(l => l.quantity === null || l.quantityType === 'UNCERTAIN') ? '#b45309' : '#64748b' }}>
                  {reviewLines.filter(l => l.quantity === null || l.quantityType === 'UNCERTAIN').length}
                </span>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleAddReviewLine}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#2563eb',
                    cursor: 'pointer',
                  }}
                >
                  <Plus size={13} />{UI_STRINGS.appAppBoqStudioPage.addItem}</button>
              </div>
            </div>

            {/* Warning Alert if uncertain items exist */}
            {reviewLines.some(l => l.quantity === null || l.quantityType === 'UNCERTAIN') && (
              <div style={{ padding: '8px 20px', background: '#fffbeb', borderBottom: '1px solid #fef3c7', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#92400e' }}>
                <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0 }} />
                <span>{UI_STRINGS.appAppBoqStudioPage.itemsHighlightedInAmberHaveUnverifiedOrUncertainQuantitiesInTheDrawingSchedulePleaseEnterOrVerifyNumericQuantitiesBeforeGeneratingTheDraftBOQ}</span>
              </div>
            )}

            {/* Editable Table */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#475569' }}>
                    <th style={{ padding: '8px 6px', width: 40 }}>{UI_STRINGS.common.copyak280i}</th>
                    <th style={{ padding: '8px 6px', width: 90 }}>{UI_STRINGS.appAppBoqStudioPage.markRef}</th>
                    <th style={{ padding: '8px 6px', minWidth: 180 }}>{UI_STRINGS.common.itemDescription2}</th>
                    <th style={{ padding: '8px 6px', minWidth: 200 }}>{UI_STRINGS.common.specification}</th>
                    <th style={{ padding: '8px 6px', width: 140 }}>{UI_STRINGS.common.category2}</th>
                    <th style={{ padding: '8px 6px', width: 120 }}>{UI_STRINGS.common.location}</th>
                    <th style={{ padding: '8px 6px', width: 80 }}>{UI_STRINGS.common.uOM}</th>
                    <th style={{ padding: '8px 6px', width: 100 }}>{UI_STRINGS.appAppBoqStudioPage.quantity}</th>
                    <th style={{ padding: '8px 6px', width: 100 }}>{UI_STRINGS.common.status}</th>
                    <th style={{ padding: '8px 6px', width: 40, textAlign: 'center' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {reviewLines.map((line, idx) => {
                    const isUncertain = line.quantity === null || line.quantityType === 'UNCERTAIN';
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isUncertain ? '#fffdf7' : '#ffffff',
                        }}
                      >
                        <td style={{ padding: '6px', fontWeight: 600, color: '#64748b' }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={line.mark || ''}
                            onChange={e => handleUpdateReviewLine(idx, 'mark', e.target.value)}
                            placeholder={UI_STRINGS.appAppBoqStudioPage.eGD01}
                            style={{ width: '100%', padding: '4px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={line.description || ''}
                            onChange={e => handleUpdateReviewLine(idx, 'description', e.target.value)}
                            placeholder={UI_STRINGS.appAppBoqStudioPage.itemDescription}
                            style={{
                              width: '100%',
                              padding: '4px 6px',
                              fontSize: 11,
                              border: !line.description?.trim() ? '1px solid #ef4444' : '1px solid #cbd5e1',
                              borderRadius: 4,
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={line.specification || ''}
                            onChange={e => handleUpdateReviewLine(idx, 'specification', e.target.value)}
                            placeholder={UI_STRINGS.appAppBoqStudioPage.specificationDetails}
                            style={{ width: '100%', padding: '4px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <select
                            value={line.category || 'Civil & Interior'}
                            onChange={e => handleUpdateReviewLine(idx, 'category', e.target.value)}
                            style={{ width: '100%', padding: '4px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4 }}
                          >
                            {masterCategories.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={line.location || ''}
                            onChange={e => handleUpdateReviewLine(idx, 'location', e.target.value)}
                            placeholder={UI_STRINGS.appAppBoqStudioPage.roomFloor}
                            style={{ width: '100%', padding: '4px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4 }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="text"
                            value={line.uom || 'NOS'}
                            onChange={e => handleUpdateReviewLine(idx, 'uom', e.target.value.toUpperCase())}
                            style={{ width: '100%', padding: '4px 6px', fontSize: 11, border: '1px solid #cbd5e1', borderRadius: 4, textTransform: 'uppercase' }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.quantity !== null && line.quantity !== undefined ? line.quantity : ''}
                            onChange={e => handleUpdateReviewLine(idx, 'quantity', e.target.value)}
                            placeholder={UI_STRINGS.appAppBoqStudioPage.enterQty2}
                            style={{
                              width: '100%',
                              padding: '4px 6px',
                              fontSize: 11,
                              fontWeight: 600,
                              borderRadius: 4,
                              border: isUncertain ? '1.5px solid #f59e0b' : '1px solid #cbd5e1',
                              background: isUncertain ? '#fffbeb' : '#ffffff',
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px' }}>
                          {isUncertain ? (
                            <span
                              title={interpolateUiString(UI_STRINGS.common.value1, { "value1": line.uncertainReason || 'Quantity unverified; field check required' })}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 10,
                                background: '#fef3c7',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                              }}
                            >{UI_STRINGS.appAppBoqStudioPage.uNCERTAIN}</span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 10,
                                background: '#dcfce7',
                                color: '#15803d',
                                border: '1px solid #bbf7d0',
                              }}
                            >{UI_STRINGS.appAppBoqStudioPage.eXPLICIT}</span>
                          )}
                        </td>
                        <td style={{ padding: '6px', textAlign: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleRemoveReviewLine(idx)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                            title={UI_STRINGS.appAppBoqStudioPage.removeLine}
                          >
                            <Trash2 size={14} color="#ef4444" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer with Actions */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>{UI_STRINGS.appAppBoqStudioPage.targetProject}<strong>{projects.find(p => p.id === (setupProject || selectedProjectId))?.name || UI_STRINGS.appAppBoqStudioPage.selectedProject}</strong>{UI_STRINGS.appAppBoqStudioPage.purpose}<strong>{setupPurpose}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setDrawingReviewModalOpen(false)}
                  disabled={generatingDrawingBoq}
                  style={{ fontSize: 12, padding: '7px 14px' }}
                >{UI_STRINGS.appAppBoqStudioPage.cancelReUpload}</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleGenerateDrawingBoq}
                  disabled={generatingDrawingBoq || reviewLines.length === 0}
                  style={{
                    fontSize: 12,
                    padding: '7px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: '#2563eb',
                    fontWeight: 700,
                  }}
                >
                  <Send size={14} />
                  {generatingDrawingBoq ? UI_STRINGS.appAppBoqStudioPage.generatingDraftBOQ : interpolateUiString(UI_STRINGS.appAppBoqStudioPage.generateDraftBOQLengthItems, { "length": reviewLines.length })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
