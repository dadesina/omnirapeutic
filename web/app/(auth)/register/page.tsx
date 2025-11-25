// Register Page
// Public page for new user registration

import { RegisterForm } from '@/components/forms/RegisterForm';
import { Suspense } from 'react';

export const metadata = {
  title: 'Register - Omnirapeutic',
  description: 'Create a new Omnirapeutic account',
};

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">Omnirapeutic</h1>
          <p className="mt-2 text-sm text-gray-600">
            Healthcare Management Platform
          </p>
        </div>

        <Suspense fallback={<div>Loading...</div>}>
          <RegisterForm />
        </Suspense>
      </div>
    </div>
  );
}
