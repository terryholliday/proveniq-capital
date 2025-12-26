/**
 * @file portal/index.ts
 * @description Borrower Portal module exports
 */

export * from './types';
export { getApplicationService } from './services/application.service';
export { default as portalRoutes } from './routes/portal.routes';
