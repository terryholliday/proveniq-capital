/**
 * @file src/agents/data-architect.ts
 * @description Data Architect AI Agent
 * 
 * PURPOSE: Connect APIs (Gmail, Plaid, LeadsOnline, eBay) into unified pipeline
 * 
 * This agent orchestrates data ingestion from multiple sources to build
 * a comprehensive borrower/asset profile for underwriting decisions.
 */

// ============================================
// TYPES
// ============================================

export interface DataSource {
  name: string;
  type: 'email' | 'financial' | 'marketplace' | 'law_enforcement' | 'ledger';
  apiEndpoint?: string;
  status: 'connected' | 'pending' | 'failed';
}

export interface BorrowerDataProfile {
  borrowerId: string;
  collectedAt: string;
  sources: {
    gmail?: GmailData;
    plaid?: PlaidData;
    leadsOnline?: LeadsOnlineData;
    ebay?: EbayData;
    ledger?: LedgerData;
  };
  completeness: number; // 0-100
  flags: string[];
}

export interface GmailData {
  receiptCount: number;
  purchaseEmails: Array<{
    vendor: string;
    amount: number;
    date: string;
    itemDescription?: string;
  }>;
  warrantyEmails: number;
  shippingConfirmations: number;
}

export interface PlaidData {
  accountsLinked: number;
  incomeEstimate: number;
  monthlyExpenses: number;
  largeTransactions: Array<{
    date: string;
    amount: number;
    merchant: string;
    category: string;
  }>;
  accountAge: number; // months
}

export interface LeadsOnlineData {
  itemsReported: number;
  matchedPawns: number;
  recoveredItems: number;
  openCases: number;
}

export interface EbayData {
  sellerRating?: number;
  totalSales: number;
  avgSalePrice: number;
  itemCategories: string[];
  accountAge: number; // months
}

export interface LedgerData {
  assetCount: number;
  totalValueCents: number;
  provenanceScoreAvg: number;
  custodyEventCount: number;
}

// ============================================
// DATA ARCHITECT AGENT
// ============================================

export class DataArchitectAgent {
  private sources: Map<string, DataSource> = new Map();

  constructor() {
    this.registerDefaultSources();
  }

  private registerDefaultSources(): void {
    this.sources.set('gmail', {
      name: 'Gmail API',
      type: 'email',
      apiEndpoint: process.env.GMAIL_API_URL,
      status: 'pending',
    });
    this.sources.set('plaid', {
      name: 'Plaid API',
      type: 'financial',
      apiEndpoint: process.env.PLAID_API_URL,
      status: 'pending',
    });
    this.sources.set('leadsOnline', {
      name: 'LeadsOnline API',
      type: 'law_enforcement',
      apiEndpoint: process.env.LEADS_ONLINE_API_URL,
      status: 'pending',
    });
    this.sources.set('ebay', {
      name: 'eBay API',
      type: 'marketplace',
      apiEndpoint: process.env.EBAY_API_URL,
      status: 'pending',
    });
    this.sources.set('ledger', {
      name: 'PROVENIQ Ledger',
      type: 'ledger',
      apiEndpoint: process.env.LEDGER_API_URL || 'http://localhost:8006',
      status: 'connected',
    });
  }

  /**
   * Collect all available data for a borrower
   */
  async collectBorrowerProfile(
    borrowerId: string,
    collateralAssetIds: string[]
  ): Promise<BorrowerDataProfile> {
    const profile: BorrowerDataProfile = {
      borrowerId,
      collectedAt: new Date().toISOString(),
      sources: {},
      completeness: 0,
      flags: [],
    };

    const results = await Promise.allSettled([
      this.collectGmailData(borrowerId),
      this.collectPlaidData(borrowerId),
      this.collectLeadsOnlineData(collateralAssetIds),
      this.collectEbayData(borrowerId),
      this.collectLedgerData(borrowerId, collateralAssetIds),
    ]);

    // Process results
    if (results[0].status === 'fulfilled') profile.sources.gmail = results[0].value;
    if (results[1].status === 'fulfilled') profile.sources.plaid = results[1].value;
    if (results[2].status === 'fulfilled') profile.sources.leadsOnline = results[2].value;
    if (results[3].status === 'fulfilled') profile.sources.ebay = results[3].value;
    if (results[4].status === 'fulfilled') profile.sources.ledger = results[4].value;

    // Calculate completeness
    profile.completeness = this.calculateCompleteness(profile);

    // Generate flags
    profile.flags = this.generateFlags(profile);

    return profile;
  }

  /**
   * Collect Gmail purchase history and receipts
   */
  private async collectGmailData(borrowerId: string): Promise<GmailData> {
    // TODO: Implement Gmail API integration
    // For now, return mock data structure
    console.log(`[DataArchitect] Collecting Gmail data for ${borrowerId}`);
    
    return {
      receiptCount: 0,
      purchaseEmails: [],
      warrantyEmails: 0,
      shippingConfirmations: 0,
    };
  }

  /**
   * Collect Plaid financial data
   */
  private async collectPlaidData(borrowerId: string): Promise<PlaidData> {
    // TODO: Implement Plaid API integration
    console.log(`[DataArchitect] Collecting Plaid data for ${borrowerId}`);
    
    return {
      accountsLinked: 0,
      incomeEstimate: 0,
      monthlyExpenses: 0,
      largeTransactions: [],
      accountAge: 0,
    };
  }

  /**
   * Check LeadsOnline for stolen property reports
   */
  private async collectLeadsOnlineData(assetIds: string[]): Promise<LeadsOnlineData> {
    // TODO: Implement LeadsOnline API integration
    console.log(`[DataArchitect] Checking LeadsOnline for ${assetIds.length} assets`);
    
    return {
      itemsReported: 0,
      matchedPawns: 0,
      recoveredItems: 0,
      openCases: 0,
    };
  }

  /**
   * Collect eBay seller history
   */
  private async collectEbayData(borrowerId: string): Promise<EbayData> {
    // TODO: Implement eBay API integration
    console.log(`[DataArchitect] Collecting eBay data for ${borrowerId}`);
    
    return {
      totalSales: 0,
      avgSalePrice: 0,
      itemCategories: [],
      accountAge: 0,
    };
  }

  /**
   * Collect PROVENIQ Ledger data
   */
  private async collectLedgerData(
    borrowerId: string,
    assetIds: string[]
  ): Promise<LedgerData> {
    const ledgerUrl = process.env.LEDGER_API_URL || 'http://localhost:8006';
    
    try {
      // Query Ledger for asset events
      const response = await fetch(`${ledgerUrl}/api/v1/events/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_ids: assetIds,
          owner_id: borrowerId,
        }),
      });

      if (response.ok) {
        const data = await response.json() as {
          totalValueCents?: number;
          avgProvenanceScore?: number;
          eventCount?: number;
        };
        return {
          assetCount: assetIds.length,
          totalValueCents: data.totalValueCents || 0,
          provenanceScoreAvg: data.avgProvenanceScore || 0,
          custodyEventCount: data.eventCount || 0,
        };
      }
    } catch (error) {
      console.error('[DataArchitect] Ledger query failed:', error);
    }

    return {
      assetCount: assetIds.length,
      totalValueCents: 0,
      provenanceScoreAvg: 0,
      custodyEventCount: 0,
    };
  }

  private calculateCompleteness(profile: BorrowerDataProfile): number {
    let score = 0;
    const weights = {
      gmail: 15,
      plaid: 30,
      leadsOnline: 10,
      ebay: 15,
      ledger: 30,
    };

    if (profile.sources.gmail?.receiptCount) score += weights.gmail;
    if (profile.sources.plaid?.accountsLinked) score += weights.plaid;
    if (profile.sources.leadsOnline) score += weights.leadsOnline;
    if (profile.sources.ebay?.totalSales) score += weights.ebay;
    if (profile.sources.ledger?.assetCount) score += weights.ledger;

    return score;
  }

  private generateFlags(profile: BorrowerDataProfile): string[] {
    const flags: string[] = [];

    // LeadsOnline red flags
    if (profile.sources.leadsOnline?.openCases && profile.sources.leadsOnline.openCases > 0) {
      flags.push('LEADSONLY_OPEN_CASES');
    }
    if (profile.sources.leadsOnline?.matchedPawns && profile.sources.leadsOnline.matchedPawns > 0) {
      flags.push('PAWN_HISTORY_DETECTED');
    }

    // Low provenance
    if (profile.sources.ledger?.provenanceScoreAvg && profile.sources.ledger.provenanceScoreAvg < 40) {
      flags.push('LOW_PROVENANCE_SCORE');
    }

    // No financial data
    if (!profile.sources.plaid?.accountsLinked) {
      flags.push('NO_FINANCIAL_DATA');
    }

    return flags;
  }

  /**
   * Get agent status
   */
  getStatus(): { sources: DataSource[]; ready: boolean } {
    return {
      sources: Array.from(this.sources.values()),
      ready: this.sources.get('ledger')?.status === 'connected',
    };
  }
}

// Singleton
let agent: DataArchitectAgent | null = null;

export function getDataArchitectAgent(): DataArchitectAgent {
  if (!agent) {
    agent = new DataArchitectAgent();
  }
  return agent;
}
