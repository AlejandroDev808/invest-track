export interface Investment {
  id: string;
  symbol: string;
  name: string;
  type: 'stock' | 'crypto' | 'fund' | 'cash';
  ownerId: string;
  createdAt: any;
}

export interface Transaction {
  id: string;
  investmentId: string;
  pricePerUnit: number;
  quantity: number;
  commission: number;
  date: any;
  ownerId: string;
}

export interface InvestmentSummary extends Investment {
  totalQuantity: number;
  totalInvested: number;
  totalCommission: number;
  avgPrice: number;
  currentPrice: number;
  currentValue: number;
  netProfit: number;
  profitPercent: number;
  portfolioPercent: number;
  hasPrice?: boolean;
}

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  purchasePrice: number;
  appraisalValue: number;
  hasHypothec: boolean;
  monthlyPayment: number;
  monthsRemaining: number;
  monthlyRent?: number;        // Alquiler mensual
  monthlyInsurance?: number;   // Seguro mensual
  monthlyCommunity?: number;   // Comunidad mensual
  createdAt: any;
  updatedAt: any;
}

export interface NetWorthSnapshot {
  id: string;
  ownerId: string;
  date: string;              // YYYY-MM-DD, también usado como parte del ID del documento
  totalNetWorth: number;
  investmentValue: number;
  propertyEquity: number;
  createdAt: any;
}

export interface PropertyStats {
  property: Property;
  debtRemaining: number;
  equity: number;
  appreciation: number;
  appreciationPercent: number;
  ltv: number;
  monthlyIncome: number;       // Alquiler mensual
  monthlyExpenses: number;     // Hipoteca + seguro + comunidad
  monthlyCashflow: number;     // Ingresos - gastos
  annualCashflow: number;      // Cashflow × 12
  grossYield: number;          // (alquiler × 12) / precio compra × 100
  netYield: number;            // (cashflow anual) / precio compra × 100
}
