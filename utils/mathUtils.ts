
import { MarketDataRow, DailyResult, StrategyStats, BacktestConfig, ModelType, SimulationResult, DataSummary } from '../types';

/**
 * Parses a simple CSV string into MarketDataRow objects.
 * Assumes headers are present.
 */
export const parseCSV = (csvText: string): MarketDataRow[] => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  // Robust header parsing: handle \r and spaces
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  
  const data: MarketDataRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',');
    // Allow partial rows if main columns exist, but ideally strict check
    
    const row: any = {};
    headers.forEach((h, index) => {
      const val = values[index]?.trim();
      if (h === 'date_id') {
        const parsedInt = parseInt(val, 10);
        row[h] = isNaN(parsedInt) ? i : parsedInt; // Fallback to index if date_id missing
      } else {
        const num = parseFloat(val);
        row[h] = isNaN(num) ? 0 : num; // Handle NaNs gracefully for demo
      }
    });
    
    // Ensure critical fields exist
    if (row.forward_returns === undefined) row.forward_returns = 0;
    
    data.push(row);
  }
  
  return data.sort((a, b) => a.date_id - b.date_id);
};

/**
 * Calculates Pearson correlation coefficient between two arrays
 */
const calculateCorrelation = (x: number[], y: number[]): number => {
  const n = x.length;
  if (n !== y.length || n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Generates a summary of the uploaded data
 */
export const generateDataSummary = (data: MarketDataRow[]): DataSummary => {
  if (data.length === 0) {
    return {
      rowCount: 0,
      dateRange: { start: 0, end: 0 },
      featureCounts: {},
      featureNames: [],
      stats: { meanReturn: 0, annualizedVol: 0, maxReturn: 0, minReturn: 0, positiveDays: 0 },
      topCorrelations: []
    };
  }

  const returns = data.map(d => d.forward_returns);
  const meanRet = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - meanRet, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);

  // Analyze columns
  const allKeys = Object.keys(data[0]);
  const featureKeys = allKeys.filter(k => 
    !['date_id', 'forward_returns', 'risk_free_rate', 'market_forward_excess_returns', 'lagged_forward_returns', 'lagged_risk_free_rate'].includes(k)
  );
  
  const featureCounts: Record<string, number> = {};
  featureKeys.forEach(key => {
    // Extract prefix (e.g., M from M1, E from E10)
    const match = key.match(/^([A-Z]+)/);
    const prefix = match ? match[1] : 'Other';
    featureCounts[prefix] = (featureCounts[prefix] || 0) + 1;
  });

  // Calculate top correlations with forward_returns
  // Sample data if too large for performance
  const sampleSize = Math.min(data.length, 1000);
  const step = Math.floor(data.length / sampleSize);
  const sampledData = data.filter((_, i) => i % step === 0);
  const sampledReturns = sampledData.map(d => d.forward_returns);

  const correlations = featureKeys.map(key => {
    const featureValues = sampledData.map(d => d[key] as number);
    return {
      feature: key,
      correlation: calculateCorrelation(featureValues, sampledReturns)
    };
  });

  // Sort by absolute correlation
  const topCorrelations = correlations
    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
    .slice(0, 10);

  return {
    rowCount: data.length,
    dateRange: {
      start: data[0].date_id,
      end: data[data.length - 1].date_id
    },
    featureCounts,
    featureNames: featureKeys,
    stats: {
      meanReturn: meanRet,
      annualizedVol: stdDev * Math.sqrt(252),
      maxReturn: Math.max(...returns),
      minReturn: Math.min(...returns),
      positiveDays: returns.filter(r => r > 0).length
    },
    topCorrelations
  };
};

/**
 * Returns the RAW signal score from the model.
 * Range: Roughly -1.0 to 1.0 (though can exceed depending on feature scale).
 * 0.0 = Neutral
 * > 0.0 = Bullish
 * < 0.0 = Bearish
 */
const getRawModelSignal = (modelType: ModelType, row: MarketDataRow, prevRow: MarketDataRow | null): number => {
  switch (modelType) {
    case ModelType.PASSIVE_LONG:
      return 0.0; // Neutral signal, but mapping will add +1 base
    
    case ModelType.MOMENTUM_PROXY:
      // If yesterday was positive, we feel bullish (+0.5). If negative, bearish (-0.5).
      if (prevRow) {
         return prevRow.forward_returns > 0 ? 0.5 : -0.5;
      }
      return 0;

    case ModelType.MEAN_REVERSION:
      // If yesterday was HUGE up (>1%), we fade it (-0.8). Else neutral-ish.
      if (prevRow) {
        if (prevRow.forward_returns > 0.015) return -0.8;
        if (prevRow.forward_returns < -0.015) return 0.5;
        return 0;
      }
      return 0;
      
    case ModelType.RANDOM_FOREST_MOCK:
      // Deterministic pseudo-random signal based on date
      // Creates a wave pattern to visualize position changes clearly
      const x = row.date_id;
      // Mix of sin waves for "market-like" signal
      return Math.sin(x * 0.1) * 0.5 + Math.cos(x * 0.05) * 0.3;
      
    default:
      return 0;
  }
};

/**
 * Calculates rolling standard deviation
 */
const calculateRollingVol = (returns: number[], window: number = 252): number => {
  if (returns.length < window || window <= 1) return 0;
  const slice = returns.slice(-window);
  const mean = slice.reduce((a, b) => a + b, 0) / window;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (window - 1);
  return Math.sqrt(variance) * Math.sqrt(252); // Annualized
};

/**
 * Core Backtest Engine
 */
export const runBacktest = (data: MarketDataRow[], config: BacktestConfig): SimulationResult => {
  const filteredData = data.filter(d => d.date_id >= config.testStartDate && d.date_id <= config.testEndDate);
  
  if (filteredData.length === 0) {
    console.warn("No data found in range", config.testStartDate, config.testEndDate);
    return {
      dailyResults: [],
      stats: {
        cagr: 0, volatility: 0, sharpe: 0, maxDrawdown: 0, adjustedSharpe: 0, winRate: 0, turnover: 0, totalReturn: 0
      }
    };
  }

  let cumulativeStrategy = 1.0;
  let cumulativeMarket = 1.0;
  let maxEquity = 1.0;
  
  const dailyResults: DailyResult[] = [];
  const strategyReturns: number[] = [];
  const marketReturns: number[] = [];
  
  let prevPosition = 0;

  for (let i = 0; i < filteredData.length; i++) {
    const row = filteredData[i];
    const prevRow = i > 0 ? filteredData[i-1] : null;

    // 1. Get Raw Model Signal (-1 to 1 typically)
    const signal = getRawModelSignal(config.modelType, row, prevRow);

    // 2. Map Signal to Base Position
    // Formula: 1 + (k * signal)
    // 0 signal -> 1.0 leverage (market weight)
    // +1 signal -> 1 + k leverage
    // -1 signal -> 1 - k leverage
    let position = 1.0 + (config.mappingSensitivity * signal);

    // 3. Volatility Constraint Check
    // We use a rolling window of realized returns to simulate "forecasted" vol
    // In a real system, this would use the model's volatility forecast.
    const currentMarketVol = calculateRollingVol(marketReturns, 252);
    const currentStrategyVol = calculateRollingVol(strategyReturns, 252);
    
    let volScaler = 1.0;

    if (config.volatilityConstraint && currentStrategyVol > 0 && currentMarketVol > 0) {
      const limit = 1.2 * currentMarketVol;
      if (currentStrategyVol > limit) {
         volScaler = limit / currentStrategyVol;
         position = position * volScaler;
      }
    }
    
    // 4. Hard Constraints
    position = Math.max(config.minInvestment, Math.min(config.maxInvestment, position));

    // 5. Calculate Returns
    const rf = row.risk_free_rate || 0.0001;
    const fwdRet = row.forward_returns;

    // Transaction Costs
    let cost = 0;
    if (i > 0) {
      cost = Math.abs(position - prevPosition) * (config.transactionCostBps / 10000);
    }
    
    const stratRet = (rf * (1 - position)) + (position * fwdRet) - cost;
    const marketRet = fwdRet;
    const excessRet = stratRet - rf;

    strategyReturns.push(stratRet);
    marketReturns.push(marketRet);
    
    cumulativeStrategy *= (1 + stratRet);
    cumulativeMarket *= (1 + marketRet);
    
    maxEquity = Math.max(maxEquity, cumulativeStrategy);
    const drawdown = (cumulativeStrategy - maxEquity) / maxEquity;

    dailyResults.push({
      date: row.date_id,
      market_return: marketRet,
      strategy_return: stratRet,
      excess_return: excessRet,
      position: position,
      model_signal: signal,
      vol_constraint_factor: volScaler,
      cumulative_market: cumulativeMarket,
      cumulative_strategy: cumulativeStrategy,
      drawdown: drawdown,
      market_vol_252: currentMarketVol,
      strategy_vol_252: currentStrategyVol
    });
    
    prevPosition = position;
  }

  // --- Calculate Metrics ---
  const marketVol = calculateRollingVol(marketReturns, filteredData.length);
  const stratVol = calculateRollingVol(strategyReturns, filteredData.length);
  
  const avgExcessRet = dailyResults.reduce((sum, r) => sum + r.excess_return, 0) / dailyResults.length;
  const annualizedExcessRet = avgExcessRet * 252;
  
  const avgRf = filteredData.reduce((sum, r) => sum + (r.risk_free_rate || 0), 0) / filteredData.length;
  const marketMeanExcess = (dailyResults.reduce((sum, r) => sum + r.market_return, 0) / dailyResults.length) - avgRf;

  // Penalties
  const excessVol = (marketVol > 0) ? Math.max(0, (stratVol / marketVol) - 1.2) : 0;
  const volPenalty = 1 + excessVol;

  const returnGap = Math.max(0, (marketMeanExcess - avgExcessRet) * 100 * 252);
  const returnPenalty = 1 + (Math.pow(returnGap, 2) / 100);

  const sharpe = stratVol === 0 ? 0 : annualizedExcessRet / stratVol;
  const adjustedSharpe = sharpe / (volPenalty * returnPenalty);

  const stats: StrategyStats = {
    cagr: Math.pow(cumulativeStrategy, 252 / filteredData.length) - 1,
    volatility: stratVol,
    sharpe: sharpe,
    maxDrawdown: dailyResults.reduce((min, r) => Math.min(min, r.drawdown), 0),
    adjustedSharpe: adjustedSharpe,
    winRate: dailyResults.filter(r => r.strategy_return > r.market_return).length / dailyResults.length,
    turnover: dailyResults.length > 0 ? (dailyResults.reduce((acc, curr, idx) => {
        if (idx === 0) return acc;
        return acc + Math.abs(curr.position - dailyResults[idx-1].position);
    }, 0) / dailyResults.length) : 0,
    totalReturn: cumulativeStrategy - 1
  };

  return { dailyResults, stats };
};

/**
 * Generates synthetic data for the demo if user doesn't upload CSV.
 */
export const generateSyntheticData = (days: number = 2000): MarketDataRow[] => {
  const data: MarketDataRow[] = [];
  let price = 100;
  
  for (let i = 0; i < days; i++) {
    // Random Walk with drift
    const move = (Math.random() - 0.48) * 0.02; 
    price = price * (1 + move);
    
    data.push({
      date_id: i,
      forward_returns: move,
      risk_free_rate: 0.0001, 
      M1: Math.random(),
      V1: 0.1 + Math.random() * 0.2,
      P1: Math.random() * 100
    });
  }
  return data;
};
