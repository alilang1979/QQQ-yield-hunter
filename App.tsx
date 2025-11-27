import React, { useState, useEffect } from 'react';
import { fetchMarketData, fetchVolatilityData } from './services/geminiService.ts';
import { fetchPolygonData, validateApiKey } from './services/polygonService.ts';
import { OptionRow, FetchStatus, VolatilityMetrics } from './types.ts';
import { calculateOptionMetrics, formatCurrency, getNextFriday } from './utils/calculations.ts';
import { OptionTable } from './components/OptionTable.tsx';
import { YieldChart } from './components/YieldChart.tsx';
import { VolatilityCard } from './components/VolatilityCard.tsx';
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
  Sparkle
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

    if (!savedPoly && !savedGemini) {
        setShowSettings(true);
    }
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
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center font-bold text-white text-xl shadow-lg shadow-blue-900/20">
              Q
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-3">
                <span>QQQ Yield Hunter</span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/30 px-2 py-1 rounded-md border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                  v1.3
                </span>
              </h1>
              <p className="text-xs text-slate-400">Cash-Secured Put & Credit Spread 分析工具</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
             <div className="text-right hidden sm:block">
                 <p className="text-[10px] text-slate-400 uppercase tracking-wider">QQQ 当前价格</p>
                 {status === FetchStatus.LOADING && currentPrice === 0 ? (
                     <div className="h-6 w-24 bg-slate-800 animate-pulse rounded mt-1"></div>
                 ) : (
                     <p className="text-2xl font-mono font-bold text-white">
                       {currentPrice > 0 ? formatCurrency(currentPrice) : "---"}
                     </p>
                 )}
             </div>
             <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-full transition-colors ${showSettings || (!polygonKey && !geminiKey) ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                title="设置 / API Key"
             >
                <Gear size={24} weight={showSettings ? "fill" : "regular"} />
             </button>
          </div>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
          <div className="bg-slate-900 border-b border-slate-800 animate-in slide-in-from-top-2 duration-200 shadow-2xl">
              <div className="max-w-7xl mx-auto px-4 py-8">
                  <div className="flex justify-between items-start mb-6">
                      <div>
                        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                           <Key size={24} className="text-blue-400"/> 
                           API 配置 (Settings)
                        </h2>
                        <p className="text-sm text-slate-400 mt-1">输入 API Key 以获取实时数据。Key 仅保存在您的本地浏览器中。</p>
                      </div>
                      <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white p-1 hover:bg-slate-800 rounded"><X size={24}/></button>
                  </div>
                  
                  {/* Polygon Section */}
                  <div className="bg-slate-950 p-6 rounded-xl border border-blue-900/30 max-w-3xl shadow-inner mb-6">
                      <label className="block text-sm font-bold text-blue-400 mb-3">Polygon.io API Key (数据首选)</label>
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

                      <div className="mt-4 flex flex-col sm:flex-row gap-4 text-xs text-slate-500 items-start sm:items-center bg-slate-900/50 p-3 rounded border border-slate-800">
                          <Info size={24} className="text-blue-500 shrink-0" />
                          <span>
                            <strong>没有 Key?</strong> 注册 <a href="https://polygon.io" target="_blank" className="text-blue-400 hover:underline font-medium">polygon.io</a> 免费账号。
                            推荐使用 Polygon 获取精准期权链。
                          </span>
                      </div>
                  </div>

                  {/* Gemini Section */}
                  <div className="bg-slate-950 p-6 rounded-xl border border-purple-900/30 max-w-3xl shadow-inner">
                      <label className="block text-sm font-bold text-purple-400 mb-3 flex items-center gap-2">
                        <Sparkle size={16} weight="fill"/>
                        Gemini API Key (AI 搜索 & 波动率)
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

                      <div className="mt-4 flex flex-col sm:flex-row gap-4 text-xs text-slate-500 items-start sm:items-center bg-slate-900/50 p-3 rounded border border-slate-800">
                          <Info size={24} className="text-purple-500 shrink-0" />
                          <span>
                            <strong>免费获取 Key:</strong> 前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-purple-400 hover:underline font-medium">Google AI Studio</a>。
                            如果没有 Polygon Key，系统将使用 Gemini 搜索全网数据（可能会有偶发性误差）。
                          </span>
                      </div>
                  </div>
                  
                  <div className="mt-6 flex justify-end">
                     <button 
                        onClick={() => setShowSettings(false)}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors shadow-lg shadow-blue-900/20"
                     >
                        完成设置
                     </button>
                  </div>
              </div>
          </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        
        {/* Volatility & Timing Assistant */}
        <VolatilityCard metrics={volMetrics} isLoading={isVolLoading} />
        
        {/* Guide Section (Collapsible) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
             <button 
                onClick={() => setShowGuide(!showGuide)}
                className="w-full px-6 py-4 flex items-center justify-between bg-slate-900 hover:bg-slate-800 transition-colors"
             >
                 <div className="flex items-center gap-2 font-semibold text-slate-200">
                     <BookOpen size={20} className="text-purple-400"/>
                     新手指南：关于数据与策略
                 </div>
                 {showGuide ? <CaretUp size={16}/> : <CaretDown size={16}/>}
             </button>
             
             {showGuide && (
                 <div className="p-6 grid md:grid-cols-2 gap-8 text-sm text-slate-400 bg-slate-900/30">
                     <div>
                         <h3 className="text-slate-200 font-bold mb-2">取数逻辑 (API Logic)</h3>
                         <ul className="space-y-2 list-disc list-inside">
                             <li>
                                 <strong className="text-emerald-400">Snapshot 模式 (推荐):</strong> 
                                 配置 Polygon API Key 后，直接拉取整个期权链。数据全、速度快、包含 Greeks。
                             </li>
                             <li>
                                 <strong className="text-purple-400">AI 搜索模式:</strong> 
                                 配置 Gemini API Key 后，使用 Google Search 寻找期权数据。作为 Polygon 的免费替代方案。
                             </li>
                         </ul>
                     </div>
                     <div>
                         <h3 className="text-slate-200 font-bold mb-2">策略说明 (Strategy)</h3>
                         <div className="space-y-4">
                             <div>
                                 <strong className="text-emerald-400 block mb-1">1. Cash-Secured Put (CSP):</strong>
                                 <p className="mb-1">准备全额现金，卖出 Put。适合想赚利息或低价抄底的投资者。</p>
                             </div>
                             <div>
                                 <strong className="text-blue-400 block mb-1">2. Put Credit Spread (PCS):</strong>
                                 <p className="mb-1">卖出高价 Put，买入低价 Put 保护。最大亏损被锁定在“价差宽度”内，资金利用率高。</p>
                             </div>
                             <div>
                                 <strong className="text-purple-400 block mb-1">3. Covered Call (CC):</strong>
                                 <p className="mb-1">持有 100 股正股，卖出 Call。适合被套牢后赚取额外利息解套，或长期持仓增强收益。</p>
                             </div>
                         </div>
                     </div>
                 </div>
             )}
        </div>

        {/* Controls Section */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Search Card */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                        <MagnifyingGlass size={20} className="text-blue-400" />
                        行情与策略 (Setup)
                    </h2>
                    
                    {/* Strategy Switcher */}
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                        <button 
                            onClick={() => setStrategy('CSP')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${strategy === 'CSP' ? 'bg-emerald-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Coins size={14} /> CSP
                        </button>
                        <button 
                            onClick={() => setStrategy('PCS')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${strategy === 'PCS' ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <Stack size={14} /> Spread
                        </button>
                        <button 
                            onClick={() => setStrategy('CC')}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 transition-all ${strategy === 'CC' ? 'bg-purple-600 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            <ArrowCounterClockwise size={14} /> Covered Call
                        </button>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="block text-sm font-medium text-slate-400 mb-1">选择到期日 (Expiration)</label>
                            <input 
                                type="date" 
                                value={targetDate}
                                onChange={(e) => setTargetDate(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        {/* Extra Input: Spread Width (Only for PCS) */}
                        {strategy === 'PCS' && (
                            <div className="w-full sm:w-32 animate-in fade-in slide-in-from-left-2">
                                <label className="block text-sm font-medium text-blue-400 mb-1">价差宽度</label>
                                <select 
                                    value={spreadWidth}
                                    onChange={(e) => setSpreadWidth(Number(e.target.value))}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2.5 text-white outline-none focus:border-blue-500"
                                >
                                    <option value={1}>$1 (极窄)</option>
                                    <option value={5}>$5 (标准)</option>
                                    <option value={10}>$10 (推荐)</option>
                                    <option value={25}>$25 (宽距)</option>
                                </select>
                            </div>
                        )}

                        {/* Extra Input: Cost Basis (Only for CC) */}
                        {strategy === 'CC' && (
                            <div className="w-full sm:w-40 animate-in fade-in slide-in-from-left-2">
                                <label className="block text-sm font-medium text-purple-400 mb-1">持仓成本 ($)</label>
                                <input 
                                    type="number"
                                    value={stockCostBasis}
                                    onChange={(e) => setStockCostBasis(e.target.value)}
                                    placeholder="例如: 495"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-white outline-none focus:border-purple-500"
                                />
                            </div>
                        )}

                        <button 
                            onClick={handleFetchData}
                            disabled={status === FetchStatus.LOADING}
                            className={`px-6 py-2.5 rounded-lg font-semibold text-white shadow-lg transition-all flex items-center justify-center gap-2 min-w-[160px] sm:min-w-[200px]
                                ${status === FetchStatus.LOADING 
                                    ? 'bg-slate-700 cursor-not-allowed' 
                                    : polygonKey 
                                        ? 'bg-emerald-600 hover:bg-emerald-500 active:scale-95 shadow-emerald-900/20' 
                                        : 'bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-blue-900/20'}`}
                        >
                            {status === FetchStatus.LOADING ? (
                                <><CircleNotch size={20} className="animate-spin" /> {scanMessage}</>
                            ) : (
                                <><ChartLineUp size={20} /> {polygonKey ? "获取数据" : "AI 搜索"}</>
                            )}
                        </button>
                    </div>
                </div>
                
                {/* Status / Error Messages */}
                {errorMsg && (
                    <div className={`mt-4 p-3 rounded-lg text-sm flex items-start gap-2 ${errorMsg.includes("警告") ? "bg-yellow-900/20 border border-yellow-900/50 text-yellow-400" : "bg-red-900/20 border border-red-900/50 text-red-400"}`}>
                        {errorMsg.includes("警告") ? <Warning size={18} className="shrink-0 mt-0.5" /> : <WarningCircle size={18} className="shrink-0 mt-0.5" />}
                        <span>{errorMsg}</span>
                    </div>
                )}
                
                <div className="mt-auto">
                    {sources.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                            <div className="flex flex-wrap gap-2 items-center">
                                <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                                    <LinkIcon size={12} /> 来源:
                                </p>
                                {getSourceBadge()}
                                {sources.map((s, i) => (
                                <a key={i} href={s.uri} target="_blank" rel="noopener noreferrer" 
                                    className="px-2 py-1 rounded bg-slate-800 text-[10px] text-blue-400 hover:text-blue-300 hover:bg-slate-700 transition-colors truncate max-w-[150px] border border-slate-700">
                                    {s.title || "Web Result"}
                                </a>
                                ))}
                            </div>
                            
                            <button 
                                onClick={() => setShowDebug(!showDebug)}
                                className="text-[10px] text-slate-600 hover:text-slate-400 flex items-center gap-1"
                            >
                                <Bug size={12}/> {showDebug ? "隐藏调试" : "查看原始数据"}
                            </button>
                        </div>
                    )}
                    
                    {!polygonKey && !geminiKey && (
                        <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                            <Info size={12} className="inline mr-1"/>
                            <strong>提示:</strong> 请配置 API Key 以开始使用。
                        </p>
                    )}
                </div>
            </div>

            {/* Manual Entry Card */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm">
                 <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Plus size={20} className="text-emerald-400" />
                    手动添加 (Manual)
                </h2>
                <form onSubmit={handleAddManual} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">行权价 (Strike $)</label>
                        <input 
                            type="number" 
                            step="0.01"
                            placeholder="例如: 490"
                            value={manualStrike}
                            onChange={(e) => setManualStrike(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">权利金 (Premium $)</label>
                        <input 
                            type="number" 
                            step="0.01"
                            placeholder="例如: 2.50"
                            value={manualPremium}
                            onChange={(e) => setManualPremium(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-emerald-500 outline-none"
                        />
                    </div>
                    <button 
                        type="submit"
                        disabled={!currentPrice}
                        className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 font-medium rounded-lg transition-colors border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        添加数据行
                    </button>
                    {!currentPrice && <p className="text-xs text-slate-500 text-center">请先获取 QQQ 价格</p>}
                </form>
            </div>
        </section>

        {/* Visualization */}
        {(status === FetchStatus.LOADING || options.length > 0) && (
            <section>
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
        <section>
            <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xl font-bold text-white">期权链详情 (Option Chain)</h3>
                 {status !== FetchStatus.LOADING && options.length > 0 && (
                     <span className="text-sm text-emerald-400 bg-emerald-900/20 px-3 py-1 rounded-full border border-emerald-900/50">
                         找到 {options.length} 个合约
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
                            <th className="p-2 text-blue-400">Delta (Greeks)</th>
                            <th className="p-2 text-purple-400">IV (Vol)</th>
                            <th className="p-2 text-emerald-400">Calc WinRate</th>
                        </tr>
                    </thead>
                    <tbody>
                        {options.map((o, idx) => (
                            <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                                <td className="p-2">${o.strike.toFixed(2)}</td>
                                <td className="p-2">${o.premium.toFixed(2)}</td>
                                <td className="p-2 text-blue-300">
                                    {(o as any).delta !== undefined ? (o as any).delta : <span className="text-slate-600">undefined</span>}
                                </td>
                                <td className="p-2 text-purple-300">
                                    {(o as any).iv !== undefined ? (o as any).iv : <span className="text-slate-600">undefined</span>}
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

      </main>

      <footer className="border-t border-slate-900 mt-12 py-8 bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 text-center text-slate-600 text-xs">
              <p className="mb-2">免责声明：本应用仅供信息参考和教育目的，不构成投资建议。</p>
              <p>期权交易涉及重大风险。年化收益率计算假设期权到期归零，并未包含交易佣金、税费或保证金要求。AI 搜索提供的数据可能存在延迟或误差。</p>
          </div>
      </footer>
    </div>
  );
}