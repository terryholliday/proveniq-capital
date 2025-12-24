/**
 * PROVENIQ Capital - Covenant Definitions & Monitoring
 * 
 * Covenants are contractual conditions that must be maintained.
 * Breach of covenant triggers warnings, rate adjustments, or default.
 */

// ============================================================================
// COVENANT TYPES
// ============================================================================

export type CovenantType =
  | 'LTV_MAX'                  // Loan-to-value must stay below threshold
  | 'ANCHOR_SEAL_INTACT'       // Anchors seal must not be broken
  | 'INSURANCE_ACTIVE'         // Insurance must remain active
  | 'CUSTODY_UNCHANGED'        // Asset must remain with borrower
  | 'SERVICE_CURRENT'          // Scheduled maintenance must be current
  | 'LOCATION_BOUND'           // Asset must stay in defined geography
  | 'CONDITION_MAINTAINED';    // Asset condition must not degrade

export type CovenantSeverity = 'WARNING' | 'BREACH' | 'DEFAULT';

export type CovenantStatus = 'ACTIVE' | 'SATISFIED' | 'BREACHED' | 'WAIVED';

// ============================================================================
// COVENANT DEFINITIONS
// ============================================================================

export interface CovenantDefinition {
  type: CovenantType;
  name: string;
  description: string;
  severity: CovenantSeverity;
  gracePeriodHours: number;
  autoCure: boolean;           // Can be auto-cured when condition met again
  ledgerEventTypes: string[];  // Ledger events that can trigger this
}

export const COVENANT_DEFINITIONS: Record<CovenantType, CovenantDefinition> = {
  LTV_MAX: {
    type: 'LTV_MAX',
    name: 'Maximum LTV Ratio',
    description: 'Loan-to-value ratio must not exceed threshold',
    severity: 'WARNING',
    gracePeriodHours: 72,
    autoCure: true,
    ledgerEventTypes: ['VALUATION_UPDATED', 'PAYMENT_RECEIVED'],
  },
  ANCHOR_SEAL_INTACT: {
    type: 'ANCHOR_SEAL_INTACT',
    name: 'Anchor Seal Integrity',
    description: 'Physical anchor seal must remain intact',
    severity: 'DEFAULT',
    gracePeriodHours: 0,       // Immediate
    autoCure: false,
    ledgerEventTypes: ['ANCHOR_SEAL_BROKEN', 'ANCHOR_SEAL_ARMED'],
  },
  INSURANCE_ACTIVE: {
    type: 'INSURANCE_ACTIVE',
    name: 'Active Insurance Coverage',
    description: 'Collateral insurance must remain active',
    severity: 'BREACH',
    gracePeriodHours: 168,     // 7 days
    autoCure: true,
    ledgerEventTypes: ['INSURANCE_LAPSED', 'INSURANCE_RENEWED'],
  },
  CUSTODY_UNCHANGED: {
    type: 'CUSTODY_UNCHANGED',
    name: 'Custody Verification',
    description: 'Asset must remain in borrower custody',
    severity: 'DEFAULT',
    gracePeriodHours: 24,
    autoCure: false,
    ledgerEventTypes: ['CUSTODY_CHANGED', 'CUSTODY_VERIFIED'],
  },
  SERVICE_CURRENT: {
    type: 'SERVICE_CURRENT',
    name: 'Service Schedule',
    description: 'Required maintenance must be current',
    severity: 'WARNING',
    gracePeriodHours: 336,     // 14 days
    autoCure: true,
    ledgerEventTypes: ['SERVICE_OVERDUE', 'SERVICE_COMPLETED'],
  },
  LOCATION_BOUND: {
    type: 'LOCATION_BOUND',
    name: 'Geographic Restriction',
    description: 'Asset must remain within defined geography',
    severity: 'BREACH',
    gracePeriodHours: 48,
    autoCure: true,
    ledgerEventTypes: ['ANCHOR_LOCATION', 'GEOFENCE_VIOLATION'],
  },
  CONDITION_MAINTAINED: {
    type: 'CONDITION_MAINTAINED',
    name: 'Condition Maintenance',
    description: 'Asset condition must not significantly degrade',
    severity: 'WARNING',
    gracePeriodHours: 168,     // 7 days
    autoCure: false,
    ledgerEventTypes: ['CONDITION_UPDATED', 'DAMAGE_REPORTED'],
  },
};

// ============================================================================
// COVENANT INSTANCE
// ============================================================================

export interface Covenant {
  id: string;
  loanId: string;
  type: CovenantType;
  status: CovenantStatus;
  
  // Thresholds (type-specific)
  thresholdValue?: number;     // e.g., max LTV of 0.60
  thresholdLocation?: string;  // e.g., geofence polygon
  
  // Current state
  currentValue?: number;
  lastCheckedAt: string;
  
  // Breach info
  breachedAt?: string;
  breachReason?: string;
  gracePeriodEndsAt?: string;
  
  // Resolution
  curedAt?: string;
  waivedAt?: string;
  waivedBy?: string;
  waiverReason?: string;
  
  createdAt: string;
}

// ============================================================================
// COVENANT EVENTS
// ============================================================================

export interface CovenantEvent {
  id: string;
  covenantId: string;
  loanId: string;
  eventType: 'CHECK' | 'BREACH' | 'CURE' | 'WAIVE' | 'ESCALATE';
  previousStatus: CovenantStatus;
  newStatus: CovenantStatus;
  ledgerEventId?: string;
  details: Record<string, unknown>;
  createdAt: string;
}

// ============================================================================
// COVENANT CHECK RESULT
// ============================================================================

export interface CovenantCheckResult {
  covenantId: string;
  type: CovenantType;
  passed: boolean;
  currentValue?: number;
  thresholdValue?: number;
  message: string;
  action: 'NONE' | 'WARN' | 'BREACH' | 'DEFAULT' | 'CURE';
}

// ============================================================================
// COVENANT MONITORING
// ============================================================================

export interface CovenantMonitorConfig {
  loanId: string;
  covenants: Covenant[];
  checkIntervalMs: number;
  webhookUrl?: string;
}

/**
 * Evaluate a single covenant against current state.
 */
export function evaluateCovenant(
  covenant: Covenant,
  currentValue: number | string | boolean,
): CovenantCheckResult {
  const definition = COVENANT_DEFINITIONS[covenant.type];
  
  let passed = true;
  let action: CovenantCheckResult['action'] = 'NONE';
  let message = '';
  
  switch (covenant.type) {
    case 'LTV_MAX':
      if (typeof currentValue === 'number' && covenant.thresholdValue) {
        passed = currentValue <= covenant.thresholdValue;
        message = passed 
          ? `LTV ${(currentValue * 100).toFixed(1)}% within limit`
          : `LTV ${(currentValue * 100).toFixed(1)}% exceeds max ${(covenant.thresholdValue * 100).toFixed(1)}%`;
      }
      break;
      
    case 'ANCHOR_SEAL_INTACT':
      passed = currentValue === true;
      message = passed ? 'Anchor seal intact' : 'ANCHOR SEAL BROKEN';
      break;
      
    case 'INSURANCE_ACTIVE':
      passed = currentValue === true;
      message = passed ? 'Insurance active' : 'Insurance lapsed';
      break;
      
    case 'CUSTODY_UNCHANGED':
      passed = currentValue === true;
      message = passed ? 'Custody verified' : 'Custody changed without authorization';
      break;
      
    case 'SERVICE_CURRENT':
      passed = currentValue === true;
      message = passed ? 'Service current' : 'Service overdue';
      break;
      
    case 'LOCATION_BOUND':
      passed = currentValue === true;
      message = passed ? 'Within geofence' : 'Geofence violation detected';
      break;
      
    case 'CONDITION_MAINTAINED':
      if (typeof currentValue === 'number' && covenant.thresholdValue) {
        passed = currentValue >= covenant.thresholdValue;
        message = passed
          ? `Condition score ${currentValue} acceptable`
          : `Condition score ${currentValue} below minimum ${covenant.thresholdValue}`;
      }
      break;
  }
  
  // Determine action based on result and severity
  if (!passed) {
    if (covenant.status === 'BREACHED') {
      // Already breached, check if grace period expired
      if (covenant.gracePeriodEndsAt && new Date() > new Date(covenant.gracePeriodEndsAt)) {
        action = definition.severity === 'DEFAULT' ? 'DEFAULT' : 'BREACH';
      } else {
        action = 'WARN';
      }
    } else {
      // New breach
      action = definition.severity === 'DEFAULT' ? 'DEFAULT' : 'BREACH';
    }
  } else if (covenant.status === 'BREACHED' && definition.autoCure) {
    // Was breached but now passes - auto-cure
    action = 'CURE';
    message = `${message} - Auto-cured`;
  }
  
  return {
    covenantId: covenant.id,
    type: covenant.type,
    passed,
    currentValue: typeof currentValue === 'number' ? currentValue : undefined,
    thresholdValue: covenant.thresholdValue,
    message,
    action,
  };
}

/**
 * Create default covenants for a loan based on product type.
 */
export function createDefaultCovenants(
  loanId: string,
  maxLtv: number,
  hasAnchor: boolean,
  hasInsurance: boolean,
): Omit<Covenant, 'id'>[] {
  const now = new Date().toISOString();
  const covenants: Omit<Covenant, 'id'>[] = [];
  
  // Always add LTV covenant
  covenants.push({
    loanId,
    type: 'LTV_MAX',
    status: 'ACTIVE',
    thresholdValue: maxLtv + 0.10, // 10% buffer before breach
    lastCheckedAt: now,
    createdAt: now,
  });
  
  // Add anchor covenant if applicable
  if (hasAnchor) {
    covenants.push({
      loanId,
      type: 'ANCHOR_SEAL_INTACT',
      status: 'ACTIVE',
      lastCheckedAt: now,
      createdAt: now,
    });
    
    covenants.push({
      loanId,
      type: 'CUSTODY_UNCHANGED',
      status: 'ACTIVE',
      lastCheckedAt: now,
      createdAt: now,
    });
  }
  
  // Add insurance covenant if applicable
  if (hasInsurance) {
    covenants.push({
      loanId,
      type: 'INSURANCE_ACTIVE',
      status: 'ACTIVE',
      lastCheckedAt: now,
      createdAt: now,
    });
  }
  
  return covenants;
}
