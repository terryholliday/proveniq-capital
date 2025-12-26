/**
 * @file modules/collateral/monitoring.service.ts
 * @description PROVENIQ Capital - Collateral Monitoring Service
 * 
 * Subscribes to Core Event Bus to monitor collateral state changes:
 * - Anchor seal events (armed, sealed, broken, tamper)
 * - Custody transfers
 * - Asset sales (via Bids)
 * - Service events (value impact)
 * - Condition changes
 * 
 * Triggers:
 * - Covenant breach alerts
 * - LTV recalculation
 * - Loan status updates
 * - Default escalation
 */

// ============================================
// TYPES
// ============================================

export interface CollateralWatch {
  watchId: string;
  loanId: string;
  assetId: string;
  paid?: string;
  
  // Original values at loan creation
  originalValueCents: number;
  originalLtv: number;
  
  // Current values
  currentValueCents: number;
  currentLtv: number;
  
  // Status
  status: 'active' | 'breach' | 'liquidating' | 'released';
  breachType?: BreachType;
  breachDetectedAt?: string;
  
  // Thresholds
  maxLtv: number; // Trigger breach if exceeded
  
  createdAt: string;
  updatedAt: string;
}

export type BreachType = 
  | 'ltv_exceeded'
  | 'seal_broken'
  | 'tamper_detected'
  | 'unauthorized_transfer'
  | 'asset_sold'
  | 'condition_degraded';

export interface CollateralEvent {
  eventId: string;
  watchId: string;
  loanId: string;
  assetId: string;
  
  eventType: string;
  eventSource: 'core' | 'anchor' | 'bids' | 'service' | 'transit';
  
  payload: Record<string, any>;
  
  // Impact
  valueImpactCents?: number;
  newLtv?: number;
  triggeredBreach: boolean;
  
  receivedAt: string;
  processedAt: string;
}

export interface BreachAlert {
  alertId: string;
  loanId: string;
  watchId: string;
  breachType: BreachType;
  severity: 'warning' | 'critical';
  
  description: string;
  recommendedAction: string;
  
  // Values
  previousLtv: number;
  currentLtv: number;
  
  createdAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
}

// ============================================
// IN-MEMORY STORES
// ============================================

const watches: Map<string, CollateralWatch> = new Map();
const events: Map<string, CollateralEvent[]> = new Map();
const alerts: Map<string, BreachAlert> = new Map();

// ============================================
// COLLATERAL MONITORING SERVICE
// ============================================

class CollateralMonitoringService {
  private coreEventBusUrl: string;

  constructor() {
    this.coreEventBusUrl = process.env.CORE_API_URL || 'http://localhost:8000';
  }

  /**
   * Register a new collateral watch for a loan
   */
  async registerWatch(
    loanId: string,
    assetId: string,
    paid: string | undefined,
    valueCents: number,
    ltv: number,
    maxLtv: number = 80
  ): Promise<CollateralWatch> {
    const watchId = `WATCH-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const watch: CollateralWatch = {
      watchId,
      loanId,
      assetId,
      paid,
      originalValueCents: valueCents,
      originalLtv: ltv,
      currentValueCents: valueCents,
      currentLtv: ltv,
      status: 'active',
      maxLtv,
      createdAt: now,
      updatedAt: now,
    };

    watches.set(watchId, watch);
    events.set(watchId, []);

    // Subscribe to events for this asset
    await this.subscribeToAssetEvents(watchId, assetId, paid);

    console.log(`[CollateralMonitor] Watch registered: ${watchId} for loan ${loanId}`);

    return watch;
  }

  /**
   * Subscribe to Core Event Bus for asset events
   */
  private async subscribeToAssetEvents(
    watchId: string,
    assetId: string,
    paid?: string
  ): Promise<void> {
    const eventTypes = [
      'anchor.seal_armed',
      'anchor.seal_broken',
      'anchor.tamper_detected',
      'custody.transfer_initiated',
      'custody.transfer_completed',
      'asset.sold',
      'asset.listed_for_sale',
      'service.work_completed',
      'valuation.updated',
      'condition.changed',
    ];

    try {
      // Subscribe to Core Event Bus
      await fetch(`${this.coreEventBusUrl}/api/v1/events/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriberId: `capital-collateral-${watchId}`,
          eventTypes,
          filter: {
            entityType: 'asset',
            entityId: paid || assetId,
          },
          webhookUrl: `${process.env.CAPITAL_API_URL || 'http://localhost:3001'}/webhooks/collateral-events`,
          metadata: { watchId, loanId: watches.get(watchId)?.loanId },
        }),
      });

      console.log(`[CollateralMonitor] Subscribed to ${eventTypes.length} event types for ${assetId}`);
    } catch (error) {
      console.warn(`[CollateralMonitor] Event subscription failed (Core may be offline):`, error);
    }
  }

  /**
   * Process incoming collateral event
   */
  async processEvent(
    watchId: string,
    eventType: string,
    eventSource: CollateralEvent['eventSource'],
    payload: Record<string, any>
  ): Promise<CollateralEvent> {
    const watch = watches.get(watchId);
    if (!watch) throw new Error('Watch not found');

    const eventId = `EVT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    // Calculate impact based on event type
    const { valueImpactCents, newLtv, triggeredBreach, breachType } = 
      this.calculateEventImpact(watch, eventType, payload);

    const event: CollateralEvent = {
      eventId,
      watchId,
      loanId: watch.loanId,
      assetId: watch.assetId,
      eventType,
      eventSource,
      payload,
      valueImpactCents,
      newLtv,
      triggeredBreach,
      receivedAt: now,
      processedAt: now,
    };

    // Store event
    const watchEvents = events.get(watchId) || [];
    watchEvents.push(event);
    events.set(watchId, watchEvents);

    // Update watch if values changed
    if (valueImpactCents !== undefined || newLtv !== undefined) {
      if (valueImpactCents !== undefined) {
        watch.currentValueCents += valueImpactCents;
      }
      if (newLtv !== undefined) {
        watch.currentLtv = newLtv;
      }
      watch.updatedAt = now;
    }

    // Handle breach
    if (triggeredBreach && breachType) {
      await this.handleBreach(watch, breachType, event);
    }

    console.log(`[CollateralMonitor] Event processed: ${eventType} for watch ${watchId}`);

    return event;
  }

  /**
   * Calculate impact of an event on collateral
   */
  private calculateEventImpact(
    watch: CollateralWatch,
    eventType: string,
    payload: Record<string, any>
  ): {
    valueImpactCents?: number;
    newLtv?: number;
    triggeredBreach: boolean;
    breachType?: BreachType;
  } {
    let valueImpactCents: number | undefined;
    let newLtv: number | undefined;
    let triggeredBreach = false;
    let breachType: BreachType | undefined;

    switch (eventType) {
      case 'anchor.seal_broken':
        // Seal broken without authorization = potential theft/tampering
        if (!payload.authorized) {
          triggeredBreach = true;
          breachType = 'seal_broken';
        }
        break;

      case 'anchor.tamper_detected':
        triggeredBreach = true;
        breachType = 'tamper_detected';
        break;

      case 'custody.transfer_completed':
        // Unauthorized transfer = covenant breach
        if (!payload.authorized_by_lender) {
          triggeredBreach = true;
          breachType = 'unauthorized_transfer';
        }
        break;

      case 'asset.sold':
        // Asset sold = immediate breach
        triggeredBreach = true;
        breachType = 'asset_sold';
        break;

      case 'asset.listed_for_sale':
        // Listed for sale = warning, not breach yet
        break;

      case 'service.work_completed':
        // Service can impact value (positively or negatively)
        valueImpactCents = payload.value_impact_cents || 0;
        if (watch.currentValueCents + valueImpactCents > 0) {
          const loanAmount = watch.originalValueCents * (watch.originalLtv / 100);
          newLtv = (loanAmount / (watch.currentValueCents + valueImpactCents)) * 100;
        }
        break;

      case 'valuation.updated':
        // Valuation update from Core
        const newValue = payload.new_value_cents;
        if (newValue && newValue < watch.currentValueCents) {
          valueImpactCents = newValue - watch.currentValueCents;
          const loanAmount = watch.originalValueCents * (watch.originalLtv / 100);
          newLtv = (loanAmount / newValue) * 100;
          
          // Check if LTV exceeds max
          if (newLtv > watch.maxLtv) {
            triggeredBreach = true;
            breachType = 'ltv_exceeded';
          }
        }
        break;

      case 'condition.changed':
        // Condition degradation
        if (payload.new_condition === 'poor' || payload.new_condition === 'damaged') {
          valueImpactCents = -Math.round(watch.currentValueCents * 0.2); // 20% reduction
          triggeredBreach = true;
          breachType = 'condition_degraded';
        }
        break;
    }

    return { valueImpactCents, newLtv, triggeredBreach, breachType };
  }

  /**
   * Handle covenant breach
   */
  private async handleBreach(
    watch: CollateralWatch,
    breachType: BreachType,
    event: CollateralEvent
  ): Promise<BreachAlert> {
    const alertId = `ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    // Determine severity
    const criticalBreaches: BreachType[] = ['seal_broken', 'tamper_detected', 'asset_sold', 'unauthorized_transfer'];
    const severity = criticalBreaches.includes(breachType) ? 'critical' : 'warning';

    // Generate description and recommended action
    const { description, recommendedAction } = this.getBreachDetails(breachType, event.payload);

    const alert: BreachAlert = {
      alertId,
      loanId: watch.loanId,
      watchId: watch.watchId,
      breachType,
      severity,
      description,
      recommendedAction,
      previousLtv: watch.currentLtv,
      currentLtv: event.newLtv || watch.currentLtv,
      createdAt: now,
    };

    // Update watch status
    watch.status = 'breach';
    watch.breachType = breachType;
    watch.breachDetectedAt = now;

    alerts.set(alertId, alert);

    console.log(`[CollateralMonitor] BREACH ALERT: ${breachType} for loan ${watch.loanId}`);

    // TODO: Send notifications (email, SMS, push)
    // TODO: Trigger escalation workflow

    return alert;
  }

  /**
   * Get human-readable breach details
   */
  private getBreachDetails(
    breachType: BreachType,
    payload: Record<string, any>
  ): { description: string; recommendedAction: string } {
    const details: Record<BreachType, { description: string; recommendedAction: string }> = {
      ltv_exceeded: {
        description: 'Loan-to-value ratio has exceeded the maximum threshold due to collateral devaluation.',
        recommendedAction: 'Contact borrower to request additional collateral or partial principal repayment.',
      },
      seal_broken: {
        description: 'The tamper-evident seal on the collateral has been broken without authorization.',
        recommendedAction: 'Immediately contact borrower. Consider freezing loan disbursements. Verify collateral location.',
      },
      tamper_detected: {
        description: 'Tampering has been detected on the collateral anchor device.',
        recommendedAction: 'Freeze all loan activity. Initiate collateral verification. Consider default proceedings.',
      },
      unauthorized_transfer: {
        description: 'The collateral has been transferred to a new owner without lender authorization.',
        recommendedAction: 'Declare loan in default. Initiate recovery proceedings. Contact legal counsel.',
      },
      asset_sold: {
        description: 'The collateral has been sold through PROVENIQ Bids or external marketplace.',
        recommendedAction: 'Intercept proceeds if possible. Declare loan in default. Route to recovery.',
      },
      condition_degraded: {
        description: 'The condition of the collateral has significantly degraded, reducing its value.',
        recommendedAction: 'Request updated appraisal. Contact borrower about collateral maintenance. Adjust LTV calculations.',
      },
    };

    return details[breachType] || {
      description: 'Unknown breach type detected.',
      recommendedAction: 'Review event details and contact compliance team.',
    };
  }

  /**
   * Get watch by ID
   */
  async getWatch(watchId: string): Promise<CollateralWatch | null> {
    return watches.get(watchId) || null;
  }

  /**
   * Get watches for a loan
   */
  async getLoanWatches(loanId: string): Promise<CollateralWatch[]> {
    return Array.from(watches.values()).filter(w => w.loanId === loanId);
  }

  /**
   * Get events for a watch
   */
  async getWatchEvents(watchId: string): Promise<CollateralEvent[]> {
    return events.get(watchId) || [];
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<BreachAlert[]> {
    return Array.from(alerts.values()).filter(a => !a.resolvedAt);
  }

  /**
   * Get alerts for a loan
   */
  async getLoanAlerts(loanId: string): Promise<BreachAlert[]> {
    return Array.from(alerts.values()).filter(a => a.loanId === loanId);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<BreachAlert> {
    const alert = alerts.get(alertId);
    if (!alert) throw new Error('Alert not found');

    alert.acknowledgedAt = new Date().toISOString();
    return alert;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolution: string): Promise<BreachAlert> {
    const alert = alerts.get(alertId);
    if (!alert) throw new Error('Alert not found');

    alert.resolvedAt = new Date().toISOString();

    // Update watch status if this was the only breach
    const watch = watches.get(alert.watchId);
    if (watch && watch.status === 'breach') {
      const unresolvedAlerts = Array.from(alerts.values())
        .filter(a => a.watchId === alert.watchId && !a.resolvedAt);
      
      if (unresolvedAlerts.length === 0) {
        watch.status = 'active';
        watch.breachType = undefined;
      }
    }

    return alert;
  }

  /**
   * Release watch (loan repaid)
   */
  async releaseWatch(watchId: string): Promise<CollateralWatch> {
    const watch = watches.get(watchId);
    if (!watch) throw new Error('Watch not found');

    watch.status = 'released';
    watch.updatedAt = new Date().toISOString();

    // Unsubscribe from events
    // TODO: Call Core Event Bus unsubscribe

    console.log(`[CollateralMonitor] Watch released: ${watchId}`);

    return watch;
  }

  /**
   * Get monitoring statistics
   */
  async getStats(): Promise<{
    totalWatches: number;
    activeWatches: number;
    breachWatches: number;
    totalAlerts: number;
    unresolvedAlerts: number;
    totalEvents: number;
  }> {
    const allWatches = Array.from(watches.values());
    const allAlerts = Array.from(alerts.values());
    let totalEvents = 0;
    for (const evts of events.values()) {
      totalEvents += evts.length;
    }

    return {
      totalWatches: allWatches.length,
      activeWatches: allWatches.filter(w => w.status === 'active').length,
      breachWatches: allWatches.filter(w => w.status === 'breach').length,
      totalAlerts: allAlerts.length,
      unresolvedAlerts: allAlerts.filter(a => !a.resolvedAt).length,
      totalEvents,
    };
  }
}

// Singleton
let service: CollateralMonitoringService | null = null;

export function getCollateralMonitoringService(): CollateralMonitoringService {
  if (!service) {
    service = new CollateralMonitoringService();
  }
  return service;
}
