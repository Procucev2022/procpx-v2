'use client';
// components/Sidebar.tsx - Premium Enterprise Sidebar with Lucide Icons
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasPermission, UserRole } from '@/lib/permissions';
import {
  LayoutDashboard,
  ClipboardCheck,
  FileText,
  Building2,
  Receipt,
  GitCompare,
  MessageSquare,
  Gavel,
  Award,
  FileCheck,
  ShieldCheck,
  FolderKanban,
  FileSpreadsheet,
  Users,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Layers,
  Landmark,
  PieChart,
  BookOpen,
  Send,
  CheckSquare,
  Sparkles,
  History,
  Coins,
  Scale,
  Tag,
} from 'lucide-react';

interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: string; tenantName: string };
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const role = user.role as UserRole;
  const isProcurementUser = role === 'PROCUREMENT_USER';
  const isProjectUser = role === 'PROJECT_USER';
  const isProjectApprover = role === 'PROJECT_APPROVER';
  const isFinanceUser = role === 'FINANCE_USER' || (role as string) === 'FINANCE_APPROVER';
  const isCategoryManager = role === 'CATEGORY_MANAGER';
  const isVendor = role === 'VENDOR';

  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') {
      setCollapsed(true);
      document.querySelector('.app-main')?.classList.add('sidebar-collapsed');
    }
  }, []);

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
    const mainEl = document.querySelector('.app-main');
    if (next) {
      mainEl?.classList.add('sidebar-collapsed');
    } else {
      mainEl?.classList.remove('sidebar-collapsed');
    }
  };

  const navItem = (href: string, label: string, Icon: any, activeMatch?: boolean) => {
    const isActive = activeMatch !== undefined ? activeMatch : pathname === href;

    return (
      <Link
        href={href}
        className={`nav-item ${isActive ? 'active' : ''}`}
        title={collapsed ? label : undefined}
      >
        <span className="nav-icon">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        {!collapsed && <span className="nav-label">{label}</span>}
      </Link>
    );
  };

  return (
    <aside className={`app-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <nav className="sidebar-nav">
        {/* ROLE 1: PROCUREMENT USER NAVIGATION */}
        {isProcurementUser && (
          <>
            {!collapsed && <div className="nav-section-label">WORKSPACE</div>}
            {navItem('/dashboard', 'Dashboard', LayoutDashboard)}

            {!collapsed && <div className="nav-section-label">SOURCING QUEUE</div>}
            {navItem('/procurement/approved-prs', 'Approved PRs', Send, pathname.startsWith('/procurement/approved-prs'))}

            {!collapsed && <div className="nav-section-label">SOURCING EXECUTION</div>}
            {navItem('/procurement/rfqs', 'RFQs', FileText, pathname.startsWith('/procurement/rfqs'))}
            {navItem('/procurement/rate-cards', 'Rate Cards', Tag, pathname.startsWith('/procurement/rate-cards'))}
            {navItem('/procurement/vendors', 'Vendors', Building2, pathname.startsWith('/procurement/vendors'))}

            {!collapsed && <div className="nav-section-label">NEGOTIATION & AWARDS</div>}
            {navItem('/procurement/negotiations', 'Negotiations', MessageSquare, pathname.startsWith('/procurement/negotiations'))}
            {navItem('/procurement/auctions', 'Auctions', Gavel, pathname.startsWith('/procurement/auctions'))}
            {navItem('/procurement/awards', 'Awards', Award, pathname.startsWith('/procurement/awards'))}
            {navItem('/procurement/ppos', 'PPOs & Orders', FileCheck, pathname.startsWith('/procurement/ppos'))}

            {!collapsed && <div className="nav-section-label">GOVERNANCE</div>}
            {navItem('/audit', 'Audit Trail', ShieldCheck, pathname.startsWith('/audit'))}
          </>
        )}

        {/* ROLE 2: PROJECT USER NAVIGATION */}
        {isProjectUser && (
          <>
            {!collapsed && <div className="nav-section-label">WORKSPACE</div>}
            {navItem('/dashboard', 'Dashboard', LayoutDashboard)}

            {!collapsed && <div className="nav-section-label">MASTER CREATION</div>}
            {navItem('/projects', 'Projects', FolderKanban, pathname.startsWith('/projects'))}
            {navItem('/cost-centres', 'Cost Centres', Layers, pathname.startsWith('/cost-centres'))}
            {navItem('/masters/standard-boq', 'Standard BOQ Creation', BookOpen, pathname.startsWith('/masters/standard-boq'))}
            {navItem('/masters/categories', 'Category Creation', Boxes, pathname.startsWith('/masters/categories'))}

            {!collapsed && <div className="nav-section-label">BOQ</div>}
            {navItem('/boq/studio', 'BOQ Studio', Sparkles, pathname.startsWith('/boq/studio'))}

            {!collapsed && <div className="nav-section-label">BUDGET</div>}
            {navItem('/budget', 'Project Budget', Landmark, pathname === '/budget')}
            {navItem('/budget/transactions', 'Budget Transaction Ledger', History, pathname.startsWith('/budget/transactions'))}
            {navItem('/budget/vs-actual', 'Budget vs Actual', Scale, pathname.startsWith('/budget/vs-actual'))}

            {!collapsed && <div className="nav-section-label">VENDOR PERFORMANCE</div>}
            {navItem('/procurement/ppos', 'PPO Performance', Award, pathname.startsWith('/procurement/ppos'))}

            {!collapsed && <div className="nav-section-label">OBSERVER</div>}
            {navItem('/procurement/auctions', 'Observer Auctions', Gavel, pathname.startsWith('/procurement/auctions'))}
          </>
        )}

        {/* ROLE 3: PROJECT APPROVER NAVIGATION */}
        {isProjectApprover && (
          <>
            {!collapsed && <div className="nav-section-label">WORKSPACE</div>}
            {navItem('/dashboard', 'Dashboard', LayoutDashboard)}

            {!collapsed && <div className="nav-section-label">PROJECTS</div>}
            {navItem('/projects', 'Projects', FolderKanban, pathname.startsWith('/projects'))}

            {!collapsed && <div className="nav-section-label">APPROVAL QUEUES</div>}
            {navItem('/approvals/boq-pr', 'BOQ Approvals', CheckSquare, pathname.startsWith('/approvals/boq-pr'))}
            {navItem('/approvals/budget', 'Budget Approvals', Landmark, pathname.startsWith('/approvals/budget'))}
            {navItem('/approvals/rate-cards', 'Rate Card Approvals', Tag, pathname.startsWith('/approvals/rate-cards'))}
            {navItem('/approvals/vendor-ratings', 'Vendor Performance Approvals', Award, pathname.startsWith('/approvals/vendor-ratings'))}

            {!collapsed && <div className="nav-section-label">BUDGET REVIEW</div>}
            {navItem('/budget', 'Project Budget', Landmark, pathname === '/budget')}
            {navItem('/budget/transactions', 'Budget Transaction Ledger', History, pathname.startsWith('/budget/transactions'))}
            {navItem('/budget/vs-actual', 'Budget vs Actual', Scale, pathname.startsWith('/budget/vs-actual'))}

            {!collapsed && <div className="nav-section-label">OBSERVER</div>}
            {navItem('/procurement/auctions', 'Observer Auctions', Gavel, pathname.startsWith('/procurement/auctions'))}

            {!collapsed && <div className="nav-section-label">GOVERNANCE</div>}
            {navItem('/audit', 'Activity & Audit', ShieldCheck, pathname.startsWith('/audit'))}
          </>
        )}

        {/* ROLE 4: FINANCE USER NAVIGATION */}
        {isFinanceUser && (
          <>
            {!collapsed && <div className="nav-section-label">WORKSPACE</div>}
            {navItem('/dashboard', 'Dashboard', LayoutDashboard)}

            {!collapsed && <div className="nav-section-label">BUDGET GOVERNANCE</div>}
            {navItem('/finance/budget-approvals', 'Budget Approvals', CheckSquare, pathname.startsWith('/finance/budget-approvals'))}
            {navItem('/approvals/rate-cards', 'Rate Card Approvals', Tag, pathname.startsWith('/approvals/rate-cards'))}
            {navItem('/budget', 'Project Budget', Landmark, pathname === '/budget')}
            {navItem('/budget/transactions', 'Budget Transaction Ledger', History, pathname.startsWith('/budget/transactions'))}
            {navItem('/budget/vs-actual', 'Budget vs Actual', Scale, pathname.startsWith('/budget/vs-actual'))}

            {!collapsed && <div className="nav-section-label">GOVERNANCE</div>}
            {navItem('/audit', 'Audit Trail', ShieldCheck, pathname.startsWith('/audit'))}
          </>
        )}

        {/* ROLE 5: CATEGORY MANAGER NAVIGATION */}
        {isCategoryManager && (
          <>
            {!collapsed && <div className="nav-section-label">WORKSPACE</div>}
            {navItem('/dashboard', 'Dashboard', LayoutDashboard)}

            {!collapsed && <div className="nav-section-label">MASTER CREATION</div>}
            {navItem('/projects', 'Projects', FolderKanban, pathname.startsWith('/projects'))}
            {navItem('/cost-centres', 'Cost Centres', Layers, pathname.startsWith('/cost-centres'))}
            {navItem('/masters/standard-boq', 'Standard BOQ Creation', BookOpen, pathname.startsWith('/masters/standard-boq'))}
            {navItem('/masters/categories', 'Category Creation', Boxes, pathname.startsWith('/masters/categories'))}

            {!collapsed && <div className="nav-section-label">SOURCING QUEUE</div>}
            {navItem('/procurement/approved-prs', 'Approved PRs', Send, pathname.startsWith('/procurement/approved-prs'))}

            {!collapsed && <div className="nav-section-label">SOURCING EXECUTION</div>}
            {navItem('/procurement/rfqs', 'RFQs', FileText, pathname.startsWith('/procurement/rfqs'))}
            {navItem('/procurement/rate-cards', 'Rate Cards', Tag, pathname.startsWith('/procurement/rate-cards'))}
            {navItem('/procurement/vendors', 'Vendors', Building2, pathname.startsWith('/procurement/vendors'))}

            {!collapsed && <div className="nav-section-label">NEGOTIATION & AWARDS</div>}
            {navItem('/procurement/negotiations', 'Negotiations', MessageSquare, pathname.startsWith('/procurement/negotiations'))}
            {navItem('/procurement/auctions', 'Auctions', Gavel, pathname.startsWith('/procurement/auctions'))}
            {navItem('/procurement/awards', 'Awards', Award, pathname.startsWith('/procurement/awards'))}
            {navItem('/procurement/ppos', 'PPOs & Orders', FileCheck, pathname.startsWith('/procurement/ppos'))}

            {!collapsed && <div className="nav-section-label">GOVERNANCE</div>}
            {navItem('/audit', 'Audit Trail', ShieldCheck, pathname.startsWith('/audit'))}
          </>
        )}

        {/* ROLE 6: ADMIN / SUPER ADMIN / OTHER ROLES */}
        {!isProcurementUser && !isProjectUser && !isProjectApprover && !isFinanceUser && !isCategoryManager && !isVendor && (
          <>
            {!collapsed && <div className="nav-section-label">WORKSPACE</div>}
            {navItem('/dashboard', 'Dashboard', LayoutDashboard)}

            {!collapsed && <div className="nav-section-label">MASTER CREATION</div>}
            {hasPermission(role, 'PROJECT_VIEW') &&
              navItem('/projects', 'Projects', FolderKanban, pathname.startsWith('/projects'))}
            {hasPermission(role, 'COST_CENTRE_VIEW') &&
              navItem('/cost-centres', 'Cost Centres', Layers, pathname.startsWith('/cost-centres'))}
            {hasPermission(role, 'STANDARD_BOQ_VIEW') &&
              navItem('/masters/standard-boq', 'Standard BOQ Creation', BookOpen, pathname.startsWith('/masters/standard-boq'))}
            {hasPermission(role, 'MASTER_VIEW') &&
              navItem('/masters/categories', 'Category Creation', Boxes, pathname.startsWith('/masters/categories'))}

            {!collapsed && <div className="nav-section-label">BOQ</div>}
            {hasPermission(role, 'BOQ_VIEW') &&
              navItem('/boq/studio', 'BOQ Studio', Sparkles, pathname.startsWith('/boq/studio'))}
            {hasPermission(role, 'BOQ_VIEW') &&
              navItem('/boq', 'BOQs', FileSpreadsheet, pathname === '/boq')}

            {!collapsed && <div className="nav-section-label">BUDGET & PR</div>}
            {hasPermission(role, 'BUDGET_VIEW') &&
              navItem('/budget', 'Project Budget', Landmark, pathname.startsWith('/budget'))}
            {hasPermission(role, 'PR_VIEW') &&
              navItem('/pr', 'Procurement Requests', Send, pathname === '/pr' || pathname.startsWith('/pr/'))}
            {hasPermission(role, 'BUDGET_APPROVE') &&
              navItem('/approvals/budget', 'Budget Approvals', CheckSquare, pathname.startsWith('/approvals/budget'))}
            {hasPermission(role, 'PR_APPROVE') &&
              navItem('/approvals/boq-pr', 'BOQ Approvals', CheckSquare, pathname.startsWith('/approvals/boq-pr'))}
            {hasPermission(role, 'RATE_CARD_APPROVE') &&
              navItem('/approvals/rate-cards', 'Rate Card Approvals', Tag, pathname.startsWith('/approvals/rate-cards'))}
            {hasPermission(role, 'VENDOR_RATE_PPO_APPROVE') &&
              navItem('/approvals/vendor-ratings', 'Vendor Performance Approvals', Award, pathname.startsWith('/approvals/vendor-ratings'))}
            {hasPermission(role, 'VENDOR_RATE_PPO') &&
              navItem('/procurement/ppos', 'PPO Performance', Award, pathname.startsWith('/procurement/ppos'))}

            {hasPermission(role, 'RFQ_VIEW') && (
              <>
                {!collapsed && <div className="nav-section-label">SOURCING</div>}
                {navItem('/procurement/approved-prs', 'Approved PRs', Send, pathname.startsWith('/procurement/approved-prs'))}
                {navItem('/procurement/approved-boqs', 'Approved BOQs', ClipboardCheck, pathname.startsWith('/procurement/approved-boqs'))}
                {navItem('/procurement/rfqs', 'RFQs', FileText, pathname.startsWith('/procurement/rfqs'))}
                {hasPermission(role, 'VENDOR_VIEW') &&
                  navItem('/procurement/vendors', 'Vendor Management', Building2, pathname.startsWith('/procurement/vendors'))}
                {hasPermission(role, 'RATE_CARD_VIEW') &&
                  navItem('/procurement/rate-cards', 'Rate Card Management', Tag, pathname.startsWith('/procurement/rate-cards'))}

                {!collapsed && <div className="nav-section-label">COMMERCIAL EVALUATION</div>}
                {hasPermission(role, 'QUOTE_VIEW') &&
                  navItem('/procurement/quotes', 'Quotes', Receipt, pathname.startsWith('/procurement/quotes'))}
                {hasPermission(role, 'NEGOTIATION_VIEW') &&
                  navItem('/procurement/negotiations', 'Negotiations', MessageSquare, pathname.startsWith('/procurement/negotiations'))}
                {hasPermission(role, 'AUCTION_VIEW') &&
                  navItem('/procurement/auctions', 'Auctions', Gavel, pathname.startsWith('/procurement/auctions'))}

                {!collapsed && <div className="nav-section-label">AWARDS & ORDERS</div>}
                {hasPermission(role, 'AWARD_VIEW') &&
                  navItem('/procurement/awards', 'Awards & PPOs', Award, pathname.startsWith('/procurement/awards'))}
              </>
            )}

            {(hasPermission(role, 'USER_VIEW') || hasPermission(role, 'MASTER_VIEW') || hasPermission(role, 'AUDIT_VIEW')) && (
              <>
                {!collapsed && <div className="nav-section-label">GOVERNANCE</div>}
                {hasPermission(role, 'USER_VIEW') &&
                  navItem('/admin/users', 'Users', Users, pathname.startsWith('/admin/users'))}
                {hasPermission(role, 'MASTER_VIEW') &&
                  navItem('/admin/masters', 'Masters', Boxes, pathname.startsWith('/admin/masters'))}
                {hasPermission(role, 'AUDIT_VIEW') &&
                  navItem('/audit', 'Audit Trail', ShieldCheck, pathname.startsWith('/audit'))}
              </>
            )}
          </>
        )}

        {/* ROLE 7: VENDOR NAVIGATION */}
        {isVendor && (
          <>
            {!collapsed && <div className="nav-section-label">VENDOR PORTAL</div>}
            {navItem('/vendor-portal/dashboard', 'Vendor Dashboard', LayoutDashboard, pathname === '/vendor-portal' || pathname === '/vendor-portal/dashboard')}
            {navItem('/vendor-portal/profile', 'Company Profile', Building2, pathname.startsWith('/vendor-portal/profile'))}
            {navItem('/vendor-portal/rfqs', 'My RFQs & Bids', FileText, pathname.startsWith('/vendor-portal/rfqs'))}
            {navItem('/vendor-portal/auctions', 'Auctions & Bidding', Gavel, pathname.startsWith('/vendor-portal/auctions'))}
            {navItem('/vendor-portal/ppos', 'PPOs / Orders', FileCheck, pathname.startsWith('/vendor-portal/ppos'))}
            {navItem('/vendor-portal/rate-cards', 'Rate Cards', Tag, pathname.startsWith('/vendor-portal/rate-cards'))}
          </>
        )}
      </nav>

      {/* Collapse Toggle Footer */}
      <button
        type="button"
        className="sidebar-collapse-btn"
        onClick={toggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight size={18} strokeWidth={2} />
        ) : (
          <>
            <ChevronLeft size={18} strokeWidth={2} />
            <span>Collapse Sidebar</span>
          </>
        )}
      </button>
    </aside>
  );
}
