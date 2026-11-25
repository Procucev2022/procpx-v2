export interface DashboardRegisterRfqLinkItem {
  createRfqUrl?: string | null;
  boqRevisionId?: string | null;
  revisionId?: string | null;
  id?: string | null;
  projectId?: string | null;
  project?: { id?: string | null } | null;
}

export interface DashboardPendingAction {
  id: string;
  boqCode: string;
  title: string;
  description?: string;
  status: string;
  actionText: string;
  link: string;
  severity?: 'danger' | 'warning' | string;
  updatedAt?: string | Date;
}
