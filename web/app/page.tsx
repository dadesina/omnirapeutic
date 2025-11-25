// Landing Page
// Public homepage with navigation to login/register

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <main className="max-w-4xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900">
            Omnirapeutic
          </h1>
          <p className="text-xl md:text-2xl text-gray-600">
            HIPAA-Compliant Healthcare Management Platform
          </p>
        </div>

        <p className="text-lg text-gray-700 max-w-2xl mx-auto">
          Secure, scalable, and comprehensive healthcare platform for managing
          patient records, practitioner information, and healthcare operations.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-8">
          <Link href="/login">
            <Button size="lg" className="w-full sm:w-auto min-w-[200px]">
              Login
            </Button>
          </Link>
          <Link href="/register">
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto min-w-[200px]"
            >
              Register
            </Button>
          </Link>
        </div>

        <div className="pt-12 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Secure & HIPAA Compliant
            </h3>
            <p className="text-gray-600">
              End-to-end encryption and comprehensive audit logging ensure
              patient data security and compliance.
            </p>
          </div>

          <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Role-Based Access
            </h3>
            <p className="text-gray-600">
              Separate dashboards for administrators, practitioners, and
              patients with appropriate access controls.
            </p>
          </div>

          <div className="p-6 bg-white rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Modern Infrastructure
            </h3>
            <p className="text-gray-600">
              Built on AWS with ECS, Aurora PostgreSQL, and comprehensive
              monitoring and security features.
            </p>
          </div>
        </div>
      </main>

      <footer className="mt-16 text-sm text-gray-500">
        <p>&copy; 2025 Omnirapeutic. All rights reserved.</p>
      </footer>
    </div>
  );
}
