
export interface MarketDataRow {
  date_id: number;
  forward_returns: number;
  risk_free_rate: number;
  // Dynamic features can be accessed via index signature for simulation
  [key: string]: string | number; 
}

export enum ModelType {
  MOMENTUM_PROXY = 'Momentum Proxy',
  MEAN_REVERSION = 'Mean Reversion',
  RANDOM_FOREST_MOCK = 'Random Forest (Pre-trained)',
  PASSIVE_LONG = 'Passive Long (1.0)',
}

export interface BacktestConfig {
  initialCapital: number;
  minInvestment: number;
  maxInvestment: number;
  volatilityConstraint: boolean; // limit to 1.2x market vol
  transactionCostBps: number;
  trainStartDate: number;
  trainEndDate: number;
  testStartDate: number;
  testEndDate: number;
  modelType: ModelType;
  mappingSensitivity: number; // k factor
}

export interface DailyResult {
  date: number;
  market_return: number;
  strategy_return: number;
  excess_return: number;
  position: number;
  model_signal: number; // Raw signal from the model (-1 to 1 scale)
  vol_constraint_factor: number; // 1.0 means no reduction, <1.0 means reduced by vol control
  cumulative_market: number;
  cumulative_strategy: number;
  drawdown: number;
  market_vol_252: number;
  strategy_vol_252: number;
}

export interface StrategyStats {
  cagr: number;
  volatility: number;
  sharpe: number;
  maxDrawdown: number;
  adjustedSharpe: number; // The competition metric
  winRate: number;
  turnover: number;
  totalReturn: number;
}

export interface SimulationResult {
  dailyResults: DailyResult[];
  stats: StrategyStats;
}

export interface DataSummary {
  rowCount: number;
  dateRange: { start: number; end: number };
  featureCounts: Record<string, number>;
  featureNames: string[];
  stats: {
    meanReturn: number;
    annualizedVol: number;
    maxReturn: number;
    minReturn: number;
    positiveDays: number;
  };
  topCorrelations: { feature: string; correlation: number }[];
}
