/**
 * @file src/agents/risk-officer.ts
 * @description Risk Officer AI Agent
 * 
 * PURPOSE: Play the thief - try to break the algorithm
 * 
 * This agent adversarially tests the underwriting system by simulating
 * fraud attempts and edge cases to identify vulnerabilities.
 */

// ============================================
// TYPES
// ============================================

export interface FraudVector {
  id: string;
  name: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: 'identity' | 'collateral' | 'income' | 'documentation' | 'timing';
}

export interface AttackSimulation {
  vectorId: string;
  vectorName: string;
  testCase: string;
  input: Record<string, unknown>;
  expectedOutcome: 'BLOCKED' | 'FLAGGED' | 'PASSED';
  actualOutcome?: 'BLOCKED' | 'FLAGGED' | 'PASSED';
  passed: boolean;
  notes?: string;
}

export interface VulnerabilityReport {
  generatedAt: string;
  totalTests: number;
  passed: number;
  failed: number;
  criticalVulnerabilities: AttackSimulation[];
  recommendations: string[];
  overallScore: number; // 0-100 (higher = more secure)
}

// ============================================
// KNOWN FRAUD VECTORS
// ============================================

const FRAUD_VECTORS: FraudVector[] = [
  // Identity Fraud
  {
    id: 'ID-001',
    name: 'Synthetic Identity',
    description: 'Fabricated identity using mix of real/fake data',
    severity: 'CRITICAL',
    category: 'identity',
  },
  {
    id: 'ID-002',
    name: 'Identity Theft',
    description: 'Using stolen legitimate identity',
    severity: 'CRITICAL',
    category: 'identity',
  },
  {
    id: 'ID-003',
    name: 'Straw Borrower',
    description: 'Using someone else to apply on your behalf',
    severity: 'HIGH',
    category: 'identity',
  },

  // Collateral Fraud
  {
    id: 'COL-001',
    name: 'Phantom Collateral',
    description: 'Claiming assets that don\'t exist',
    severity: 'CRITICAL',
    category: 'collateral',
  },
  {
    id: 'COL-002',
    name: 'Inflated Valuation',
    description: 'Overstating collateral value',
    severity: 'HIGH',
    category: 'collateral',
  },
  {
    id: 'COL-003',
    name: 'Double Pledge',
    description: 'Using same collateral for multiple loans',
    severity: 'CRITICAL',
    category: 'collateral',
  },
  {
    id: 'COL-004',
    name: 'Stolen Collateral',
    description: 'Pledging assets not owned',
    severity: 'CRITICAL',
    category: 'collateral',
  },
  {
    id: 'COL-005',
    name: 'Photo Fraud',
    description: 'Using photos of items you don\'t own',
    severity: 'HIGH',
    category: 'collateral',
  },

  // Income Fraud
  {
    id: 'INC-001',
    name: 'Fabricated Income',
    description: 'Fake pay stubs or employment',
    severity: 'HIGH',
    category: 'income',
  },
  {
    id: 'INC-002',
    name: 'Inflated Income',
    description: 'Overstating actual income',
    severity: 'MEDIUM',
    category: 'income',
  },

  // Documentation Fraud
  {
    id: 'DOC-001',
    name: 'Forged Receipts',
    description: 'Fake purchase documentation',
    severity: 'HIGH',
    category: 'documentation',
  },
  {
    id: 'DOC-002',
    name: 'Photoshopped Documents',
    description: 'Altered legitimate documents',
    severity: 'HIGH',
    category: 'documentation',
  },

  // Timing Fraud
  {
    id: 'TIM-001',
    name: 'Velocity Attack',
    description: 'Multiple applications in short period',
    severity: 'MEDIUM',
    category: 'timing',
  },
  {
    id: 'TIM-002',
    name: 'Bust-Out',
    description: 'Build trust then max out and disappear',
    severity: 'CRITICAL',
    category: 'timing',
  },
];

// ============================================
// RISK OFFICER AGENT
// ============================================

export class RiskOfficerAgent {
  private vectors: FraudVector[] = FRAUD_VECTORS;

  /**
   * Run full adversarial test suite against the underwriting system
   */
  async runAdversarialAudit(
    underwritingEndpoint: string
  ): Promise<VulnerabilityReport> {
    const simulations: AttackSimulation[] = [];
    
    console.log('[RiskOfficer] Starting adversarial audit...');
    console.log(`[RiskOfficer] Testing ${this.vectors.length} fraud vectors`);

    for (const vector of this.vectors) {
      const testCases = this.generateTestCases(vector);
      
      for (const testCase of testCases) {
        const result = await this.executeSimulation(
          underwritingEndpoint,
          vector,
          testCase
        );
        simulations.push(result);
      }
    }

    return this.generateReport(simulations);
  }

  /**
   * Generate test cases for a fraud vector
   */
  private generateTestCases(vector: FraudVector): Array<{
    name: string;
    input: Record<string, unknown>;
    expectedOutcome: 'BLOCKED' | 'FLAGGED' | 'PASSED';
  }> {
    const cases: Array<{
      name: string;
      input: Record<string, unknown>;
      expectedOutcome: 'BLOCKED' | 'FLAGGED' | 'PASSED';
    }> = [];

    switch (vector.id) {
      case 'COL-001': // Phantom Collateral
        cases.push({
          name: 'Non-existent PAID',
          input: {
            collateralAssetIds: ['PAID-FAKE-12345'],
            collateralValueCents: 500000,
          },
          expectedOutcome: 'BLOCKED',
        });
        break;

      case 'COL-002': // Inflated Valuation
        cases.push({
          name: '10x Market Value',
          input: {
            collateralAssetIds: ['PAID-REAL-001'],
            collateralValueCents: 10000000, // $100k for $10k item
            claimedCondition: 'new',
          },
          expectedOutcome: 'FLAGGED',
        });
        break;

      case 'COL-003': // Double Pledge
        cases.push({
          name: 'Already Pledged Asset',
          input: {
            collateralAssetIds: ['PAID-ALREADY-PLEDGED'],
            existingLoanId: 'LOAN-123',
          },
          expectedOutcome: 'BLOCKED',
        });
        break;

      case 'COL-004': // Stolen Collateral
        cases.push({
          name: 'Different Owner',
          input: {
            borrowerId: 'USER-A',
            collateralAssetIds: ['PAID-OWNED-BY-USER-B'],
          },
          expectedOutcome: 'BLOCKED',
        });
        break;

      case 'TIM-001': // Velocity Attack
        cases.push({
          name: '5 Applications in 1 Hour',
          input: {
            borrowerId: 'USER-VELOCITY',
            applicationCount: 5,
            timeWindowMinutes: 60,
          },
          expectedOutcome: 'FLAGGED',
        });
        break;

      default:
        // Generic test case
        cases.push({
          name: `Generic test for ${vector.name}`,
          input: { vectorId: vector.id },
          expectedOutcome: 'FLAGGED',
        });
    }

    return cases;
  }

  /**
   * Execute a single attack simulation
   */
  private async executeSimulation(
    endpoint: string,
    vector: FraudVector,
    testCase: {
      name: string;
      input: Record<string, unknown>;
      expectedOutcome: 'BLOCKED' | 'FLAGGED' | 'PASSED';
    }
  ): Promise<AttackSimulation> {
    const simulation: AttackSimulation = {
      vectorId: vector.id,
      vectorName: vector.name,
      testCase: testCase.name,
      input: testCase.input,
      expectedOutcome: testCase.expectedOutcome,
      passed: false,
    };

    try {
      // In real implementation, this would call the underwriting endpoint
      // For now, we simulate the response
      console.log(`[RiskOfficer] Testing: ${vector.name} - ${testCase.name}`);
      
      // Simulate API call
      const response = await this.simulateUnderwritingCall(endpoint, testCase.input);
      simulation.actualOutcome = response.outcome;
      simulation.passed = simulation.actualOutcome === simulation.expectedOutcome;
      
      if (!simulation.passed) {
        simulation.notes = `Expected ${simulation.expectedOutcome}, got ${simulation.actualOutcome}`;
      }
    } catch (error) {
      simulation.actualOutcome = 'PASSED'; // System didn't block = vulnerability
      simulation.passed = false;
      simulation.notes = `Error during test: ${error}`;
    }

    return simulation;
  }

  /**
   * Simulate underwriting call (mock for testing)
   */
  private async simulateUnderwritingCall(
    _endpoint: string,
    input: Record<string, unknown>
  ): Promise<{ outcome: 'BLOCKED' | 'FLAGGED' | 'PASSED' }> {
    // This would be replaced with actual API call in production
    // For now, simulate based on input patterns
    
    if (input.collateralAssetIds && 
        Array.isArray(input.collateralAssetIds) && 
        input.collateralAssetIds.some((id: string) => id.includes('FAKE'))) {
      return { outcome: 'BLOCKED' };
    }

    if (input.applicationCount && (input.applicationCount as number) > 3) {
      return { outcome: 'FLAGGED' };
    }

    return { outcome: 'PASSED' };
  }

  /**
   * Generate vulnerability report
   */
  private generateReport(simulations: AttackSimulation[]): VulnerabilityReport {
    const passed = simulations.filter(s => s.passed).length;
    const failed = simulations.filter(s => !s.passed).length;
    
    const criticalVulnerabilities = simulations.filter(s => {
      const vector = this.vectors.find(v => v.id === s.vectorId);
      return !s.passed && (vector?.severity === 'CRITICAL' || vector?.severity === 'HIGH');
    });

    const recommendations: string[] = [];
    
    // Generate recommendations based on failures
    const failedVectors = new Set(simulations.filter(s => !s.passed).map(s => s.vectorId));
    
    if (failedVectors.has('COL-001')) {
      recommendations.push('Implement PAID existence verification before underwriting');
    }
    if (failedVectors.has('COL-003')) {
      recommendations.push('Add collateral lien check against existing loans');
    }
    if (failedVectors.has('COL-004')) {
      recommendations.push('Verify PAID ownership matches borrower ID');
    }
    if (failedVectors.has('TIM-001')) {
      recommendations.push('Implement velocity limiting on applications');
    }

    const overallScore = Math.round((passed / simulations.length) * 100);

    return {
      generatedAt: new Date().toISOString(),
      totalTests: simulations.length,
      passed,
      failed,
      criticalVulnerabilities,
      recommendations,
      overallScore,
    };
  }

  /**
   * Get all known fraud vectors
   */
  getFraudVectors(): FraudVector[] {
    return this.vectors;
  }

  /**
   * Add custom fraud vector
   */
  addFraudVector(vector: FraudVector): void {
    this.vectors.push(vector);
  }
}

// Singleton
let agent: RiskOfficerAgent | null = null;

export function getRiskOfficerAgent(): RiskOfficerAgent {
  if (!agent) {
    agent = new RiskOfficerAgent();
  }
  return agent;
}
