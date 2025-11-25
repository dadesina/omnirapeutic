'use client';

// Dashboard Layout Component
// Provides sidebar navigation and header for dashboard pages

import { useAuth } from '@/lib/auth/hooks';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  roles: string[];
}

const navItems: NavItem[] = [
  { href: '/dashboard/admin', label: 'Dashboard', roles: ['ADMIN'] },
  { href: '/patients', label: 'Patients', roles: ['ADMIN', 'PRACTITIONER'] },
  { href: '/practitioners', label: 'Practitioners', roles: ['ADMIN'] },
  { href: '/users', label: 'Users', roles: ['ADMIN'] },
  { href: '/audit-logs', label: 'Audit Logs', roles: ['ADMIN'] },
  { href: '/dashboard/practitioner', label: 'Dashboard', roles: ['PRACTITIONER'] },
  { href: '/dashboard/patient', label: 'Dashboard', roles: ['PATIENT'] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, role } = useAuth();
  const pathname = usePathname();

  // Filter nav items based on user role
  const visibleNavItems = navItems.filter((item) =>
    item.roles.includes(role || '')
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">
                Omnirapeutic
              </h1>
              <span className="ml-4 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                {role}
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user?.email}</span>
              <Button variant="outline" size="sm" onClick={logout}>
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)]">
          <nav className="p-4 space-y-2">
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
