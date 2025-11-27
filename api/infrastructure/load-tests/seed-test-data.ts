/**
 * Performance Test Data Seeding Script
 *
 * Creates realistic test data for load testing:
 * - 3 organizations (OrgA, OrgB, OrgC)
 * - 5 service codes (97151, 97153, 97155, 97156, 97157)
 * - 20 patients distributed across orgs
 * - 55 authorizations with varied unit counts
 * - 10 practitioners distributed across orgs
 *
 * Exports test-data.json fixture with:
 * - authorizationIds: All authorization UUIDs
 * - highContentionAuthIds: 10 authorizations with 50 units each
 * - practitionerTokens: Valid JWT tokens for API requests
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import { faker } from '@faker-js/faker';
import {
  PrismaClient,
  AuthStatus,
  Role,
  ServiceCategory,
  type Authorization,
  type Organization,
  type Patient,
  type PatientInsurance,
  type ServiceCode,
  type User,
} from '@prisma/client';
import { hashPassword, generateToken } from '../../src/services/auth.service';

// Seed faker for reproducible data
faker.seed(2024);

const prisma = new PrismaClient();
const OUTPUT_FILE = join(__dirname, 'fixtures', 'test-data.json');
const DEFAULT_PASSWORD = 'PerfTest!234';
const PERF_EMAIL_DOMAIN = 'perf.omni.local';

interface OrgDefinition {
  key: string;
  name: string;
  emailDomain: string;
  patientCount: number;
  practitionerCount: number;
}

interface PatientBundle {
  patient: Patient;
  insurance: PatientInsurance;
}

interface SeededOrg {
  definition: OrgDefinition;
  record: Organization;
  serviceCodes: ServiceCode[];
  patients: PatientBundle[];
}

type AuthBucketLabel = 'highContention' | 'normalOps' | 'highThroughput';

interface AuthBucket {
  label: AuthBucketLabel;
  count: number;
  units: number;
}

const ORG_DEFINITIONS: OrgDefinition[] = [
  {
    key: 'OrgA',
    name: 'LoadTest OrgA',
    emailDomain: 'orga.perf.omni.local',
    patientCount: 10,
    practitionerCount: 4,
  },
  {
    key: 'OrgB',
    name: 'LoadTest OrgB',
    emailDomain: 'orgb.perf.omni.local',
    patientCount: 5,
    practitionerCount: 3,
  },
  {
    key: 'OrgC',
    name: 'LoadTest OrgC',
    emailDomain: 'orgc.perf.omni.local',
    patientCount: 5,
    practitionerCount: 3,
  },
];

const BASE_SERVICE_CODES = [
  {
    code: '97151',
    description: 'Behavior identification assessment',
    category: ServiceCategory.ASSESSMENT,
    requiredCredentials: ['BCBA'],
    typicalDuration: 60,
  },
  {
    code: '97153',
    description: 'Adaptive behavior treatment by protocol',
    category: ServiceCategory.TREATMENT,
    requiredCredentials: ['RBT', 'BCBA'],
    typicalDuration: 60,
  },
  {
    code: '97155',
    description: 'Adaptive behavior treatment with protocol modification',
    category: ServiceCategory.SUPERVISION,
    requiredCredentials: ['BCBA'],
    typicalDuration: 60,
  },
  {
    code: '97156',
    description: 'Family adaptive behavior treatment guidance',
    category: ServiceCategory.FAMILY_GUIDANCE,
    requiredCredentials: ['BCBA'],
    typicalDuration: 60,
  },
  {
    code: '97157',
    description: 'Multiple-family group adaptive behavior treatment',
    category: ServiceCategory.FAMILY_GUIDANCE,
    requiredCredentials: ['BCBA'],
    typicalDuration: 90,
  },
];

const AUTH_BUCKETS: AuthBucket[] = [
  { label: 'highContention', count: 10, units: 50 },
  { label: 'normalOps', count: 20, units: 200 },
  { label: 'highThroughput', count: 25, units: 1000 },
];

async function main(): Promise<void> {
  console.info('Seeding performance test data...');
  await cleanup();
  const seededOrgs = await seedOrganizations();
  const { allAuthorizations, highContentionAuths } = await createAuthorizations(seededOrgs);
  const practitionerTokens = await createPractitioners(seededOrgs);
  await persistFixtures({
    authorizationIds: allAuthorizations.map((auth) => auth.id),
    highContentionAuthIds: highContentionAuths.map((auth) => auth.id),
    practitionerTokens,
  });
  const totalPatients = seededOrgs.reduce((acc, org) => acc + org.patients.length, 0);
  const totalPractitioners = practitionerTokens.length;
  console.info(`Created ${seededOrgs.length} orgs, ${totalPatients} patients, and ${totalPractitioners} practitioners.`);
  console.info(`Generated ${allAuthorizations.length} authorizations (${highContentionAuths.length} high-contention).`);
  console.info(`Fixture file saved to ${OUTPUT_FILE}`);
  console.info(`Default password for seeded users: ${DEFAULT_PASSWORD}`);
}

async function cleanup(): Promise<void> {
  const orgIds = (
    await prisma.organization.findMany({
      where: { name: { in: ORG_DEFINITIONS.map((org) => org.name) } },
      select: { id: true },
    })
  ).map((org) => org.id);

  if (!orgIds.length) {
    return;
  }

  console.info('Cleaning up existing load-test data...');
  await prisma.authorization.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.patientInsurance.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.patient.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.practitioner.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.serviceCode.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
}

async function seedOrganizations(): Promise<SeededOrg[]> {
  const results: SeededOrg[] = [];
  for (const definition of ORG_DEFINITIONS) {
    const record = await prisma.organization.create({
      data: {
        name: definition.name,
        email: `contact@${definition.emailDomain}`,
        phone: faker.phone.number(),
        address: faker.location.streetAddress({ useFullAddress: true }),
        settings: {
          timezone: faker.location.timeZone(),
        },
      },
    });
    const serviceCodes = await createServiceCodes(record);
    const patients = await createPatientsForOrg(record, definition);
    results.push({ definition, record, serviceCodes, patients });
  }
  return results;
}

async function createServiceCodes(org: Organization): Promise<ServiceCode[]> {
  return Promise.all(
    BASE_SERVICE_CODES.map((base) =>
      prisma.serviceCode.create({
        data: {
          organizationId: org.id,
          code: base.code,
          description: base.description,
          category: base.category,
          requiredCredentials: base.requiredCredentials,
          typicalDuration: base.typicalDuration,
        },
      }),
    ),
  );
}

async function createPatientsForOrg(org: Organization, definition: OrgDefinition): Promise<PatientBundle[]> {
  const bundles: PatientBundle[] = [];
  for (let index = 0; index < definition.patientCount; index += 1) {
    const email = `patient-${definition.key.toLowerCase()}-${String(index + 1).padStart(2, '0')}@${PERF_EMAIL_DOMAIN}`;
    const user = await createSeedUser(email, Role.PATIENT, org.id);
    const patient = await prisma.patient.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        dateOfBirth: faker.date.birthdate({ min: 6, max: 16, mode: 'age' }),
        medicalRecordNumber: `MRN-${definition.key}-${String(index + 1).padStart(3, '0')}`,
        phoneNumber: faker.phone.number(),
        address: faker.location.streetAddress({ useFullAddress: true }),
      },
    });
    const coverageStart = faker.date.past({ years: 1 });
    const coverageEnd = faker.date.future({ years: 1, refDate: coverageStart });
    const insurance = await prisma.patientInsurance.create({
      data: {
        patientId: patient.id,
        organizationId: org.id,
        payerName: faker.company.name(),
        memberNumber: `MBR-${faker.string.numeric(8)}`,
        groupNumber: `GRP-${faker.string.alphanumeric(6).toUpperCase()}`,
        effectiveDate: coverageStart,
        terminationDate: coverageEnd,
        isActive: true,
        isPrimary: true,
      },
    });
    bundles.push({ patient, insurance });
  }
  return bundles;
}

async function createAuthorizations(
  seededOrgs: SeededOrg[],
): Promise<{
  allAuthorizations: Authorization[];
  highContentionAuths: Authorization[];
}> {
  const allAuthorizations: Authorization[] = [];
  const highContentionAuths: Authorization[] = [];
  let orgIndex = 0;

  for (const bucket of AUTH_BUCKETS) {
    for (let i = 0; i < bucket.count; i += 1) {
      const orgSeed = seededOrgs[orgIndex % seededOrgs.length];
      orgIndex += 1;
      const patientBundle = faker.helpers.arrayElement(orgSeed.patients);
      const serviceCode = faker.helpers.arrayElement(orgSeed.serviceCodes);
      const startDate = faker.date.recent({ days: 45 });
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 6);

      const authorization = await prisma.authorization.create({
        data: {
          organizationId: orgSeed.record.id,
          patientId: patientBundle.patient.id,
          insuranceId: patientBundle.insurance.id,
          serviceCodeId: serviceCode.id,
          totalUnits: bucket.units,
          authNumber: `AUTH-${orgSeed.definition.key}-${bucket.units}-${faker.string.alphanumeric(6).toUpperCase()}`,
          startDate,
          endDate,
          status: AuthStatus.ACTIVE,
          notes:
            bucket.label === 'highContention'
              ? 'High-contention authorization for concurrency testing.'
              : 'Baseline load-test authorization.',
        },
      });
      allAuthorizations.push(authorization);
      if (bucket.label === 'highContention') {
        highContentionAuths.push(authorization);
      }
    }
  }

  return { allAuthorizations, highContentionAuths };
}

async function createPractitioners(seededOrgs: SeededOrg[]): Promise<string[]> {
  const tokens: string[] = [];
  for (const orgSeed of seededOrgs) {
    for (let index = 0; index < orgSeed.definition.practitionerCount; index += 1) {
      const email = `practitioner-${orgSeed.definition.key.toLowerCase()}-${String(index + 1).padStart(2, '0')}@${PERF_EMAIL_DOMAIN}`;
      const user = await createSeedUser(email, Role.PRACTITIONER, orgSeed.record.id);
      await prisma.practitioner.create({
        data: {
          userId: user.id,
          organizationId: orgSeed.record.id,
          firstName: faker.person.firstName(),
          lastName: faker.person.lastName(),
          specialization: faker.helpers.arrayElement(['BCBA', 'BCaBA', 'SLP']),
          licenseNumber: `LIC-${orgSeed.definition.key}-${String(index + 1).padStart(4, '0')}`,
          phoneNumber: faker.phone.number(),
          credentials: ['BCBA'],
        },
      });
      // Generate JWT token for this practitioner
      const token = generateToken(
        user.id,
        user.email,
        Role.PRACTITIONER,
        orgSeed.record.id,
        false
      );
      tokens.push(token);
    }
  }
  return tokens;
}

async function createSeedUser(email: string, role: Role, organizationId: string): Promise<User> {
  const passwordHash = await hashPassword(DEFAULT_PASSWORD);
  return prisma.user.create({
    data: {
      email,
      password: passwordHash,
      role,
      organizationId,
      isSuperAdmin: false,
    },
  });
}

interface FixturePayload {
  authorizationIds: string[];
  highContentionAuthIds: string[];
  practitionerTokens: string[];
}

async function persistFixtures(payload: FixturePayload): Promise<void> {
  await writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), { encoding: 'utf-8' });
}

main()
  .catch((error) => {
    console.error('Failed to seed load-test data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
