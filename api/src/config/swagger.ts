/**
 * Swagger (OpenAPI) configuration for the Omnirapeutic API.
 * This file defines the OpenAPI 3.0 specification for API documentation.
 */

import swaggerJSDoc, { Options } from 'swagger-jsdoc';

const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Omnirapeutic API',
      version: '1.0.0',
      description: 'ABA Practice Management Platform API - Comprehensive API for managing ABA therapy practices including patient records, authorizations, insurance, and session tracking.',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    /**
     * Components section for reusable parts of the specification.
     * This includes security schemes, schemas for models and responses, and common parameters.
     */
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token obtained from authentication endpoint',
        },
      },
      schemas: {
        // Common Model Schemas
        Patient: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: "Patient's unique identifier" },
            userId: { type: 'string', format: 'uuid', description: 'Associated user account ID' },
            firstName: { type: 'string', description: "Patient's first name" },
            lastName: { type: 'string', description: "Patient's last name" },
            dateOfBirth: { type: 'string', format: 'date', description: "Patient's date of birth" },
            medicalRecordNumber: { type: 'string', description: 'Medical record number (MRN)' },
            organizationId: { type: 'string', format: 'uuid', description: 'ID of the organization the patient belongs to' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'firstName', 'lastName', 'dateOfBirth', 'organizationId'],
        },
        Authorization: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Authorization unique identifier' },
            patientId: { type: 'string', format: 'uuid', description: 'Patient this authorization is for' },
            insuranceId: { type: 'string', format: 'uuid', nullable: true, description: 'Associated insurance record' },
            serviceCodeId: { type: 'string', format: 'uuid', description: 'Service code covered by this authorization' },
            authNumber: { type: 'string', nullable: true, description: "Payer's authorization number" },
            totalUnits: { type: 'integer', description: 'Total authorized units' },
            usedUnits: { type: 'integer', description: 'Units already consumed/billed', default: 0 },
            scheduledUnits: { type: 'integer', description: 'Units scheduled but not yet completed', default: 0 },
            startDate: { type: 'string', format: 'date', description: 'Authorization start date' },
            endDate: { type: 'string', format: 'date', description: 'Authorization end date' },
            status: {
              type: 'string',
              enum: ['PENDING', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED'],
              description: 'Authorization status'
            },
            notes: { type: 'string', nullable: true, description: 'Additional notes' },
            organizationId: { type: 'string', format: 'uuid', description: 'Organization ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'patientId', 'serviceCodeId', 'totalUnits', 'startDate', 'endDate', 'organizationId'],
        },
        Insurance: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Insurance record unique identifier' },
            patientId: { type: 'string', format: 'uuid', description: 'Patient this insurance is for' },
            payerName: { type: 'string', description: 'Insurance payer name (e.g., "United Healthcare")' },
            payerId: { type: 'string', nullable: true, description: 'National Payer ID' },
            memberNumber: { type: 'string', description: 'Insurance member/policy number' },
            groupNumber: { type: 'string', nullable: true, description: 'Insurance group number' },
            effectiveDate: { type: 'string', format: 'date', description: 'Coverage effective date' },
            terminationDate: { type: 'string', format: 'date', nullable: true, description: 'Coverage termination date' },
            isActive: { type: 'boolean', default: true, description: 'Whether insurance is currently active' },
            isPrimary: { type: 'boolean', default: true, description: 'Whether this is the primary insurance' },
            lastVerifiedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last eligibility verification timestamp' },
            notes: { type: 'string', nullable: true, description: 'Additional notes' },
            organizationId: { type: 'string', format: 'uuid', description: 'Organization ID' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'patientId', 'payerName', 'memberNumber', 'effectiveDate', 'organizationId'],
        },
        ServiceCode: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', description: 'Service code unique identifier' },
            organizationId: { type: 'string', format: 'uuid', nullable: true, description: 'Organization ID (null for system-wide codes)' },
            code: { type: 'string', description: 'CPT code (e.g., "97153", "97155")' },
            description: { type: 'string', description: 'Service description' },
            category: {
              type: 'string',
              enum: ['ASSESSMENT', 'TREATMENT', 'SUPERVISION', 'OTHER'],
              description: 'Service category'
            },
            requiredCredentials: { type: 'array', items: { type: 'string' }, description: 'Required practitioner credentials (e.g., ["RBT", "BCBA"])' },
            typicalDuration: { type: 'integer', nullable: true, description: 'Typical session duration in minutes' },
            isActive: { type: 'boolean', default: true, description: 'Whether service code is active' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
          required: ['id', 'code', 'description', 'category'],
        },

        // Common Response Schemas
        Success: {
          type: 'object',
          properties: {
            status: { type: 'string', example: 'success' },
            data: {
              type: 'object',
              description: 'Response data payload. The structure will vary by endpoint.',
            },
            message: { type: 'string', nullable: true, example: 'Operation completed successfully.' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'An error occurred' },
            error: { type: 'string', nullable: true, example: 'Detailed error message' },
          },
        },
        ValidationError: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Validation failed.' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', description: 'The field that failed validation.' },
                  message: { type: 'string', description: 'The validation error message.' },
                },
              },
            },
          },
        },
        UnauthorizedError: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Authentication required' },
          },
        },
        ForbiddenError: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Insufficient permissions' },
          },
        },
        NotFoundError: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Resource not found' },
          },
        },
      },
      parameters: {
        OrganizationId: {
          in: 'path',
          name: 'organizationId',
          schema: {
            type: 'string',
            format: 'uuid',
          },
          required: true,
          description: 'The unique identifier of the organization.',
        },
        PatientId: {
          in: 'path',
          name: 'patientId',
          schema: {
            type: 'string',
            format: 'uuid',
          },
          required: true,
          description: 'The unique identifier of the patient.',
        },
        AuthorizationId: {
          in: 'path',
          name: 'id',
          schema: {
            type: 'string',
            format: 'uuid',
          },
          required: true,
          description: 'The unique identifier of the authorization.',
        },
        InsuranceId: {
          in: 'path',
          name: 'id',
          schema: {
            type: 'string',
            format: 'uuid',
          },
          required: true,
          description: 'The unique identifier of the insurance record.',
        },
        Page: {
          in: 'query',
          name: 'page',
          schema: {
            type: 'integer',
            default: 1,
            minimum: 1,
          },
          description: 'The page number for pagination.',
        },
        Limit: {
          in: 'query',
          name: 'limit',
          schema: {
            type: 'integer',
            default: 20,
            minimum: 1,
            maximum: 100,
          },
          description: 'The number of items to return per page.',
        },
      },
      responses: {
        UnauthorizedError: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UnauthorizedError',
              },
            },
          },
        },
        ForbiddenError: {
          description: 'Insufficient permissions',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ForbiddenError',
              },
            },
          },
        },
        NotFoundError: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/NotFoundError',
              },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ValidationError',
              },
            },
          },
        },
      },
    },
    /**
     * Applies a global security requirement to all API endpoints.
     * Endpoints can override this or have no security by specifying `security: []`.
     */
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  /**
   * An array of file paths where `swagger-jsdoc` will look for JSDoc comments
   * that contain OpenAPI specifications.
   */
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJSDoc(swaggerOptions);

export default swaggerSpec;
