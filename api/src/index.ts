/**
 * Server Entry Point
 * Starts the Express server
 */

import { createApp } from './app';

const PORT = process.env.PORT || 3000;
const app = createApp();

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Auth endpoints: http://localhost:${PORT}/api/auth/register|login|me`);
});
