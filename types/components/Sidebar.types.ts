/* Shared declarations for components/Sidebar.tsx. */

export interface SidebarProps {
  user: { name?: string | null; email?: string | null; role: string; tenantName: string };
}
