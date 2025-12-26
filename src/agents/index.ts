/**
 * @file src/agents/index.ts
 * @description AI Agent exports for PROVENIQ Capital
 * 
 * Three core agents for intelligent lending:
 * 
 * 1. DATA ARCHITECT - Connect APIs (Gmail, Plaid, LeadsOnline, eBay) into unified pipeline
 * 2. RISK OFFICER - Play the thief - try to break the algorithm  
 * 3. TRUTH DATABASE - Save every outcome: repaid? defaulted? fraud? This is ML fuel.
 */

export { 
  DataArchitectAgent, 
  getDataArchitectAgent,
  type BorrowerDataProfile,
  type DataSource,
} from './data-architect';

export { 
  RiskOfficerAgent, 
  getRiskOfficerAgent,
  type FraudVector,
  type AttackSimulation,
  type VulnerabilityReport,
} from './risk-officer';

export { 
  TruthDatabaseAgent, 
  getTruthDatabaseAgent,
  type LoanOutcome,
  type LoanOutcomeRecord,
  type MLDataset,
} from './truth-database';
