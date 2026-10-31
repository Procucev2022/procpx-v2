/* Shared declarations for components/ui/WorkflowStageNav.tsx. */

export interface WorkflowStageItem {
  id: string;
  stageNumber: number | string;
  label: string;
  status: 'CURRENT' | 'COMPLETED' | 'PENDING' | 'DISABLED';
  onClick?: () => void;
}

export interface WorkflowStageNavProps {
  stages: WorkflowStageItem[];
  className?: string;
}
