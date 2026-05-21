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
  purchasePrice: number;       // Precio de compra
  appraisalValue: number;      // Valor de tasación actual
  hasHypothec: boolean;        // ¿Tiene hipoteca?
  monthlyPayment: number;      // Cuota mensual (0 si no hay hipoteca)
  monthsRemaining: number;     // Meses restantes (0 si no hay hipoteca)
  createdAt: any;
  updatedAt: any;
}

export interface PropertyStats {
  property: Property;
  debtRemaining: number;       // monthlyPayment × monthsRemaining
  equity: number;              // appraisalValue - debtRemaining
  appreciation: number;        // appraisalValue - purchasePrice
  appreciationPercent: number; // appreciation / purchasePrice × 100
  ltv: number;                 // debtRemaining / appraisalValue × 100
}
