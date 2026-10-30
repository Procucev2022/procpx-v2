/* Shared declarations for components/ui/TopNav.tsx. */

export interface TopNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    role: string;
    tenantName: string;
  };
}
