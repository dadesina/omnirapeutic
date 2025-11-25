'use client';

// Practitioner Dashboard Page
// Overview page for healthcare practitioners

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/hooks';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PractitionerDashboardPage() {
  const { role, practitioner, isLoading } = useAuth();
  const router = useRouter();

  // Redirect if not practitioner
  useEffect(() => {
    if (!isLoading && role && role !== 'PRACTITIONER') {
      router.push(`/dashboard/${role.toLowerCase()}`);
    }
  }, [role, isLoading, router]);

  if (isLoading || role !== 'PRACTITIONER') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome, Dr. {practitioner?.lastName || 'Practitioner'}
          </h2>
          <p className="text-gray-600 mt-2">
            {practitioner?.specialization && (
              <span className="text-blue-600">
                {practitioner.specialization}
              </span>
            )}
            {practitioner?.licenseNumber && (
              <span className="text-gray-500 ml-2">
                License: {practitioner.licenseNumber}
              </span>
            )}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                My Patients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">
                No patients assigned yet
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Appointments Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">
                No appointments scheduled
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Pending Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">All caught up!</p>
            </CardContent>
          </Card>
        </div>

        {/* Profile Summary */}
        <Card>
          <CardHeader>
            <CardTitle>My Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Name:</span>
                <span className="font-medium">
                  {practitioner?.firstName} {practitioner?.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Specialization:</span>
                <span className="font-medium">
                  {practitioner?.specialization}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">License Number:</span>
                <span className="font-medium">
                  {practitioner?.licenseNumber}
                </span>
              </div>
              {practitioner?.phoneNumber && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Phone:</span>
                  <span className="font-medium">
                    {practitioner.phoneNumber}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">View My Patients</h3>
                <p className="text-sm text-gray-600 mt-1">
                  See all patients assigned to you
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">Update Profile</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Edit your professional information
                </p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
