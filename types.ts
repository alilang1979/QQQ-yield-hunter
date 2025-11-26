export interface OptionRow {
  id: string;
  strike: number;
  premium: number; // The bid price usually used for selling
  daysToExpiration: number;
  expirationDate: string;
  annualizedReturn: number;
  breakeven: number;
  capitalRequired: number;
  roi: number; // Raw return on investment %
  // Optional fields for extended functionality
  winRate?: number;
  delta?: number;
  iv?: number;
  type?: 'put' | 'call';
}

export interface MarketStatus {
  price: number;
  lastUpdated: string;
}

export enum FetchStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface GeminiResponseData {
  currentPrice?: number;
  options?: Array<{
    strike: number;
    premium: number;
    iv?: number;
    delta?: number;
  }>;
  sources?: Array<{
    uri: string;
    title: string;
  }>;
}

export interface VolatilityMetrics {
  currentIV: number;
  highIV: number;
  lowIV: number;
  rank: number;
  status: string;
  statusColor: 'emerald' | 'yellow' | 'red';
}
