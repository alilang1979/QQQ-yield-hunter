import { OptionRow } from '../types.ts';

export const calculateOptionMetrics = (
  strike: number,
  premium: number,
  expirationDateStr: string,
  type: 'put' | 'call' = 'put',
  delta?: number,
  costBasis?: number
): OptionRow => {
  const today = new Date();
  const expirationDate = new Date(expirationDateStr);
  
  // Calculate difference in time
  const timeDiff = expirationDate.getTime() - today.getTime();
  // Calculate difference in days. Ensure at least 1 day to avoid division by zero.
  const daysToExpiration = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));

  // ROI & Capital Calculations
  let capitalRequired = 0;
  let roi = 0;
  let breakeven = 0;

  if (type === 'call') {
      // Covered Call
      // Capital is the cost of shares. Use costBasis if provided, else Strike or approx price
      // ROI = Premium / Net Capital (Cost Basis)
      const basis = costBasis && costBasis > 0 ? costBasis : strike; 
      capitalRequired = basis * 100;
      roi = (premium / basis) * 100;
      breakeven = basis - premium;
  } else {
      // Cash Secured Put
      // Capital Required = Strike * 100
      // ROI = Premium / Strike
      capitalRequired = strike * 100;
      roi = (premium / strike) * 100;
      breakeven = strike - premium;
  }

  // Annualized Return = ROI * (365 / DTE)
  const annualizedReturn = roi * (365 / daysToExpiration);
  
  // Win Rate Estimate (1 - |Delta|)
  let winRate: number | undefined = undefined;
  if (delta !== undefined) {
      winRate = (1 - Math.abs(delta)) * 100;
  }

  return {
    id: `${strike}-${expirationDateStr}-${type}`,
    strike,
    premium,
    daysToExpiration,
    expirationDate: expirationDateStr,
    annualizedReturn,
    breakeven,
    capitalRequired,
    roi,
    type,
    delta,
    winRate
  };
};

export const getTargetStrikes = (currentPrice: number): number[] => {
  const base = Math.floor(currentPrice / 5) * 5;
  return [base, base - 5, base - 10];
};

// NEW: Dynamic Volatility Target Calculation
// Uses Square Root of Time Rule with a fixed baseline Volatility (IV) for QQQ.
export const calculateDynamicTargets = (currentPrice: number, expirationDateStr: string) => {
  const today = new Date();
  const exp = new Date(expirationDateStr);
  const timeDiff = exp.getTime() - today.getTime();
  const daysToExpiration = Math.max(1, Math.ceil(timeDiff / (1000 * 3600 * 24)));
  
  // Baseline IV for QQQ (approx 18% average)
  const BASELINE_IV = 0.18;
  
  // Calculate Expected Move (1 Standard Deviation)
  // Formula: Price * IV * sqrt(Days / 365)
  const years = daysToExpiration / 365;
  const stdDev = currentPrice * BASELINE_IV * Math.sqrt(years);

  // Define Targets
  // Aggressive: ~0.5 StdDev OTM (High Yield, higher risk)
  // Moderate:   ~1.0 StdDev OTM (Balanced)
  // Safe:       ~2.0 StdDev OTM (Very conservative)
  return {
      aggressive: currentPrice - (0.5 * stdDev),
      moderate: currentPrice - (1.0 * stdDev),
      safe: currentPrice - (2.0 * stdDev),
      stdDev, // return for debug/display if needed
      daysToExpiration
  };
};

export const calculateIVRank = (current: number, low: number, high: number): number => {
    if (high <= low) return 50; // Fallback
    const rank = ((current - low) / (high - low)) * 100;
    return Math.max(0, Math.min(100, rank));
};

export const getIVStatus = (rank: number): { msg: string, color: 'emerald' | 'yellow' | 'red' } => {
    if (rank >= 50) return { msg: '高波动 (Sell)', color: 'emerald' };
    if (rank <= 20) return { msg: '低波动 (Buy)', color: 'red' };
    return { msg: '中性 (Neutral)', color: 'yellow' };
};

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercentage = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
};

export const getNextFriday = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + (5 + 7 - d.getDay()) % 7);
  // Format YYYY-MM-DD
  return d.toISOString().split('T')[0];
};