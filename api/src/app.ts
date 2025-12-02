/**
 * Express Application Setup
 * Separated from server start for testing purposes
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger';
import healthRouter from './routes/health';
import authRouter from './routes/auth.routes';
import patientRouter from './routes/patient.routes';
import practitionerRouter from './routes/practitioner.routes';
import btgRouter from './routes/btg.routes';
import insuranceRouter from './routes/insurance.routes';
import authorizationRouter from './routes/authorization.routes';
import appointmentRouter from './routes/appointment.routes';
import sessionRouter from './routes/session.routes';
import treatmentPlanRouter from './routes/treatmentPlan.routes';
import goalRouter from './routes/goal.routes';
import progressNoteRouter from './routes/progressNote.routes';
import dataPointRouter from './routes/dataPoint.routes';
import analyticsRouter from './routes/analytics.routes';
import billingCodeRouter from './routes/billing-code.routes';
import claimRouter from './routes/claim.routes';
import caseloadRouter from './routes/caseload.routes';
import caregiverRouter from './routes/caregiver.routes';
import messageRouter from './routes/message.routes';
import publicationRouter from './routes/publication.routes';
import supervisionRouter from './routes/supervision.routes';
import sessionEventRouter from './routes/session-event.routes';
import sessionTemplateRouter from './routes/session-template.routes';
import goalProgressRouter from './routes/goal-progress.routes';

export function createApp(): Application {
  const app: Application = express();

  // Trust proxy - required when behind ALB/ELB
  // Set to 1 since we have exactly one proxy (ALB) in front
  app.set('trust proxy', 1);

  // Security Middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "validator.swagger.io"],
      },
    },
  })); // Security headers with CSP relaxed for Swagger UI
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
  }));

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  });

  const authLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
    max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS || '5'),
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false
  });

  // Apply rate limiting
  app.use('/api', apiLimiter);
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Omnirapeutic API Documentation',
  }));

  // Routes
  app.use(healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/patients', patientRouter);
  app.use('/api/practitioners', practitionerRouter);
  app.use('/api/insurance', insuranceRouter);
  app.use('/api/authorizations', authorizationRouter);
  app.use('/api/billing-codes', billingCodeRouter);
  app.use('/api/claims', claimRouter);
  app.use('/api/appointments', appointmentRouter);
  app.use('/api/sessions', sessionRouter);
  app.use('/api/sessions', sessionEventRouter); // Session events (nested under sessions)
  app.use('/api', sessionTemplateRouter); // Session templates and documentation (Phase 7B.2)
  // ABA-specific and other specific routes should come before generic /api routes
  app.use('/api/caseload', caseloadRouter); // Caseload management (ABA therapy)
  app.use('/api/caregivers', caregiverRouter); // Caregiver management (ABA therapy)
  app.use('/api/messages', messageRouter); // Secure messaging (ABA therapy)
  app.use('/api/publications', publicationRouter); // Publication system (ABA therapy)
  app.use('/api/supervision', supervisionRouter); // Supervision management (ABA therapy)
  app.use('/api/admin/btg', btgRouter); // Break-the-Glass emergency access (ADMIN only)
  // Generic /api routes last
  app.use('/api', treatmentPlanRouter);
  app.use('/api', goalRouter);
  app.use('/api/goals', goalProgressRouter); // Goal progress & milestones (Phase 7B.2)
  app.use('/api', progressNoteRouter);
  app.use('/api', dataPointRouter);
  app.use('/api', analyticsRouter);

  // 404 handler for undefined routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested endpoint does not exist'
    });
  });

  // Global error handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled error:', err);

    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message
    });
  });

  return app;
}
