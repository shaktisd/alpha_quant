import { BacktestConfig, ModelType } from './types';

export const DEFAULT_CONFIG: BacktestConfig = {
  initialCapital: 100000,
  minInvestment: 0,
  maxInvestment: 2,
  volatilityConstraint: true,
  transactionCostBps: 5, // 5 basis points
  trainStartDate: 0,
  trainEndDate: 1000,
  testStartDate: 1001,
  testEndDate: 2000,
  modelType: ModelType.MOMENTUM_PROXY,
  mappingSensitivity: 1.0,
};

export const SAMPLE_DATA_URL = 'https://raw.githubusercontent.com/datasets/finance-vix/main/data/vix-daily.csv'; // Placeholder if needed

// We will generate synthetic data if no CSV is uploaded for the demo experience
export const GENERATE_SYNTHETIC_DATA = true;