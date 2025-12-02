/**
 * Phase 7B.2: Zod Validation Schemas
 * Runtime validation for JSON structures in SessionTemplate and SessionDocumentation
 */

import { z } from 'zod';
import type {
  TemplateFieldType,
  SessionTemplateStructure,
  SessionDocumentationContent,
  GoalProgressHistory,
} from '../types/phase7b2.types';

// ============================================================================
// TEMPLATE FIELD VALIDATION
// ============================================================================

/**
 * Valid field types for session templates
 */
export const TemplateFieldTypeSchema = z.enum([
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'radio',
  'signature',
]);

/**
 * Field validation rules schema
 */
export const FieldValidationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  required: z.boolean().optional(),
  customMessage: z.string().optional(),
}).strict();

/**
 * Conditional display logic schema
 */
export const ConditionalDisplaySchema = z.object({
  fieldId: z.string().min(1),
  condition: z.enum(['equals', 'notEquals', 'contains']),
  value: z.union([z.string(), z.number(), z.boolean()]),
}).strict();

/**
 * Individual template field schema
 */
export const TemplateFieldSchema = z.object({
  id: z.string().min(1, 'Field ID is required'),
  label: z.string().min(1, 'Field label is required'),
  type: TemplateFieldTypeSchema,
  required: z.boolean(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
  ]).optional(),
  options: z.array(z.string()).optional(),
  validation: FieldValidationSchema.optional(),
  order: z.number().int().positive('Order must be a positive integer'),
  section: z.string().optional(),
  conditionalDisplay: ConditionalDisplaySchema.optional(),
}).strict();

/**
 * Template metadata schema
 */
export const TemplateMetadataSchema = z.object({
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  estimatedDuration: z.number().int().positive().optional(),
}).strict();

/**
 * Complete session template structure schema
 */
export const SessionTemplateStructureSchema = z.object({
  version: z.string().min(1, 'Template version is required'),
  fields: z.array(TemplateFieldSchema).min(1, 'At least one field is required'),
  sections: z.array(z.string()).optional(),
  metadata: TemplateMetadataSchema.optional(),
}).strict();

// ============================================================================
// SESSION DOCUMENTATION VALIDATION
// ============================================================================

/**
 * Documentation field value schema
 */
export const DocumentationFieldValueSchema = z.object({
  fieldId: z.string().min(1, 'Field ID is required'),
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.null(),
  ]),
  timestamp: z.string().datetime().optional(),
  notes: z.string().optional(),
}).strict();

/**
 * Attachment schema
 */
export const AttachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
  type: z.string().min(1),
  uploadedAt: z.string().datetime(),
}).strict();

/**
 * Documentation metadata schema
 */
export const DocumentationMetadataSchema = z.object({
  location: z.string().optional(),
  participants: z.array(z.string()).optional(),
  notes: z.string().optional(),
}).strict();

/**
 * Complete session documentation content schema
 */
export const SessionDocumentationContentSchema = z.object({
  templateVersion: z.string().min(1, 'Template version is required'),
  fields: z.array(DocumentationFieldValueSchema).min(1, 'At least one field value is required'),
  completedAt: z.string().datetime(),
  completedBy: z.string().min(1, 'Completed by user ID is required'),
  sessionDuration: z.number().int().positive().optional(),
  attachments: z.array(AttachmentSchema).optional(),
  metadata: DocumentationMetadataSchema.optional(),
}).strict();

// ============================================================================
// GOAL PROGRESS VALIDATION
// ============================================================================

/**
 * Goal progress history entry schema
 */
export const GoalProgressHistoryEntrySchema = z.object({
  timestamp: z.string().datetime(),
  value: z.number().min(0).max(100, 'Progress must be between 0 and 100'),
  notes: z.string().optional(),
  recordedBy: z.string().min(1, 'Recorded by user ID is required'),
  sessionId: z.string().optional(),
  milestoneId: z.string().optional(),
  method: z.enum(['manual', 'automated', 'calculated']).optional(),
}).strict();

/**
 * Complete goal progress history schema
 */
export const GoalProgressHistorySchema = z.array(GoalProgressHistoryEntrySchema);

// ============================================================================
// CUSTOM VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate that field IDs in documentation match template structure
 */
export function validateDocumentationMatchesTemplate(
  documentation: SessionDocumentationContent,
  template: SessionTemplateStructure
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check version match
  if (documentation.templateVersion !== template.version) {
    errors.push(
      `Template version mismatch: documentation uses v${documentation.templateVersion}, template is v${template.version}`
    );
  }

  // Get all field IDs from template
  const templateFieldIds = new Set(template.fields.map(f => f.id));
  const documentationFieldIds = new Set(documentation.fields.map(f => f.fieldId));

  // Check for required fields in template
  const requiredFieldIds = template.fields
    .filter(f => f.required)
    .map(f => f.id);

  for (const requiredId of requiredFieldIds) {
    if (!documentationFieldIds.has(requiredId)) {
      errors.push(`Missing required field: ${requiredId}`);
    }
  }

  // Check for unknown fields in documentation
  for (const docFieldId of documentationFieldIds) {
    if (!templateFieldIds.has(docFieldId)) {
      errors.push(`Unknown field in documentation: ${docFieldId}`);
    }
  }

  // Validate field values against template field types
  for (const docField of documentation.fields) {
    const templateField = template.fields.find(f => f.id === docField.fieldId);
    if (!templateField) continue;

    const valueType = typeof docField.value;
    const isArray = Array.isArray(docField.value);

    switch (templateField.type) {
      case 'text':
      case 'textarea':
      case 'date':
      case 'datetime':
      case 'select':
      case 'signature':
        if (valueType !== 'string' && docField.value !== null) {
          errors.push(`Field ${docField.fieldId} expects string, got ${valueType}`);
        }
        break;

      case 'number':
        if (valueType !== 'number' && docField.value !== null) {
          errors.push(`Field ${docField.fieldId} expects number, got ${valueType}`);
        }
        break;

      case 'checkbox':
        if (valueType !== 'boolean' && docField.value !== null) {
          errors.push(`Field ${docField.fieldId} expects boolean, got ${valueType}`);
        }
        break;

      case 'multiselect':
        if (!isArray && docField.value !== null) {
          errors.push(`Field ${docField.fieldId} expects array, got ${valueType}`);
        }
        break;

      case 'radio':
        if (valueType !== 'string' && docField.value !== null) {
          errors.push(`Field ${docField.fieldId} expects string, got ${valueType}`);
        }
        break;
    }

    // Validate against field validation rules
    if (templateField.validation && docField.value !== null) {
      const val = docField.value;
      const rules = templateField.validation;

      if (typeof val === 'number') {
        if (rules.min !== undefined && val < rules.min) {
          errors.push(`Field ${docField.fieldId} value ${val} is below minimum ${rules.min}`);
        }
        if (rules.max !== undefined && val > rules.max) {
          errors.push(`Field ${docField.fieldId} value ${val} exceeds maximum ${rules.max}`);
        }
      }

      if (typeof val === 'string') {
        if (rules.min !== undefined && val.length < rules.min) {
          errors.push(`Field ${docField.fieldId} length ${val.length} is below minimum ${rules.min}`);
        }
        if (rules.max !== undefined && val.length > rules.max) {
          errors.push(`Field ${docField.fieldId} length ${val.length} exceeds maximum ${rules.max}`);
        }
        if (rules.pattern && !new RegExp(rules.pattern).test(val)) {
          errors.push(`Field ${docField.fieldId} value does not match pattern ${rules.pattern}`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate field order uniqueness in template
 */
export function validateFieldOrder(template: SessionTemplateStructure): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const orders = template.fields.map(f => f.order);
  const uniqueOrders = new Set(orders);

  if (orders.length !== uniqueOrders.size) {
    errors.push('Duplicate field order values detected. Each field must have a unique order.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that select/multiselect/radio fields have options
 */
export function validateFieldOptions(template: SessionTemplateStructure): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const field of template.fields) {
    if (['select', 'multiselect', 'radio'].includes(field.type)) {
      if (!field.options || field.options.length === 0) {
        errors.push(`Field ${field.id} of type ${field.type} must have options defined`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Comprehensive template validation
 */
export function validateTemplateStructure(structure: unknown): {
  valid: boolean;
  errors: string[];
  data?: SessionTemplateStructure;
} {
  // First, validate schema
  const schemaResult = SessionTemplateStructureSchema.safeParse(structure);
  if (!schemaResult.success) {
    return {
      valid: false,
      errors: schemaResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const template = schemaResult.data;
  const allErrors: string[] = [];

  // Validate field order
  const orderResult = validateFieldOrder(template);
  if (!orderResult.valid) {
    allErrors.push(...orderResult.errors);
  }

  // Validate field options
  const optionsResult = validateFieldOptions(template);
  if (!optionsResult.valid) {
    allErrors.push(...optionsResult.errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    data: allErrors.length === 0 ? template : undefined,
  };
}

/**
 * Comprehensive documentation validation
 */
export function validateDocumentationContent(
  content: unknown,
  template?: SessionTemplateStructure
): {
  valid: boolean;
  errors: string[];
  data?: SessionDocumentationContent;
} {
  // First, validate schema
  const schemaResult = SessionDocumentationContentSchema.safeParse(content);
  if (!schemaResult.success) {
    return {
      valid: false,
      errors: schemaResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const documentation = schemaResult.data;
  const allErrors: string[] = [];

  // If template provided, validate match
  if (template) {
    const matchResult = validateDocumentationMatchesTemplate(documentation, template);
    if (!matchResult.valid) {
      allErrors.push(...matchResult.errors);
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    data: allErrors.length === 0 ? documentation : undefined,
  };
}

/**
 * Validate goal progress history
 */
export function validateGoalProgressHistory(history: unknown): {
  valid: boolean;
  errors: string[];
  data?: GoalProgressHistory;
} {
  const result = GoalProgressHistorySchema.safeParse(history);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`),
    };
  }

  return {
    valid: true,
    errors: [],
    data: result.data,
  };
}
