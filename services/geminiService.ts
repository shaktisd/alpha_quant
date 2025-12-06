import { GoogleGenAI } from "@google/genai";
import { StrategyStats, BacktestConfig } from "../types";

export const analyzeStrategy = async (
  stats: StrategyStats, 
  config: BacktestConfig
): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return "API Key not found. Please set REACT_APP_GEMINI_API_KEY or allow usage in demo mode.";
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `
    You are a senior quantitative analyst at a top hedge fund. 
    Analyze the following backtest results for a trading strategy on the S&P 500.
    
    Configuration:
    - Model: ${config.modelType}
    - Volatility Constraint: ${config.volatilityConstraint ? 'Active' : 'Disabled'}
    - Leverage Cap: ${config.maxInvestment}x
    
    Performance Metrics:
    - Adjusted Sharpe (Competition Metric): ${stats.adjustedSharpe.toFixed(4)}
    - Annualized Sharpe: ${stats.sharpe.toFixed(4)}
    - CAGR: ${(stats.cagr * 100).toFixed(2)}%
    - Volatility: ${(stats.volatility * 100).toFixed(2)}%
    - Max Drawdown: ${(stats.maxDrawdown * 100).toFixed(2)}%
    - Turnover: ${(stats.turnover * 100).toFixed(2)}%

    Provide a concise "Vibe Check" (1 paragraph) and then 3 bullet points of specific constructive feedback or risks.
    Be sophisticated but punchy. Use financial terminology correctly.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "No analysis generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Could not generate analysis. Please check API quota or connection.";
  }
};
