/**
 * Service Code Test Helpers
 *
 * Helper functions for creating service codes in tests
 */

import { ServiceCode, ServiceCategory } from '@prisma/client';
import { faker } from '@faker-js/faker';
import { prisma } from '../setup';
import { JwtPayload } from '../../services/auth.service';

export interface CreateServiceCodeData {
  code: string;
  description: string;
  category: ServiceCategory;
  requiredCredentials?: string[];
  typicalDuration?: number;
  isActive?: boolean;
}

/**
 * Create a test service code
 * Uses organizationId from user, or null for system-wide codes
 */
export async function createServiceCode(
  data: CreateServiceCodeData,
  user: JwtPayload
): Promise<ServiceCode> {
  return await prisma.serviceCode.create({
    data: {
      organizationId: user.organizationId,
      code: data.code,
      description: data.description,
      category: data.category,
      requiredCredentials: data.requiredCredentials || [],
      typicalDuration: data.typicalDuration || 60,
      isActive: data.isActive ?? true
    }
  });
}

/**
 * Create a standard ABA service code (97153) for testing
 */
export async function createStandardABACode(user: JwtPayload): Promise<ServiceCode> {
  return await createServiceCode({
    code: `97153-${faker.string.alphanumeric(4)}`, // Add suffix to avoid uniqueness conflicts
    description: 'Adaptive behavior treatment by protocol',
    category: ServiceCategory.TREATMENT,
    requiredCredentials: ['RBT', 'BCBA'],
    typicalDuration: 60
  }, user);
}
