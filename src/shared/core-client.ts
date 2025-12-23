/**
 * Proveniq Capital - Core Service Client
 * 
 * Integrates with PROVENIQ Core for:
 * - Asset valuations (collateral appraisal)
 * - Fraud scoring (borrower risk)
 * - Asset registry (PAID lookup, anchor verification)
 */

const CORE_SERVICE_URL = process.env.CORE_SERVICE_URL || 'http://localhost:8000';

export interface ValuationResult {
  valuationId: string;
  assetId: string;
  estimatedValueMicros: string;
  lowEstimateMicros: string;
  highEstimateMicros: string;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  method: string;
  biasFlags: string[];
}

export interface FraudScoreResult {
  scoreId: string;
  entityType: string;
  entityId: string;
  score: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: Array<{
    signalType: string;
    severity: number;
    description: string;
  }>;
  recommendation: 'approve' | 'review' | 'escalate' | 'deny';
  autoDecisionAllowed: boolean;
}

export interface RegisteredAsset {
  paid: string;
  sourceApp: string;
  sourceAssetId: string;
  assetType: string;
  category: string;
  name: string;
  ownerId?: string;
  currentValueMicros?: string;
  anchorId?: string;
}

class CoreClient {
  /**
   * Get valuation for collateral asset
   */
  async getValuation(
    assetId: string,
    itemType: string,
    condition: string,
    purchasePriceMicros?: string
  ): Promise<ValuationResult | null> {
    try {
      const response = await fetch(`${CORE_SERVICE_URL}/v1/valuations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_id: assetId,
          item_type: itemType,
          condition,
          purchase_price_micros: purchasePriceMicros,
          source_app: 'capital',
        }),
      });

      if (!response.ok) {
        console.warn(`[CORE] Valuation failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      return {
        valuationId: data.valuation_id,
        assetId: data.asset_id,
        estimatedValueMicros: data.estimated_value_micros,
        lowEstimateMicros: data.low_estimate_micros,
        highEstimateMicros: data.high_estimate_micros,
        confidenceScore: data.confidence_score,
        confidenceLevel: data.confidence_level,
        method: data.method,
        biasFlags: data.bias_flags || [],
      };
    } catch (error) {
      console.error('[CORE] Valuation error:', error);
      return null;
    }
  }

  /**
   * Score borrower for fraud/credit risk
   */
  async getFraudScore(
    entityType: 'borrower' | 'loan_application',
    entityId: string,
    userId: string,
    amountMicros: string,
    eventType: string
  ): Promise<FraudScoreResult | null> {
    try {
      const response = await fetch(`${CORE_SERVICE_URL}/v1/fraud/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          user_id: userId,
          amount_micros: amountMicros,
          source_app: 'capital',
          event_type: eventType,
        }),
      });

      if (!response.ok) {
        console.warn(`[CORE] Fraud score failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      return {
        scoreId: data.score_id,
        entityType: data.entity_type,
        entityId: data.entity_id,
        score: data.score,
        riskLevel: data.risk_level,
        signals: (data.signals || []).map((s: any) => ({
          signalType: s.signal_type,
          severity: s.severity,
          description: s.description,
        })),
        recommendation: data.recommendation,
        autoDecisionAllowed: data.auto_decision_allowed,
      };
    } catch (error) {
      console.error('[CORE] Fraud score error:', error);
      return null;
    }
  }

  /**
   * Get asset by PROVENIQ Asset ID (PAID)
   */
  async getAsset(paid: string): Promise<RegisteredAsset | null> {
    try {
      const response = await fetch(`${CORE_SERVICE_URL}/v1/assets/${paid}`);

      if (!response.ok) {
        if (response.status === 404) return null;
        console.warn(`[CORE] Asset lookup failed: ${response.status}`);
        return null;
      }

      const data = await response.json() as any;
      return {
        paid: data.paid,
        sourceApp: data.source_app,
        sourceAssetId: data.source_asset_id,
        assetType: data.asset_type,
        category: data.category,
        name: data.name,
        ownerId: data.owner_id,
        currentValueMicros: data.current_value_micros,
        anchorId: data.anchor_id,
      };
    } catch (error) {
      console.error('[CORE] Asset lookup error:', error);
      return null;
    }
  }

  /**
   * Verify asset has valid anchor (for collateral security)
   */
  async verifyAnchor(assetId: string): Promise<{ verified: boolean; anchorId?: string; lastSeen?: string }> {
    try {
      const asset = await this.getAsset(assetId);
      if (!asset || !asset.anchorId) {
        return { verified: false };
      }

      // Could add additional anchor verification via Anchors service
      return {
        verified: true,
        anchorId: asset.anchorId,
      };
    } catch (error) {
      console.error('[CORE] Anchor verification error:', error);
      return { verified: false };
    }
  }
}

// Singleton
let coreClientInstance: CoreClient | null = null;

export function getCoreClient(): CoreClient {
  if (!coreClientInstance) {
    coreClientInstance = new CoreClient();
  }
  return coreClientInstance;
}
