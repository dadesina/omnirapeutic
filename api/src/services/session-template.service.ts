/**
 * Session Template Service
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * Manages reusable session documentation templates for ABA therapy sessions.
 * Templates define structured forms with field definitions, validations, and conditional logic.
 */

import { Role, TemplateCategory } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';
import {
  validateTemplateStructure,
  SessionTemplateStructureSchema,
} from '../utils/phase7b2-validation';
import type { SessionTemplateStructure } from '../types/phase7b2.types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateSessionTemplateInput {
  name: string;
  description?: string;
  category: TemplateCategory;
  structure: SessionTemplateStructure;
}

export interface UpdateSessionTemplateInput {
  name?: string;
  description?: string;
  category?: TemplateCategory;
  structure?: SessionTemplateStructure;
}

export interface SessionTemplateFilters {
  category?: TemplateCategory;
  isActive?: boolean;
  search?: string; // Search in name/description
}

// ============================================================================
// CREATE TEMPLATE
// ============================================================================

/**
 * Create a new session template
 * RBAC: ADMIN, BCBA (PRACTITIONER role)
 */
export async function createSessionTemplate(
  input: CreateSessionTemplateInput,
  user: JwtPayload
) {
  // 1. RBAC check - Only ADMIN and PRACTITIONER (BCBA) can create templates
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can create session templates'
    );
  }

  // 2. Validate template structure with Zod
  const validationResult = validateTemplateStructure(input.structure);
  if (!validationResult.valid) {
    throw new Error(
      `Invalid template structure: ${validationResult.errors.join(', ')}`
    );
  }

  // 3. Check for duplicate template name within organization
  const existingTemplate = await prisma.sessionTemplate.findFirst({
    where: {
      organizationId: user.organizationId!,
      name: input.name,
      isActive: true,
    },
  });

  if (existingTemplate) {
    throw new Error(
      `A template with the name "${input.name}" already exists in your organization`
    );
  }

  // 4. Create template
  const template = await prisma.sessionTemplate.create({
    data: {
      organizationId: user.organizationId!,
      name: input.name,
      description: input.description,
      category: input.category,
      structure: input.structure as any, // Prisma Json type
      createdBy: user.userId,
    },
  });

  // 5. Audit log
  await logAuditEvent({
    action: 'CREATE',
    resource: 'session_templates',
    resourceId: template.id,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      templateName: template.name,
      category: template.category,
      fieldCount: input.structure.fields.length,
    },
  });

  return template;
}

// ============================================================================
// READ TEMPLATES
// ============================================================================

/**
 * Get all session templates for organization with optional filters
 * RBAC: All authenticated users can view templates from their organization
 */
export async function getAllSessionTemplates(
  filters: SessionTemplateFilters,
  user: JwtPayload
) {
  // Build where clause
  const where: any = {
    organizationId: user.organizationId!,
  };

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { description: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  // Query templates
  const templates = await prisma.sessionTemplate.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  return templates;
}

/**
 * Get session template by ID
 * RBAC: All authenticated users can view templates from their organization
 */
export async function getSessionTemplateById(
  templateId: string,
  user: JwtPayload
) {
  const template = await prisma.sessionTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    throw new Error('Session template not found');
  }

  // Multi-tenant isolation check
  if (template.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This template belongs to a different organization'
    );
  }

  return template;
}

/**
 * Get templates by category
 * RBAC: All authenticated users can view templates from their organization
 */
export async function getSessionTemplatesByCategory(
  category: TemplateCategory,
  user: JwtPayload
) {
  const templates = await prisma.sessionTemplate.findMany({
    where: {
      organizationId: user.organizationId!,
      category,
      isActive: true,
    },
    orderBy: { name: 'asc' },
  });

  return templates;
}

// ============================================================================
// UPDATE TEMPLATE
// ============================================================================

/**
 * Update an existing session template
 * RBAC: ADMIN, BCBA (PRACTITIONER role)
 */
export async function updateSessionTemplate(
  templateId: string,
  input: UpdateSessionTemplateInput,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can update session templates'
    );
  }

  // 2. Verify template exists and belongs to organization
  const existingTemplate = await prisma.sessionTemplate.findUnique({
    where: { id: templateId },
  });

  if (!existingTemplate) {
    throw new Error('Session template not found');
  }

  if (existingTemplate.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This template belongs to a different organization'
    );
  }

  // 3. If updating structure, validate it
  if (input.structure) {
    const validationResult = validateTemplateStructure(input.structure);
    if (!validationResult.valid) {
      throw new Error(
        `Invalid template structure: ${validationResult.errors.join(', ')}`
      );
    }
  }

  // 4. If updating name, check for duplicates
  if (input.name && input.name !== existingTemplate.name) {
    const duplicateTemplate = await prisma.sessionTemplate.findFirst({
      where: {
        organizationId: user.organizationId!,
        name: input.name,
        isActive: true,
        id: { not: templateId }, // Exclude current template
      },
    });

    if (duplicateTemplate) {
      throw new Error(
        `A template with the name "${input.name}" already exists in your organization`
      );
    }
  }

  // 5. Update template
  const updatedTemplate = await prisma.sessionTemplate.update({
    where: { id: templateId },
    data: {
      ...(input.name && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category && { category: input.category }),
      ...(input.structure && { structure: input.structure as any }),
    },
  });

  // 6. Audit log
  await logAuditEvent({
    action: 'UPDATE',
    resource: 'session_templates',
    resourceId: templateId,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      updatedFields: Object.keys(input),
      templateName: updatedTemplate.name,
    },
  });

  return updatedTemplate;
}

// ============================================================================
// DELETE TEMPLATE (SOFT DELETE)
// ============================================================================

/**
 * Deactivate a session template (soft delete)
 * RBAC: ADMIN, BCBA (PRACTITIONER role)
 */
export async function deactivateSessionTemplate(
  templateId: string,
  user: JwtPayload
) {
  // 1. RBAC check
  if (user.role !== Role.ADMIN && user.role !== Role.PRACTITIONER) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can deactivate session templates'
    );
  }

  // 2. Verify template exists and belongs to organization
  const existingTemplate = await prisma.sessionTemplate.findUnique({
    where: { id: templateId },
  });

  if (!existingTemplate) {
    throw new Error('Session template not found');
  }

  if (existingTemplate.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This template belongs to a different organization'
    );
  }

  if (!existingTemplate.isActive) {
    throw new Error('Template is already deactivated');
  }

  // 3. Check if template is in use
  const documentationCount = await prisma.sessionDocumentation.count({
    where: {
      templateId,
    },
  });

  // 4. Soft delete (set isActive to false)
  const deactivatedTemplate = await prisma.sessionTemplate.update({
    where: { id: templateId },
    data: { isActive: false },
  });

  // 5. Audit log
  await logAuditEvent({
    action: 'DELETE',
    resource: 'session_templates',
    resourceId: templateId,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      templateName: existingTemplate.name,
      documentationCount,
      message:
        documentationCount > 0
          ? `Template deactivated but ${documentationCount} documentation records still reference it`
          : 'Template deactivated with no existing documentation',
    },
  });

  return deactivatedTemplate;
}

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate template structure without saving
 * Useful for frontend validation before submission
 */
export function validateTemplateStructureOnly(
  structure: unknown
): { valid: boolean; errors: string[]; data?: SessionTemplateStructure } {
  return validateTemplateStructure(structure);
}

/**
 * Get template field count and metadata summary
 */
export async function getTemplateStats(templateId: string, user: JwtPayload) {
  const template = await getSessionTemplateById(templateId, user);

  const structure = template.structure as unknown as SessionTemplateStructure;
  const documentationCount = await prisma.sessionDocumentation.count({
    where: { templateId },
  });

  return {
    templateId: template.id,
    name: template.name,
    category: template.category,
    isActive: template.isActive,
    fieldCount: structure.fields.length,
    sectionCount: structure.sections?.length || 0,
    requiredFieldCount: structure.fields.filter((f) => f.required).length,
    documentationCount,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}
