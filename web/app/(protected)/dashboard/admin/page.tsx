'use client';

// Admin Dashboard Page
// Overview page for administrators

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/hooks';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminDashboardPage() {
  const { role, isLoading } = useAuth();
  const router = useRouter();

  // Redirect if not admin
  useEffect(() => {
    if (!isLoading && role && role !== 'ADMIN') {
      router.push(`/dashboard/${role.toLowerCase()}`);
    }
  }, [role, isLoading, router]);

  if (isLoading || role !== 'ADMIN') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            Admin Dashboard
          </h2>
          <p className="text-gray-600 mt-2">
            Welcome back! Here's an overview of your healthcare platform.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Patients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">
                No patients registered yet
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Practitioners
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">
                No practitioners registered yet
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">1</div>
              <p className="text-sm text-gray-500 mt-1">You are the first user</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">
                  Register New Patient
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Add a new patient to the system
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">
                  Register New Practitioner
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Add a new healthcare practitioner
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">View Audit Logs</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Review system activity and compliance logs
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">
                  Manage User Accounts
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  View and manage all user accounts
                </p>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600">No recent activity to display.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
