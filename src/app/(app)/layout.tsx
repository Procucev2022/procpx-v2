// app/(app)/layout.tsx - Enterprise Authenticated Application Shell
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import TopNav from '@/components/ui/TopNav';
import { ToastProvider } from '@/components/ui/Toast';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const user = session.user as any;

  return (
    <ToastProvider>
      <div className="app-shell">
        <TopNav
          user={{
            name: user.name,
            email: user.email,
            role: user.role,
            tenantName: user.tenantName,
          }}
        />
        <div className="app-body">
          <Sidebar
            user={{
              name: user.name,
              email: user.email,
              role: user.role,
              tenantName: user.tenantName,
            }}
          />
          <main className="app-main">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
