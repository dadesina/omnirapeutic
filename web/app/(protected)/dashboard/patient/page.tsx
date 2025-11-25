'use client';

// Patient Dashboard Page
// Overview page for patients

import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useAuth } from '@/lib/auth/hooks';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function PatientDashboardPage() {
  const { role, patient, isLoading } = useAuth();
  const router = useRouter();

  // Redirect if not patient
  useEffect(() => {
    if (!isLoading && role && role !== 'PATIENT') {
      router.push(`/dashboard/${role.toLowerCase()}`);
    }
  }, [role, isLoading, router]);

  if (isLoading || role !== 'PATIENT') {
    return null;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome, {patient?.firstName || 'Patient'}!
          </h2>
          <p className="text-gray-600 mt-2">
            Manage your health information and appointments
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Upcoming Appointments
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
                My Practitioners
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">
                No practitioners assigned
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-gray-600">
                Health Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-gray-900">0</div>
              <p className="text-sm text-gray-500 mt-1">No records yet</p>
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
                  {patient?.firstName} {patient?.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Date of Birth:</span>
                <span className="font-medium">
                  {patient?.dateOfBirth
                    ? new Date(patient.dateOfBirth).toLocaleDateString()
                    : 'Not provided'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Medical Record Number:</span>
                <span className="font-medium">
                  {patient?.medicalRecordNumber}
                </span>
              </div>
              {patient?.phoneNumber && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Phone:</span>
                  <span className="font-medium">{patient.phoneNumber}</span>
                </div>
              )}
              {patient?.address && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Address:</span>
                  <span className="font-medium">{patient.address}</span>
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
                <h3 className="font-medium text-gray-900">
                  View Health Records
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Access your medical history
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">Update Profile</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Edit your personal information
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">
                  Schedule Appointment
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Book a new appointment
                </p>
              </button>

              <button className="p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <h3 className="font-medium text-gray-900">
                  View My Practitioners
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  See your healthcare team
                </p>
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
