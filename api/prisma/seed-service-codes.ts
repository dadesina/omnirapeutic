/**
 * Seed Script: ABA CPT Service Codes
 *
 * Seeds the database with standard ABA (Applied Behavior Analysis) CPT codes
 * used for billing and authorization tracking.
 */

import { PrismaClient, ServiceCategory } from '@prisma/client';

const prisma = new PrismaClient();

const ABA_SERVICE_CODES = [
  // Assessment Codes
  {
    code: '97151',
    description: 'Behavior identification assessment, administered by a physician or other qualified health care professional, each 15 minutes of the physician\'s or other qualified health care professional\'s time face-to-face with patient and/or guardian(s)/caregiver(s) administering assessments and discussing findings and recommendations, and non-face-to-face analyzing past data, scoring/interpreting the assessment, and preparing the report/treatment plan',
    category: ServiceCategory.ASSESSMENT,
    requiredCredentials: ['BCBA', 'BCaBA', 'Licensed Psychologist'],
    typicalDuration: 60,
  },
  {
    code: '97152',
    description: 'Behavior identification-supporting assessment, administered by one technician under the direction of a physician or other qualified health care professional, face-to-face with the patient, each 15 minutes',
    category: ServiceCategory.ASSESSMENT,
    requiredCredentials: ['RBT', 'BCBA', 'BCaBA'],
    typicalDuration: 60,
  },

  // Treatment Codes
  {
    code: '97153',
    description: 'Adaptive behavior treatment by protocol, administered by technician under the direction of a physician or other qualified health care professional, face-to-face with one patient, each 15 minutes',
    category: ServiceCategory.TREATMENT,
    requiredCredentials: ['RBT', 'BCBA', 'BCaBA'],
    typicalDuration: 60, // Typically billed in 1-hour increments (4 units)
  },
  {
    code: '97155',
    description: 'Adaptive behavior treatment with protocol modification, administered by physician or other qualified health care professional, which may include simultaneous direction of technician, face-to-face with one patient, each 15 minutes',
    category: ServiceCategory.TREATMENT,
    requiredCredentials: ['BCBA', 'BCaBA', 'Licensed Psychologist'],
    typicalDuration: 60,
  },

  // Family Guidance
  {
    code: '97156',
    description: 'Family adaptive behavior treatment guidance, administered by physician or other qualified health care professional (with or without the patient present), face-to-face with guardian(s)/caregiver(s), each 15 minutes',
    category: ServiceCategory.FAMILY_GUIDANCE,
    requiredCredentials: ['BCBA', 'BCaBA', 'Licensed Psychologist'],
    typicalDuration: 30,
  },

  // Group Treatment
  {
    code: '97158',
    description: 'Group adaptive behavior treatment by protocol, administered by technician under the direction of a physician or other qualified health care professional, face-to-face with two or more patients, each 15 minutes',
    category: ServiceCategory.TREATMENT,
    requiredCredentials: ['RBT', 'BCBA', 'BCaBA'],
    typicalDuration: 60,
  },
];

async function seedServiceCodes() {
  console.log('🌱 Seeding ABA Service Codes...');

  for (const serviceCode of ABA_SERVICE_CODES) {
    const created = await prisma.serviceCode.upsert({
      where: {
        organizationId_code: {
          organizationId: null, // System-wide default codes
          code: serviceCode.code,
        },
      },
      update: {
        description: serviceCode.description,
        category: serviceCode.category,
        requiredCredentials: serviceCode.requiredCredentials,
        typicalDuration: serviceCode.typicalDuration,
        isActive: true,
      },
      create: {
        organizationId: null, // System-wide default
        code: serviceCode.code,
        description: serviceCode.description,
        category: serviceCode.category,
        requiredCredentials: serviceCode.requiredCredentials,
        typicalDuration: serviceCode.typicalDuration,
        isActive: true,
      },
    });

    console.log(`  ✓ ${created.code}: ${created.description.substring(0, 60)}...`);
  }

  console.log('✅ Service codes seeded successfully!\n');
}

async function main() {
  try {
    await seedServiceCodes();
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
