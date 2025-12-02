/**
 * Session Documentation Service
 * Phase 7B.2: Session Documentation & Workflow Enhancements
 *
 * Manages completed session documentation records that capture structured
 * information from therapy sessions using predefined templates.
 */

import { Role } from '@prisma/client';
import prisma from '../config/database';
import { logAuditEvent } from './audit.service';
import { JwtPayload } from './auth.service';
import {
  validateDocumentationContent,
  validateDocumentationMatchesTemplate,
} from '../utils/phase7b2-validation';
import type {
  SessionDocumentationContent,
  SessionTemplateStructure,
} from '../types/phase7b2.types';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface CreateSessionDocumentationInput {
  sessionId: string;
  templateId: string;
  content: SessionDocumentationContent;
}

export interface UpdateSessionDocumentationInput {
  content: SessionDocumentationContent;
}

// ============================================================================
// CREATE DOCUMENTATION
// ============================================================================

/**
 * Create session documentation for a specific session
 * RBAC: ADMIN, BCBA, BCABA, RBT (practitioners who conduct sessions)
 */
export async function createSessionDocumentation(
  input: CreateSessionDocumentationInput,
  user: JwtPayload
) {
  // 1. RBAC check - Only practitioners can create documentation
  if (
    user.role !== Role.ADMIN &&
    user.role !== Role.PRACTITIONER &&
    user.role !== Role.RBT
  ) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can create session documentation'
    );
  }

  // 2. Verify session exists and belongs to organization
  const session = await prisma.session.findUnique({
    where: { id: input.sessionId },
    include: {
      patient: true,
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This session belongs to a different organization'
    );
  }

  // 3. Check if documentation already exists for this session (one-to-one relationship)
  const existingDocumentation = await prisma.sessionDocumentation.findUnique({
    where: { sessionId: input.sessionId },
  });

  if (existingDocumentation) {
    throw new Error(
      'Documentation already exists for this session. Use update instead.'
    );
  }

  // 4. Verify template exists and belongs to organization
  const template = await prisma.sessionTemplate.findUnique({
    where: { id: input.templateId },
  });

  if (!template) {
    throw new Error('Session template not found');
  }

  if (template.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This template belongs to a different organization'
    );
  }

  if (!template.isActive) {
    throw new Error(
      'Cannot create documentation with an inactive template. Please use an active template.'
    );
  }

  // 5. Validate documentation content structure
  const contentValidation = validateDocumentationContent(input.content);
  if (!contentValidation.valid) {
    throw new Error(
      `Invalid documentation content: ${contentValidation.errors.join(', ')}`
    );
  }

  // 6. Validate that documentation matches template
  const templateStructure = template.structure as unknown as SessionTemplateStructure;
  const matchValidation = validateDocumentationMatchesTemplate(
    input.content,
    templateStructure
  );

  if (!matchValidation.valid) {
    throw new Error(
      `Documentation does not match template: ${matchValidation.errors.join(', ')}`
    );
  }

  // 7. Create documentation
  const documentation = await prisma.sessionDocumentation.create({
    data: {
      sessionId: input.sessionId,
      templateId: input.templateId,
      content: input.content as any, // Prisma Json type
    },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      session: {
        select: {
          id: true,
          startTime: true,
          patient: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  // 8. Audit log
  await logAuditEvent({
    action: 'CREATE',
    resource: 'session_documentation',
    resourceId: documentation.id,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      sessionId: input.sessionId,
      templateId: input.templateId,
      templateName: template.name,
      patientId: session.patient.id,
      fieldCount: input.content.fields.length,
      completedBy: input.content.completedBy,
    },
  });

  return documentation;
}

// ============================================================================
// READ DOCUMENTATION
// ============================================================================

/**
 * Get session documentation by session ID
 * RBAC: ADMIN, practitioners, or patient/caregiver if it's their own session
 */
export async function getSessionDocumentation(
  sessionId: string,
  user: JwtPayload
) {
  // 1. Verify session exists and belongs to organization
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      patient: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
  });

  if (!session) {
    throw new Error('Session not found');
  }

  if (session.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This session belongs to a different organization'
    );
  }

  // 2. RBAC check - Patients/caregivers can only view their own sessions
  if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
    if (session.patient.userId !== user.userId) {
      throw new Error(
        'Forbidden: You can only view documentation for your own sessions'
      );
    }
  }

  // 3. Query documentation
  const documentation = await prisma.sessionDocumentation.findUnique({
    where: { sessionId },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          structure: true,
        },
      },
      session: {
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          patient: {
            select: {
              id: true,
              userId: true,
            },
          },
          practitioner: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  if (!documentation) {
    throw new Error('No documentation found for this session');
  }

  return documentation;
}

/**
 * Get all documentation for a patient's sessions
 * RBAC: ADMIN, practitioners, or patient/caregiver if it's their own data
 */
export async function getPatientSessionDocumentation(
  patientId: string,
  user: JwtPayload
) {
  // 1. Verify patient exists and belongs to organization
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  if (patient.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This patient belongs to a different organization'
    );
  }

  // 2. RBAC check - Patients/caregivers can only view their own data
  if (user.role === Role.PATIENT || user.role === Role.CAREGIVER) {
    if (patient.userId !== user.userId) {
      throw new Error('Forbidden: You can only view your own documentation');
    }
  }

  // 3. Query all documentation for patient's sessions
  const documentation = await prisma.sessionDocumentation.findMany({
    where: {
      session: {
        patientId,
        organizationId: user.organizationId!,
      },
    },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      session: {
        select: {
          id: true,
          startTime: true,
          status: true,
        },
      },
    },
    orderBy: {
      session: {
        startTime: 'desc',
      },
    },
  });

  return documentation;
}

// ============================================================================
// UPDATE DOCUMENTATION
// ============================================================================

/**
 * Update existing session documentation
 * RBAC: ADMIN, BCBA, BCABA, RBT (practitioners who conduct sessions)
 */
export async function updateSessionDocumentation(
  sessionId: string,
  input: UpdateSessionDocumentationInput,
  user: JwtPayload
) {
  // 1. RBAC check
  if (
    user.role !== Role.ADMIN &&
    user.role !== Role.PRACTITIONER &&
    user.role !== Role.RBT
  ) {
    throw new Error(
      'Forbidden: Only administrators and practitioners can update session documentation'
    );
  }

  // 2. Verify documentation exists
  const existingDocumentation = await prisma.sessionDocumentation.findUnique({
    where: { sessionId },
    include: {
      session: {
        include: {
          patient: true,
        },
      },
      template: true,
    },
  });

  if (!existingDocumentation) {
    throw new Error('Session documentation not found');
  }

  // 3. Multi-tenant isolation check
  if (existingDocumentation.session.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This documentation belongs to a different organization'
    );
  }

  // 4. Validate new content structure
  const contentValidation = validateDocumentationContent(input.content);
  if (!contentValidation.valid) {
    throw new Error(
      `Invalid documentation content: ${contentValidation.errors.join(', ')}`
    );
  }

  // 5. Validate that new content still matches template
  const templateStructure = existingDocumentation.template
    .structure as unknown as SessionTemplateStructure;
  const matchValidation = validateDocumentationMatchesTemplate(
    input.content,
    templateStructure
  );

  if (!matchValidation.valid) {
    throw new Error(
      `Updated documentation does not match template: ${matchValidation.errors.join(', ')}`
    );
  }

  // 6. Update documentation
  const updatedDocumentation = await prisma.sessionDocumentation.update({
    where: { sessionId },
    data: {
      content: input.content as any,
    },
    include: {
      template: {
        select: {
          id: true,
          name: true,
          category: true,
        },
      },
      session: {
        select: {
          id: true,
          startTime: true,
          patient: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      },
    },
  });

  // 7. Audit log
  await logAuditEvent({
    action: 'UPDATE',
    resource: 'session_documentation',
    resourceId: updatedDocumentation.id,
    userId: user.userId,
    organizationId: user.organizationId!,
    details: {
      sessionId,
      templateId: existingDocumentation.templateId,
      patientId: existingDocumentation.session.patient.id,
      fieldCount: input.content.fields.length,
    },
  });

  return updatedDocumentation;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Render documentation as formatted text (for export/display)
 * Combines template field labels with documentation values
 */
export async function renderDocumentationAsText(
  sessionId: string,
  user: JwtPayload
): Promise<string> {
  // Get documentation with template
  const documentation = await getSessionDocumentation(sessionId, user);

  const template = documentation.template;
  const content = documentation.content as unknown as SessionDocumentationContent;
  const templateStructure = template.structure as unknown as SessionTemplateStructure;

  // Build formatted text
  let output = '';
  output += `Session Documentation\n`;
  output += `=====================\n\n`;
  output += `Template: ${template.name}\n`;
  output += `Category: ${template.category}\n`;
  output += `Session Date: ${new Date(documentation.session.startTime).toLocaleDateString()}\n`;
  output += `Completed: ${new Date(content.completedAt).toLocaleString()}\n\n`;

  // Group fields by section if sections exist
  const sections = templateStructure.sections || ['Main'];

  for (const section of sections) {
    output += `--- ${section} ---\n\n`;

    // Get fields for this section
    const sectionFields = templateStructure.fields.filter(
      (f) => (f.section || 'Main') === section
    );

    // Sort by order
    sectionFields.sort((a, b) => a.order - b.order);

    for (const field of sectionFields) {
      const docField = content.fields.find((df) => df.fieldId === field.id);
      const value = docField?.value ?? '(not provided)';

      output += `${field.label}:\n`;

      // Format value based on type
      if (Array.isArray(value)) {
        output += `  ${value.join(', ')}\n`;
      } else if (typeof value === 'boolean') {
        output += `  ${value ? 'Yes' : 'No'}\n`;
      } else {
        output += `  ${value}\n`;
      }

      if (docField?.notes) {
        output += `  Notes: ${docField.notes}\n`;
      }

      output += `\n`;
    }
  }

  // Add metadata if present
  if (content.metadata) {
    output += `--- Additional Information ---\n\n`;
    if (content.metadata.location) {
      output += `Location: ${content.metadata.location}\n`;
    }
    if (content.metadata.participants) {
      output += `Participants: ${content.metadata.participants.join(', ')}\n`;
    }
    if (content.metadata.notes) {
      output += `Notes: ${content.metadata.notes}\n`;
    }
  }

  // Add attachments if present
  if (content.attachments && content.attachments.length > 0) {
    output += `\n--- Attachments ---\n\n`;
    for (const attachment of content.attachments) {
      output += `- ${attachment.name} (${attachment.type})\n`;
      output += `  URL: ${attachment.url}\n`;
      output += `  Uploaded: ${new Date(attachment.uploadedAt).toLocaleString()}\n\n`;
    }
  }

  return output;
}

/**
 * Get documentation statistics for a patient
 */
export async function getPatientDocumentationStats(
  patientId: string,
  user: JwtPayload
) {
  // Verify patient access
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient) {
    throw new Error('Patient not found');
  }

  if (patient.organizationId !== user.organizationId) {
    throw new Error(
      'Forbidden: This patient belongs to a different organization'
    );
  }

  // Get all documentation for patient
  const documentation = await prisma.sessionDocumentation.findMany({
    where: {
      session: {
        patientId,
        organizationId: user.organizationId!,
      },
    },
    include: {
      template: {
        select: {
          category: true,
        },
      },
      session: {
        select: {
          startTime: true,
        },
      },
    },
  });

  // Calculate stats
  const stats = {
    totalDocumentation: documentation.length,
    byCategory: {} as Record<string, number>,
    latestDocumentation:
      documentation.length > 0
        ? new Date(
            Math.max(
              ...documentation.map((d) =>
                new Date(d.session.startTime).getTime()
              )
            )
          )
        : null,
    oldestDocumentation:
      documentation.length > 0
        ? new Date(
            Math.min(
              ...documentation.map((d) =>
                new Date(d.session.startTime).getTime()
              )
            )
          )
        : null,
  };

  // Count by category
  for (const doc of documentation) {
    const category = doc.template.category;
    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
  }

  return stats;
}
