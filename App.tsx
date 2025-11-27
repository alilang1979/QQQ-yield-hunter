import React, { useState, useEffect } from 'react';
import { fetchMarketData, fetchVolatilityData } from './services/geminiService.ts';
import { fetchPolygonData, validateApiKey } from './services/polygonService.ts';
import { OptionRow, FetchStatus, VolatilityMetrics } from './types.ts';
import { calculateOptionMetrics, formatCurrency, getNextFriday } from './utils/calculations.ts';
import { OptionTable } from './components/OptionTable.tsx';
import { YieldChart } from './components/YieldChart.tsx';
import { VolatilityCard } from './components/VolatilityCard.tsx';
import { StrategyGuide } from './components/StrategyGuide.tsx';
import { 
  CircleNotch, 
  Plus, 
  MagnifyingGlass, 
  Warning, 
  Link as LinkIcon, 
  Info, 
  ChartLineUp, 
  Gear, 
  X, 
  Key, 
  CheckCircle, 
  WarningCircle, 
  CaretDown, 
  CaretUp, 
  BookOpen, 
  Stack, 
  Coins, 
  ArrowCounterClockwise, 
  Bug, 
  Code,
  Sparkle,
  TrendUp
} from '@phosphor-icons/react';

const QQQ_DEFAULT_PRICE = 500; // Fallback

// --- SKELETON COMPONENTS ---
const ChartSkeleton = () => (
  <div className="h-[400px] w-full bg-slate-900/50 p-4 rounded-xl border border-slate-800 animate-pulse flex flex-col">
    <div className="h-6 w-48 bg-slate-800 rounded mb-8"></div>
    <div className="flex-1 flex items-end justify-between gap-2 px-2">
        {[...Array(15)].map((_, i) => (
            <div 
              key={i} 
              className="w-full bg-slate-800/30 rounded-t" 
              style={{ height: `${Math.max(20, Math.random() * 80)}%` }}
            ></div>
        ))}
    </div>
    <div className="h-4 w-full bg-slate-800/50 rounded mt-2"></div>
  </div>
);

const TableSkeleton = () => (
  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50">
    {/* Header */}
    <div className="bg-slate-800 border-b border-slate-700 px-4 py-4 flex gap-4">
       {[...Array(6)].map((_, i) => <div key={i} className="h-4 bg-slate-700 rounded flex-1 hidden sm:block"></div>)}
       <div className="h-4 bg-slate-700 rounded w-20 ml-auto"></div>
    </div>
    {/* Rows */}
    {[...Array(5)].map((_, i) => (
      <div key={i} className="border-b border-slate-800 px-4 py-4 flex gap-4 animate-pulse items-center">
        <div className="h-5 w-16 bg-slate-800 rounded"></div> 
        <div className="h-5 flex-1 bg-slate-800/50 rounded hidden sm:block"></div> 
        <div className="h-5 flex-1 bg-slate-800/50 rounded hidden sm:block"></div> 
        <div className="h-5 flex-1 bg-slate-800/50 rounded"></div> 
        <div className="h-6 w-24 bg-emerald-900/20 rounded hidden sm:block"></div> 
        <div className="h-5 w-12 bg-slate-800 rounded ml-auto"></div> 
      </div>
    ))}
  </div>
);

export default function App() {
  const [status, setStatus] = useState<FetchStatus>(FetchStatus.IDLE);
  const [scanMessage, setScanMessage] = useState<string>("初始化...");
  const [targetDate, setTargetDate] = useState<string>(getNextFriday());
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [sources, setSources] = useState<Array<{uri: string, title: string}>>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");
  
  // Volatility State
  const [volMetrics, setVolMetrics] = useState<VolatilityMetrics | null>(null);
  const [isVolLoading, setIsVolLoading] = useState(false);

  // Settings & API Keys
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [polygonKey, setPolygonKey] = useState<string>("");
  const [geminiKey, setGeminiKey] = useState<string>("");
  
  // Strategy State
  const [strategy, setStrategy] = useState<'CSP' | 'PCS' | 'CC'>('CSP');
  const [stockCostBasis, setStockCostBasis] = useState<string>("");
  const [spreadWidth, setSpreadWidth] = useState<number>(5); // Default $5 width for Spread
  
  // Guide & Debug State
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [showDebug, setShowDebug] = useState<boolean>(false);

  // Verification State
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<{valid: boolean, msg?: string} | null>(null);

  // Manual Entry State
  const [manualStrike, setManualStrike] = useState<string>("");
  const [manualPremium, setManualPremium] = useState<string>("");

  // Load Keys on Mount
  useEffect(() => {
    const savedPoly = localStorage.getItem("polygon_api_key");
    const savedGemini = localStorage.getItem("gemini_api_key");
    
    if (savedPoly) setPolygonKey(savedPoly);
    if (savedGemini) setGeminiKey(savedGemini);

    // Don't auto-show settings, let the Hero section guide them.
  }, []);

  const handleSaveKey = (type: 'polygon' | 'gemini', val: string) => {
    if (type === 'polygon') {
        setPolygonKey(val);
        localStorage.setItem("polygon_api_key", val);
        setVerificationStatus(null); // Reset status on edit
    } else {
        setGeminiKey(val);
        localStorage.setItem("gemini_api_key", val);
    }
  };

  const handleTestKey = async () => {
    if (!polygonKey) return;
    setIsVerifying(true);
    setVerificationStatus(null);
    const result = await validateApiKey(polygonKey);
    setVerificationStatus({ valid: result.valid, msg: result.message });
    setIsVerifying(false);
  };

  const handleFetchData = async () => {
    setStatus(FetchStatus.LOADING);
    setErrorMsg("");
    setSources([]);
    setOptions([]); 
    setVolMetrics(null); // Reset Volatility
    
    // Determine Contract Type based on Strategy
    const contractType = strategy === 'CC' ? 'call' : 'put';
    
    try {
      let data;
      
      // --- PARALLEL FETCH: Volatility Data (VXN Index) ---
      // Requires Gemini Key
      if (geminiKey) {
          setIsVolLoading(true);
          fetchVolatilityData(geminiKey).then(metrics => {
              setVolMetrics(metrics);
              setIsVolLoading(false);
          }).catch(e => {
              console.warn("Vol fetch failed", e);
              setIsVolLoading(false);
          });
      }
      
      // STRATEGY 1: Polygon API
      if (polygonKey && polygonKey.length > 5) {
        setScanMessage("正在连接 Polygon 官方数据源...");
        try {
            data = await fetchPolygonData(polygonKey, targetDate, contractType);
        } catch (polyError: any) {
            console.error("Polygon failed, falling back...", polyError);
            const msg = polyError.message || "Unknown Error";
            
            // Don't throw immediately on auth error, try Gemini fallback
            if (!geminiKey) {
                throw new Error(`Polygon 错误: ${msg}. (未配置 Gemini Key，无法切换至 AI 搜索)`);
            }

            setErrorMsg(`Polygon API 警告: ${msg}. 正在尝试切换到 AI 搜索...`);
            setScanMessage("Polygon 连接失败，正在切换至 Gemini AI 搜索...");
            
            // Fallback to Gemini
            data = await fetchMarketData(targetDate, (msg) => setScanMessage(msg), contractType, geminiKey);
        }
      } 
      // STRATEGY 2: Gemini AI Search
      else {
        if (!geminiKey) {
            setErrorMsg("设置提示: 请在设置中输入 API Key (Polygon 或 Gemini)。");
            setStatus(FetchStatus.ERROR);
            setShowSettings(true);
            setIsVolLoading(false);
            return;
        }
        setScanMessage("正在连接 Gemini AI...");
        data = await fetchMarketData(targetDate, (msg) => setScanMessage(msg), contractType, geminiKey);
      }
      
      // Process Data
      if (data.currentPrice) {
        setCurrentPrice(data.currentPrice);
      }

      if (data.sources) {
        setSources(data.sources);
      }

      if (data.options && Array.isArray(data.options) && data.options.length > 0) {
        const basis = parseFloat(stockCostBasis) || 0;
        const newRows = data.options.map((opt) => 
          calculateOptionMetrics(opt.strike, opt.premium, targetDate, contractType, (opt as any).delta, basis)
        );
        
        setOptions(newRows);
        setStatus(FetchStatus.SUCCESS);
        if (errorMsg.includes("警告")) setErrorMsg(""); 
        
        // Auto-hide guide when data loads successfully to save space
        setShowGuide(false);
      } else {
        setStatus(FetchStatus.SUCCESS); 
        setErrorMsg("获取到价格，但未找到期权链数据。请尝试更换日期或手动输入。");
      }

    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "获取数据失败");
      setStatus(FetchStatus.ERROR);
      if (currentPrice === 0) setCurrentPrice(QQQ_DEFAULT_PRICE);
      if (err.message.includes("Key")) {
          setShowSettings(true);
      }
      setIsVolLoading(false);
    }
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const strike = parseFloat(manualStrike);
    const premium = parseFloat(manualPremium);
    const contractType = strategy === 'CC' ? 'call' : 'put';
    const basis = parseFloat(stockCostBasis) || 0;

    if (strike && premium && currentPrice) {
      const newRow = calculateOptionMetrics(strike, premium, targetDate, contractType, undefined, basis);
      if (!options.find(o => o.id === newRow.id)) {
          setOptions(prev => [...prev, newRow]);
      } else {
          alert("该行权价已存在");
      }
      setManualStrike("");
      setManualPremium("");
    }
  };

  const handleUpdateRow = (updated: OptionRow) => {
    setOptions(prev => prev.map(row => row.id === updated.id ? updated : row));
  };

  const handleDeleteRow = (id: string) => {
    setOptions(prev => prev.filter(row => row.id !== id));
  };

  // Determine Badge Color based on source
  const getSourceBadge = () => {
      const isSnapshot = sources.some(s => s.title.includes("Snapshot"));
      const isFree = sources.some(s => s.title.includes("Free Tier"));
      
      if (isSnapshot) return <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-2 py-0.5 rounded border border-emerald-500/30">Snapshot Mode (Full)</span>;
      if (isFree) return <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 rounded border border-amber-500/30">Free Tier Mode (Limited)</span>;
      return null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30 pb-20">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20 backdrop-blur-md bg-opacity-80">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 bg-gradient-to-br from-blue-600 to-emerald-600 rounded-lg flex items-center justify-center font-bold text-white text-lg shadow-lg shadow-blue-900/20">
              Q
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                QQQ Yield Hunter
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/30 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  PRO
                </span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
             {currentPrice > 0 && (
                 <div className="text-right hidden sm:block animate-in fade-in">
                     <p className="text-[10px] text-slate-400 uppercase tracking-wider">QQQ Price</p>
                     <p className="text-xl font-mono font-bold text-white leading-none">
                       {formatCurrency(currentPrice)}
                     </p>
                 </div>
             )}
             <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${showSettings || (!polygonKey && !geminiKey) ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-600'}`}
             >
                <Gear size={18} weight={showSettings ? "fill" : "regular"} />
                <span className="text-xs font-medium hidden sm:inline">Settings</span>
             </button>
          </div>
        </div>
      </header>

      {/* Hero / Welcome Section (Only show if no data loaded yet) */}
      {status === FetchStatus.IDLE && options.length === 0 && (
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 border-b border-slate-800 py-12 px-4">
              <div className="max-w-3xl mx-auto text-center space-y-4">
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-emerald-400 to-purple-400">
                      让您的闲置资金为您“打工”
                  </h2>
                  <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                      专为美股期权卖方 (Wheel Strategy) 打造的收益分析工具。
                      实时计算 Cash-Secured Put 和 Credit Spread 的年化回报率，助您发现纳斯达克 (QQQ) 的最佳入场点。
                  </p>
              </div>
          </div>
      )}

      {/* Settings Panel Modal */}
      {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-slate-800 flex justify-between items-center sticky top-0 bg-slate-900 z-10">
                      <div>
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                           <Key size={24} className="text-blue-400"/> 
                           API 配置 (Settings)
                        </h2>
                      </div>
                      <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-800 rounded"><X size={24}/></button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      <p className="text-sm text-slate-400">为了获取实时期权链数据，您需要配置 API Key。Key 仅保存在您的本地浏览器中，不会上传服务器。</p>

                      {/* Polygon Section */}
                      <div className="bg-slate-950 p-5 rounded-xl border border-blue-900/30 shadow-inner">
                          <label className="block text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              Polygon.io API Key (推荐)
                          </label>
                          <div className="flex flex-col sm:flex-row gap-3">
                              <input 
                                type="text" 
                                value={polygonKey}
                                onChange={(e) => handleSaveKey('polygon', e.target.value)}
                                placeholder="例如: Vc2_xxxxxxxxxxxxxxxxxxxx"
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-blue-500 outline-none font-mono text-sm shadow-inner"
                              />
                              <button 
                                 onClick={handleTestKey}
                                 disabled={isVerifying || !polygonKey}
                                 className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap"
                              >
                                 {isVerifying ? <CircleNotch className="animate-spin"/> : "测试 Key"}
                              </button>
                          </div>
                          
                          {verificationStatus && (
                             <div className={`mt-3 p-2 rounded text-sm flex items-center gap-2 ${verificationStatus.valid ? 'bg-emerald-900/20 text-emerald-400' : 'bg-red-900/20 text-red-400'}`}>
                                {verificationStatus.valid ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}
                                <span>{verificationStatus.valid ? "验证成功！API Key 有效。" : verificationStatus.msg || "Key 无效"}</span>
                             </div>
                          )}

                          <div className="mt-3 text-xs text-slate-500">
                             没有 Key? 前往 <a href="https://polygon.io" target="_blank" className="text-blue-400 hover:underline">polygon.io</a> 注册免费账号 (Free Tier 每日 5 次请求)。
                          </div>
                      </div>

                      {/* Gemini Section */}
                      <div className="bg-slate-950 p-5 rounded-xl border border-purple-900/30 shadow-inner">
                          <label className="block text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                             Gemini API Key (备用/AI 搜索)
                          </label>
                          <div className="flex flex-col sm:flex-row gap-3">
                              <input 
                                type="password"
                                value={geminiKey}
                                onChange={(e) => handleSaveKey('gemini', e.target.value)}
                                placeholder="例如: AIzaSy..."
                                className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-purple-500 outline-none font-mono text-sm shadow-inner"
                              />
                          </div>
                          <div className="mt-3 text-xs text-slate-500">
                             免费获取 Key: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-purple-400 hover:underline">Google AI Studio</a>。
                             用于获取 VXN 波动率指数及作为 Polygon 的备用搜索源。
                          </div>
                      </div>
                  </div>
                  
                  <div className="p-6 border-t border-slate-800 flex justify-end bg-slate-900 rounded-b-2xl">
                     <button 
                        onClick={() => setShowSettings(false)}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors shadow-lg shadow-emerald-900/20"
                     >
                        保存并关闭
                     </button>
                  </div>
             </div>
          </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        
        {/* Top Section: Volatility & Guide Toggle */}
        <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
                 <VolatilityCard metrics={volMetrics} isLoading={isVolLoading} />
            </div>
            <div className="flex flex-col gap-4">
                 <button 
                    onClick={() => setShowGuide(!showGuide)}
                    className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl p-4 flex items-center justify-between group transition-all"
                 >
                     <div className="flex items-center gap-3">
                         <div className="p-2 bg-blue-900/20 rounded-lg text-blue-400 group-hover:bg-blue-900/30 transition-colors">
                             <BookOpen size={24}/>
                         </div>
                         <div className="text-left">
                             <div className="font-bold text-slate-200">新手指南 & 策略</div>
                             <div className="text-xs text-slate-500">查看教程、术语表</div>
                         </div>
                     </div>
                     {showGuide ? <CaretUp size={20} className="text-slate-500"/> : <CaretDown size={20} className="text-slate-500"/>}
                 </button>
                 
                 {/* Status Indicator Panel */}
                 <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col justify-center">
                      <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold text-slate-500 uppercase">System Status</span>
                          <span className={`h-2 w-2 rounded-full ${polygonKey || geminiKey ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 animate-pulse'}`}></span>
                      </div>
                      <div className="text-sm text-slate-300">
                          {polygonKey ? "Polygon API 就绪" : geminiKey ? "Gemini AI 就绪" : "未配置数据源"}
                      </div>
                 </div>
            </div>
        </div>

        {/* Collapsible Strategy Guide */}
        {showGuide && <StrategyGuide />}

        {/* Controls Section */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-1 shadow-sm overflow-hidden">
             {/* Strategy Selector Tab Bar */}
             <div className="flex border-b border-slate-800 bg-slate-950/30 overflow-x-auto">
                <button 
                    onClick={() => setStrategy('CSP')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap
                        ${strategy === 'CSP' ? 'text-emerald-400 bg-slate-800/50 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Coins size={16} /> Cash-Secured Put
                </button>
                <button 
                    onClick={() => setStrategy('PCS')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap
                        ${strategy === 'PCS' ? 'text-blue-400 bg-slate-800/50 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Stack size={16} /> Put Credit Spread
                </button>
                <button 
                    onClick={() => setStrategy('CC')}
                    className={`flex-1 py-3 px-4 text-sm font-semibold flex items-center justify-center gap-2 transition-all whitespace-nowrap
                        ${strategy === 'CC' ? 'text-purple-400 bg-slate-800/50 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <ArrowCounterClockwise size={16} /> Covered Call
                </button>
             </div>

             <div className="p-6 grid lg:grid-cols-4 gap-6">
                {/* Left: Input Controls */}
                <div className="lg:col-span-3 space-y-5">
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                到期日 (Expiration)
                            </label>
                            <input 
                                type="date" 
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all font-mono"
                            />
                        </div>

                        {/* Conditional Inputs */}
                        {strategy === 'PCS' && (
                            <div className="sm:w-40 animate-in fade-in slide-in-from-left-2">
                                <label className="block text-xs font-bold text-blue-500 uppercase tracking-wider mb-1.5">价差宽度 ($)</label>
                                <select 
                                    value={spreadWidth}
                                    onChange={(e) => setSpreadWidth(Number(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-3 text-white outline-none focus:border-blue-500 font-mono"
                                >
                                    <option value={1}>$1</option>
                                    <option value={5}>$5 (Standard)</option>
                                    <option value={10}>$10 (Recommended)</option>
                                    <option value={25}>$25</option>
                                </select>
                            </div>
                        )}

                        {strategy === 'CC' && (
                            <div className="sm:w-48 animate-in fade-in slide-in-from-left-2">
                                <label className="block text-xs font-bold text-purple-500 uppercase tracking-wider mb-1.5">持仓成本 ($)</label>
                                <input 
                                    type="number"
                                    value={stockCostBasis}
                                    onChange={(e) => setStockCostBasis(e.target.value)}
                                    placeholder="e.g. 495.50"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-purple-500 font-mono"
                                />
                            </div>
                        )}
                        
                        <div className="sm:w-auto flex items-end">
                             <button 
                                onClick={handleFetchData}
                                disabled={status === FetchStatus.LOADING}
                                className={`w-full sm:w-auto h-[46px] px-8 rounded-lg font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap
                                    ${status === FetchStatus.LOADING 
                                        ? 'bg-slate-700 cursor-not-allowed' 
                                        : polygonKey 
                                            ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-emerald-900/20' 
                                            : 'bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-blue-900/20'}`}
                            >
                                {status === FetchStatus.LOADING ? (
                                    <><CircleNotch size={20} className="animate-spin" /> {scanMessage}</>
                                ) : (
                                    <><MagnifyingGlass size={20} weight="bold"/> {polygonKey ? "获取数据" : "AI 搜索"}</>
                                )}
                            </button>
                        </div>
                    </div>
                    
                    {errorMsg && (
                        <div className={`p-3 rounded-lg text-sm flex items-start gap-2 ${errorMsg.includes("警告") ? "bg-yellow-900/20 border border-yellow-900/50 text-yellow-400" : "bg-red-900/20 border border-red-900/50 text-red-400"}`}>
                            {errorMsg.includes("警告") ? <Warning size={18} className="shrink-0 mt-0.5" /> : <WarningCircle size={18} className="shrink-0 mt-0.5" />}
                            <span>{errorMsg}</span>
                        </div>
                    )}
                </div>

                {/* Right: Manual Add (Compact) */}
                <div className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-800 pt-4 lg:pt-0 lg:pl-6 flex flex-col justify-center">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                        <Plus size={12}/> 手动补录数据
                    </h4>
                    <form onSubmit={handleAddManual} className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-2">
                            <input 
                                type="number" step="0.01" placeholder="Strike" 
                                value={manualStrike} onChange={(e) => setManualStrike(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-slate-500 outline-none"
                            />
                            <input 
                                type="number" step="0.01" placeholder="Premium" 
                                value={manualPremium} onChange={(e) => setManualPremium(e.target.value)}
                                className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-slate-500 outline-none"
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={!currentPrice}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded transition-colors border border-slate-700"
                        >
                            添加
                        </button>
                    </form>
                </div>
             </div>
        </section>

        {/* Visualization */}
        {(status === FetchStatus.LOADING || options.length > 0) && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {status === FetchStatus.LOADING ? (
                    <ChartSkeleton />
                ) : (
                    <YieldChart 
                        data={options} 
                        currentPrice={currentPrice} 
                        strategy={strategy} 
                        spreadWidth={spreadWidth} // Pass width to chart
                    />
                )}
            </section>
        )}

        {/* Data Table */}
        <section className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <TrendUp size={24} className="text-emerald-500"/>
                    期权链分析 (Analysis)
                 </h3>
                 {status !== FetchStatus.LOADING && options.length > 0 && (
                     <span className="text-xs font-mono text-emerald-400 bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-900/50">
                         {options.length} Contracts Loaded
                     </span>
                 )}
            </div>
            
            {status === FetchStatus.LOADING ? (
                <TableSkeleton />
            ) : (
                <OptionTable 
                    data={options} 
                    currentPrice={currentPrice} 
                    onUpdateRow={handleUpdateRow}
                    onDeleteRow={handleDeleteRow}
                    strategy={strategy}
                    spreadWidth={spreadWidth} // Pass width to table logic
                    costBasis={parseFloat(stockCostBasis)}
                />
            )}
        </section>
        
        {/* Debug Console */}
        {showDebug && options.length > 0 && (
            <section className="bg-slate-950 border border-slate-800 p-4 rounded-lg overflow-x-auto shadow-inner">
                <h4 className="text-emerald-400 font-mono font-bold mb-3 flex items-center gap-2">
                    <Code size={16}/> 
                    Raw Data Inspector (Debug)
                </h4>
                <div className="mb-2 font-mono text-xs text-slate-400">Underlying Price: ${currentPrice}</div>
                
                <table className="w-full text-left font-mono text-xs text-slate-300">
                    <thead className="bg-slate-900 border-b border-slate-800">
                        <tr>
                            <th className="p-2">Strike</th>
                            <th className="p-2">Premium</th>
                            <th className="p-2 text-blue-400">Delta</th>
                            <th className="p-2 text-purple-400">IV</th>
                            <th className="p-2 text-emerald-400">WinRate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {options.map((o, idx) => (
                            <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                                <td className="p-2">${o.strike.toFixed(2)}</td>
                                <td className="p-2">${o.premium.toFixed(2)}</td>
                                <td className="p-2 text-blue-300">
                                    {(o as any).delta !== undefined ? (o as any).delta : '-'}
                                </td>
                                <td className="p-2 text-purple-300">
                                    {(o as any).iv !== undefined ? (o as any).iv : '-'}
                                </td>
                                <td className="p-2 text-emerald-300">
                                    {o.winRate !== undefined ? `${o.winRate.toFixed(2)}%` : 'N/A'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        )}
        
        {/* Source Footer */}
        {sources.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs text-slate-500 border-t border-slate-800 pt-4">
                <div className="flex flex-wrap gap-2 items-center">
                    <p className="font-semibold flex items-center gap-1">
                        <LinkIcon size={12} /> Data Sources:
                    </p>
                    {getSourceBadge()}
                    {sources.map((s, i) => (
                    <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" 
                        className="hover:text-blue-400 hover:underline truncate max-w-[200px]">
                        {s.title || "Web Result"}
                    </a>
                    ))}
                </div>
                <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className="hover:text-slate-300 flex items-center gap-1"
                >
                    <Bug size={12}/> Debug Mode
                </button>
            </div>
        )}

      </main>

      <footer className="border-t border-slate-900 mt-12 py-10 bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 text-center">
              <div className="flex justify-center gap-4 mb-4">
                  <div className="h-8 w-8 bg-slate-900 rounded-full flex items-center justify-center text-slate-600"><Coins size={16}/></div>
                  <div className="h-8 w-8 bg-slate-900 rounded-full flex items-center justify-center text-slate-600"><TrendUp size={16}/></div>
              </div>
              <p className="text-slate-500 text-sm mb-2">
                  <strong>QQQ Yield Hunter</strong> - 您的美股期权卖方策略助手
              </p>
              <p className="text-slate-600 text-xs max-w-2xl mx-auto leading-relaxed">
                  免责声明：本应用仅供信息参考和教育目的，不构成任何投资建议。
                  期权交易涉及重大风险，可能导致部分或全部资金损失。年化收益率计算基于理论模型，未包含佣金、滑点或税务影响。
                  请在交易前咨询专业财务顾问。
              </p>
              <div className="mt-6 text-[10px] text-slate-700 font-mono">
                  v1.5.0 • Powered by React, Recharts & Google Gemini
              </div>
          </div>
      </footer>
    </div>
  );
}
