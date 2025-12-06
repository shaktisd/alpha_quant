import React, { useState, useEffect, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, BarChart, Bar, Legend, ComposedChart 
} from 'recharts';
import { 
  Settings, Upload, Play, TrendingUp, AlertCircle, 
  Activity, ArrowUpRight, ArrowDownRight, BrainCircuit, Loader2, Database,
  TableProperties, FileText, Info
} from 'lucide-react';
import { MarketDataRow, BacktestConfig, ModelType, SimulationResult, StrategyStats, DataSummary, DailyResult } from './types';
import { DEFAULT_CONFIG, GENERATE_SYNTHETIC_DATA } from './constants';
import { runBacktest, generateSyntheticData, parseCSV, generateDataSummary } from './utils/mathUtils';
import { analyzeStrategy } from './services/geminiService';

// --- Components ---

const StatCard = ({ label, value, subValue, type = 'neutral' }: { label: string, value: string, subValue?: string, type?: 'good' | 'bad' | 'neutral' }) => {
  const colorClass = type === 'good' ? 'text-emerald-400' : type === 'bad' ? 'text-rose-400' : 'text-slate-200';
  return (
    <div className="bg-surface p-4 rounded-xl border border-slate-700 shadow-sm hover:border-slate-600 transition-colors">
      <p className="text-slate-400 text-xs uppercase tracking-wider font-semibold mb-1">{label}</p>
      <div className="flex items-baseline gap-2">
        <h3 className={`text-2xl font-bold ${colorClass}`}>{value}</h3>
        {subValue && <span className="text-xs text-slate-500">{subValue}</span>}
      </div>
    </div>
  );
};

const ConfigInput = ({ label, value, onChange, type = 'text', min, max, step }: any) => (
  <div className="mb-4">
    <label className="block text-slate-400 text-xs uppercase font-bold mb-2">{label}</label>
    <input 
      type={type} 
      value={value} 
      onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) : e.target.value)}
      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:outline-none focus:border-primary transition-colors"
      min={min} max={max} step={step}
    />
  </div>
);

const TradeLogView = ({ results }: { results: SimulationResult }) => {
  // Show last 100 or partial to avoid rendering issues with huge lists
  const displayCount = 200;
  const data = results.dailyResults.slice(0, displayCount);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700 text-sm text-slate-300 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold mb-1">How Positions Are Calculated:</p>
          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-400">
            <li><strong>Model Signal:</strong> Raw output (-1 to +1) representing sentiment.</li>
            <li><strong>Base Position:</strong> 1.0 (Neutral) + (Signal × Sensitivity).</li>
            <li><strong>Vol Constraint:</strong> If rolling strategy vol > 1.2x market vol, position is scaled down.</li>
            <li><strong>Final Position:</strong> Clamped between Min/Max Investment settings.</li>
          </ul>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-900/30 rounded-lg border border-slate-700">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-800 text-slate-400 uppercase sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3">Date ID</th>
              <th className="px-4 py-3">Raw Signal</th>
              <th className="px-4 py-3">Vol Scaler</th>
              <th className="px-4 py-3">Final Pos</th>
              <th className="px-4 py-3 text-right">Daily Return</th>
              <th className="px-4 py-3 text-right">Equity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-mono">
            {data.map((row) => (
              <tr key={row.date} className="hover:bg-slate-800/50">
                <td className="px-4 py-2 text-slate-500">{row.date}</td>
                <td className={`px-4 py-2 ${row.model_signal > 0.1 ? 'text-emerald-400' : row.model_signal < -0.1 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {row.model_signal.toFixed(3)}
                </td>
                <td className="px-4 py-2 text-slate-300">
                  {row.vol_constraint_factor < 0.99 ? (
                    <span className="text-orange-400 font-bold">{(row.vol_constraint_factor * 100).toFixed(0)}%</span>
                  ) : (
                    <span className="text-slate-600">-</span>
                  )}
                </td>
                <td className="px-4 py-2 font-bold text-white">
                  {row.position.toFixed(2)}x
                </td>
                <td className={`px-4 py-2 text-right ${row.strategy_return >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {(row.strategy_return * 100).toFixed(2)}%
                </td>
                <td className="px-4 py-2 text-right text-slate-300">
                  {row.cumulative_strategy.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {results.dailyResults.length > displayCount && (
          <div className="p-4 text-center text-slate-500 text-xs">
            Showing first {displayCount} rows of {results.dailyResults.length} total.
          </div>
        )}
      </div>
    </div>
  );
};

const DataAnalysisView = ({ summary }: { summary: DataSummary }) => {
  return (
    <div className="h-full overflow-y-auto pr-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
          <h4 className="text-slate-400 text-xs uppercase font-bold mb-2">Dataset Scale</h4>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold text-white">{summary.rowCount.toLocaleString()}</p>
              <p className="text-xs text-slate-500">Rows</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-slate-300">ID: {summary.dateRange.start} - {summary.dateRange.end}</p>
              <p className="text-xs text-slate-500">Range</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
          <h4 className="text-slate-400 text-xs uppercase font-bold mb-2">Market Volatility</h4>
          <div className="flex justify-between items-end">
            <div>
              <p className="text-2xl font-bold text-cyan-400">{(summary.stats.annualizedVol * 100).toFixed(1)}%</p>
              <p className="text-xs text-slate-500">Annualized</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-slate-300">{(summary.stats.meanReturn * 252 * 100).toFixed(1)}%</p>
              <p className="text-xs text-slate-500">Ann. Mean Return</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
          <h4 className="text-slate-400 text-xs uppercase font-bold mb-2">Feature Set</h4>
          <div className="flex flex-wrap gap-2">
             {Object.entries(summary.featureCounts).map(([prefix, count]) => (
               <span key={prefix} className="text-xs px-2 py-1 bg-slate-800 rounded border border-slate-600 text-slate-300">
                 {prefix}: {count}
               </span>
             ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Top Feature Correlations (to Forward Return)
          </h3>
          <div className="bg-slate-900/30 rounded-lg border border-slate-700 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-800 text-slate-400 text-xs uppercase">
                <tr>
                  <th className="px-4 py-2">Feature</th>
                  <th className="px-4 py-2 text-right">Correlation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {summary.topCorrelations.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/50">
                    <td className="px-4 py-2 font-mono text-slate-300">{item.feature}</td>
                    <td className={`px-4 py-2 text-right font-mono ${item.correlation > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {item.correlation.toFixed(4)}
                    </td>
                  </tr>
                ))}
                {summary.topCorrelations.length === 0 && (
                   <tr><td colSpan={2} className="px-4 py-4 text-center text-slate-500">No correlation data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
           <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <TableProperties className="w-4 h-4 text-blue-400" />
            Distribution Stats
          </h3>
          <div className="space-y-3">
             <div className="flex justify-between p-3 bg-slate-900/30 rounded border border-slate-800">
                <span className="text-slate-400">Max Daily Return</span>
                <span className="text-emerald-400 font-mono">{(summary.stats.maxReturn * 100).toFixed(2)}%</span>
             </div>
             <div className="flex justify-between p-3 bg-slate-900/30 rounded border border-slate-800">
                <span className="text-slate-400">Min Daily Return</span>
                <span className="text-rose-400 font-mono">{(summary.stats.minReturn * 100).toFixed(2)}%</span>
             </div>
             <div className="flex justify-between p-3 bg-slate-900/30 rounded border border-slate-800">
                <span className="text-slate-400">Positive Days</span>
                <span className="text-blue-400 font-mono">{((summary.stats.positiveDays / summary.rowCount) * 100).toFixed(1)}%</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [data, setData] = useState<MarketDataRow[]>([]);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [config, setConfig] = useState<BacktestConfig>(DEFAULT_CONFIG);
  const [results, setResults] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [tab, setTab] = useState<'equity' | 'drawdown' | 'positions' | 'data' | 'log'>('equity');

  // Initial Load
  useEffect(() => {
    if (GENERATE_SYNTHETIC_DATA) {
      const synthetic = generateSyntheticData(2000); // ~8 years
      setData(synthetic);
      setDataSummary(generateDataSummary(synthetic));
    }
  }, []);

  // Run Backtest
  const handleRunBacktest = () => {
    setLoading(true);
    setAiAnalysis(""); 
    if (tab === 'data') setTab('equity'); // Switch back to results if on data tab
    
    // Small timeout to allow UI to render loading state
    setTimeout(() => {
      try {
        const res = runBacktest(data, config);
        setResults(res);
      } catch (e) {
        console.error(e);
        alert("Error running backtest. Check parameters.");
      } finally {
        setLoading(false);
      }
    }, 100);
  };

  // Run Gemini Analysis
  const handleAiAnalyze = async () => {
    if (!results) return;
    setAnalyzing(true);
    const analysis = await analyzeStrategy(results.stats, config);
    setAiAnalysis(analysis);
    setAnalyzing(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const parsed = parseCSV(text);
      setData(parsed);
      
      const summary = generateDataSummary(parsed);
      setDataSummary(summary);
      setTab('data'); // Auto-switch to data assessment view

      // Auto-set ranges based on data
      if (parsed.length > 0) {
        setConfig(prev => ({
          ...prev,
          trainStartDate: parsed[0].date_id,
          trainEndDate: parsed[Math.floor(parsed.length * 0.6)].date_id,
          testStartDate: parsed[Math.floor(parsed.length * 0.6) + 1].date_id,
          testEndDate: parsed[parsed.length - 1].date_id
        }));
      }
    };
    reader.readAsText(file);
  };

  // Chart Data Sampling (Performance)
  const chartData = useMemo(() => {
    if (!results) return [];
    
    // Safety check for empty results
    if (results.dailyResults.length === 0) return [];

    const step = Math.max(1, Math.ceil(results.dailyResults.length / 500));
    
    return results.dailyResults.filter((_, i) => i % step === 0).map(r => ({
      ...r,
      cum_mkt_pct: (r.cumulative_market - 1) * 100,
      cum_strat_pct: (r.cumulative_strategy - 1) * 100,
      drawdown_pct: r.drawdown * 100,
      model_signal_scaled: r.model_signal // Keep raw signal for dual axis plots if needed
    }));
  }, [results]);

  const showDots = results ? results.dailyResults.length < 50 : false;

  const renderModelExplainer = () => {
    switch (config.modelType) {
      case ModelType.MOMENTUM_PROXY:
        return "Logic: If yesterday's return was positive, Signal = +0.5 (Bullish). If negative, Signal = -0.5 (Bearish). Captures trend.";
      case ModelType.MEAN_REVERSION:
        return "Logic: If yesterday spiked >1.5%, Signal = -0.8 (Sell). If dropped <-1.5%, Signal = +0.5 (Buy Dip). Fades large moves.";
      case ModelType.PASSIVE_LONG:
        return "Logic: Signal is always 0.0 (Neutral). Maps to 1.0 leverage (Index hugger).";
      case ModelType.RANDOM_FOREST_MOCK:
        return "Logic: A sine-wave based synthetic signal to demonstrate active trading behavior and position scaling.";
      default:
        return "Standard Model Logic.";
    }
  };

  return (
    <div className="min-h-screen bg-background text-slate-200 font-sans selection:bg-primary selection:text-white">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-primary to-blue-600 rounded-lg shadow-lg shadow-primary/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Vibe Quant</h1>
              <p className="text-xs text-slate-500 font-medium">Excess Return & Volatility Lab</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <label className="flex items-center gap-2 cursor-pointer bg-surface hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg border border-slate-700 text-sm font-medium transition-all">
                <Upload className="w-4 h-4" />
                Upload CSV
                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
             </label>
             <button 
                onClick={handleRunBacktest}
                disabled={loading || data.length === 0}
                className="flex items-center gap-2 bg-primary hover:bg-cyan-400 text-background px-6 py-2 rounded-lg font-bold text-sm shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
             >
                {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Play className="w-4 h-4 fill-current" />}
                Run Simulation
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-12 gap-8">
        
        {/* Left Sidebar: Configuration */}
        <aside className="col-span-12 lg:col-span-3 space-y-6">
          <div className="bg-surface rounded-xl border border-slate-800 p-5 shadow-xl">
            <div className="flex items-center gap-2 mb-6 text-slate-200">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="font-bold">Configuration</h2>
            </div>
            
            <div className="space-y-1">
              <div className="mb-4">
                <label className="block text-slate-400 text-xs uppercase font-bold mb-2">Strategy Model</label>
                <select 
                  value={config.modelType}
                  onChange={(e) => setConfig({...config, modelType: e.target.value as ModelType})}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 text-sm focus:outline-none focus:border-primary"
                >
                  {Object.values(ModelType).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <p className="text-[10px] text-slate-500 mt-1 leading-tight">{renderModelExplainer()}</p>
              </div>

              <ConfigInput label="Initial Capital ($)" type="number" value={config.initialCapital} onChange={(v: number) => setConfig({...config, initialCapital: v})} />
              
              <div className="grid grid-cols-2 gap-2">
                 <ConfigInput label="Min Inv" type="number" value={config.minInvestment} onChange={(v: number) => setConfig({...config, minInvestment: v})} step={0.1} />
                 <ConfigInput label="Max Inv" type="number" value={config.maxInvestment} onChange={(v: number) => setConfig({...config, maxInvestment: v})} step={0.1} />
              </div>

              <div className="flex items-center justify-between mb-4 p-3 bg-slate-900 rounded border border-slate-700">
                <span className="text-sm font-medium">Vol Constraint (1.2x)</span>
                <input 
                  type="checkbox" 
                  checked={config.volatilityConstraint} 
                  onChange={e => setConfig({...config, volatilityConstraint: e.target.checked})}
                  className="w-4 h-4 accent-primary rounded cursor-pointer"
                />
              </div>

              <ConfigInput label="Test Start ID" type="number" value={config.testStartDate} onChange={(v: number) => setConfig({...config, testStartDate: v})} />
              <ConfigInput label="Test End ID" type="number" value={config.testEndDate} onChange={(v: number) => setConfig({...config, testEndDate: v})} />
              
              <ConfigInput label="Sensitivity (k)" type="number" value={config.mappingSensitivity} onChange={(v: number) => setConfig({...config, mappingSensitivity: v})} step={0.1} />
            </div>
          </div>
          
          {/* Gemini AI Panel */}
          <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-xl border border-slate-700 p-1 shadow-xl">
             <div className="p-4 rounded-lg bg-slate-900/50 h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-purple-400">
                    <BrainCircuit className="w-5 h-5" />
                    <h2 className="font-bold">AI Analyst</h2>
                  </div>
                  {results && (
                     <button 
                       onClick={handleAiAnalyze} 
                       disabled={analyzing}
                       className="text-xs bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-2 py-1 rounded border border-purple-500/30 transition-colors"
                     >
                       {analyzing ? 'Thinking...' : 'Vibe Check'}
                     </button>
                  )}
                </div>
                
                <div className="min-h-[150px] text-sm text-slate-400 leading-relaxed">
                   {aiAnalysis ? (
                     <div className="prose prose-invert prose-sm">
                       {aiAnalysis.split('\n').map((line, i) => <p key={i} className="mb-2">{line}</p>)}
                     </div>
                   ) : (
                     <p className="italic opacity-50 text-center mt-8">
                       Run a simulation and click "Vibe Check" to get a generative AI critique of your strategy.
                     </p>
                   )}
                </div>
             </div>
          </div>
        </aside>

        {/* Main Content: Charts & Stats */}
        <div className="col-span-12 lg:col-span-9 space-y-6">
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <StatCard 
               label="Adj Sharpe (Target)" 
               value={results ? results.stats.adjustedSharpe.toFixed(2) : "-"} 
               type={results && results.stats.adjustedSharpe > 1 ? 'good' : 'neutral'}
             />
             <StatCard 
               label="Total Return" 
               value={results ? `${(results.stats.totalReturn * 100).toFixed(1)}%` : "-"} 
               type={results && results.stats.totalReturn > 0 ? 'good' : 'bad'}
             />
             <StatCard 
               label="Volatility" 
               value={results ? `${(results.stats.volatility * 100).toFixed(1)}%` : "-"} 
             />
             <StatCard 
               label="Max Drawdown" 
               value={results ? `${(results.stats.maxDrawdown * 100).toFixed(1)}%` : "-"} 
               type="bad"
             />
          </div>

          {/* Visualization Panel */}
          <div className="bg-surface rounded-xl border border-slate-800 p-6 shadow-xl min-h-[500px] flex flex-col">
             <div className="flex items-center justify-between mb-6">
               <div className="flex gap-4">
                 <button 
                   onClick={() => setTab('equity')} 
                   className={`text-sm font-bold px-4 py-2 rounded-full transition-all ${tab === 'equity' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                 >
                   Equity Curve
                 </button>
                 <button 
                   onClick={() => setTab('drawdown')} 
                   className={`text-sm font-bold px-4 py-2 rounded-full transition-all ${tab === 'drawdown' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                 >
                   Drawdown
                 </button>
                 <button 
                   onClick={() => setTab('positions')} 
                   className={`text-sm font-bold px-4 py-2 rounded-full transition-all ${tab === 'positions' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}
                 >
                   Positions
                 </button>
                 <button 
                   onClick={() => setTab('log')} 
                   className={`text-sm font-bold px-4 py-2 rounded-full transition-all ${tab === 'log' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} flex items-center gap-2`}
                 >
                   <FileText className="w-3 h-3" />
                   Trade Log
                 </button>
                 <button 
                   onClick={() => setTab('data')} 
                   className={`text-sm font-bold px-4 py-2 rounded-full transition-all ${tab === 'data' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'} flex items-center gap-2`}
                 >
                   <Database className="w-3 h-3" />
                   Data
                 </button>
               </div>
               {results && tab !== 'data' && tab !== 'log' && <div className="text-xs text-slate-500 font-mono">N = {results.dailyResults.length} Days</div>}
             </div>

             <div className="w-full h-[500px]">
               {tab === 'data' && dataSummary ? (
                 <DataAnalysisView summary={dataSummary} />
               ) : tab === 'log' && results ? (
                 <TradeLogView results={results} />
               ) : results ? (
                 <ResponsiveContainer width="100%" height="100%">
                    {tab === 'equity' ? (
                      <LineChart data={chartData} key="equity">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                          formatter={(val: number) => [val.toFixed(2) + '%', '']}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="cum_mkt_pct" name="S&P 500" stroke="#64748b" strokeWidth={2} dot={showDots} isAnimationActive={false} />
                        <Line type="monotone" dataKey="cum_strat_pct" name="Vibe Strategy" stroke="#06b6d4" strokeWidth={2} dot={showDots} isAnimationActive={false} activeDot={{ r: 6 }} />
                      </LineChart>
                    ) : tab === 'drawdown' ? (
                      <AreaChart data={chartData} key="drawdown">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                        <YAxis stroke="#94a3b8" fontSize={10} />
                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                        <defs>
                          <linearGradient id="colorDd" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Area type="monotone" dataKey="drawdown_pct" name="Drawdown %" stroke="#f43f5e" fillOpacity={1} fill="url(#colorDd)" isAnimationActive={false} />
                      </AreaChart>
                    ) : (
                      <ComposedChart data={chartData} key="positions">
                         <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                         <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} />
                         <YAxis yAxisId="left" stroke="#94a3b8" fontSize={10} domain={[0, 2]} label={{ value: 'Position (x)', angle: -90, position: 'insideLeft', fontSize: 10 }}/>
                         <YAxis yAxisId="right" orientation="right" stroke="#64748b" fontSize={10} domain={[-1.5, 1.5]} hide/>
                         <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }} />
                         <Legend />
                         <Bar yAxisId="left" dataKey="position" name="Final Position" fill="#06b6d4" isAnimationActive={false} />
                         <Line yAxisId="right" type="monotone" dataKey="model_signal" name="Raw Signal" stroke="#a78bfa" strokeWidth={1} dot={false} isAnimationActive={false} />
                      </ComposedChart>
                    )}
                 </ResponsiveContainer>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-slate-500">
                    <TrendingUp className="w-16 h-16 mb-4 opacity-20" />
                    {results && results.dailyResults.length === 0 ? (
                      <div className="text-center text-rose-400">
                         <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                         <p>No data in the selected Date ID range ({config.testStartDate} - {config.testEndDate}).</p>
                         <p className="text-xs text-slate-500 mt-2">Adjust 'Test Start ID' in Configuration.</p>
                      </div>
                    ) : (
                       <p>Load data and run simulation to view results</p>
                    )}
                 </div>
               )}
             </div>
             {results && tab !== 'data' && tab !== 'log' && (
                <div className="text-center text-xs text-slate-500 mt-2 opacity-50">
                  Tip: Hover over chart points to see detailed metrics.
                </div>
             )}
          </div>
        </div>
      </main>
    </div>
  );
}