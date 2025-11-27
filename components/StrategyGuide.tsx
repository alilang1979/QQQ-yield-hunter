import React, { useState } from 'react';
import { 
  BookOpen, 
  Lightbulb, 
  TrendUp, 
  ShieldCheck, 
  Info, 
  CaretRight, 
  NumberCircleOne,
  NumberCircleTwo,
  NumberCircleThree,
  Student
} from '@phosphor-icons/react';

export const StrategyGuide: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'start' | 'strategies' | 'glossary'>('start');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl mb-8">
      {/* Header Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/50">
        <button 
          onClick={() => setActiveTab('start')}
          className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'start' ? 'text-blue-400 bg-slate-800/50 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Lightbulb size={18}/> 快速入门 (Start)
        </button>
        <button 
          onClick={() => setActiveTab('strategies')}
          className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'strategies' ? 'text-emerald-400 bg-slate-800/50 border-b-2 border-emerald-500' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <TrendUp size={18}/> 策略详解 (Strategies)
        </button>
        <button 
          onClick={() => setActiveTab('glossary')}
          className={`flex-1 py-4 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${activeTab === 'glossary' ? 'text-purple-400 bg-slate-800/50 border-b-2 border-purple-500' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Student size={18}/> 术语字典 (Glossary)
        </button>
      </div>

      <div className="p-6 bg-slate-900/40 min-h-[300px]">
        
        {/* TAB 1: QUICK START */}
        {activeTab === 'start' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-left-4">
             <div className="flex items-start gap-4">
                <NumberCircleOne size={32} className="text-blue-500 shrink-0" weight="fill" />
                <div>
                  <h3 className="text-slate-200 font-bold text-lg">配置 API Key (数据源)</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    点击右上角的 <span className="inline-block bg-slate-800 px-1.5 rounded text-xs border border-slate-700">⚙️ 设置</span> 按钮。
                    推荐使用 <strong>Polygon.io</strong> (提供精准的实时期权链快照)。如果没有，可以使用 Google Gemini 进行 AI 搜索 (Free Mode)。
                  </p>
                </div>
             </div>

             <div className="flex items-start gap-4">
                <NumberCircleTwo size={32} className="text-blue-500 shrink-0" weight="fill" />
                <div>
                  <h3 className="text-slate-200 font-bold text-lg">选择策略与日期</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    在控制面板选择您的目标策略 (如 CSP)。选择一个<strong>周五</strong>作为到期日 (通常 30-45 天后的期权流动性最好，时间价值衰减最快)。
                  </p>
                </div>
             </div>

             <div className="flex items-start gap-4">
                <NumberCircleThree size={32} className="text-blue-500 shrink-0" weight="fill" />
                <div>
                  <h3 className="text-slate-200 font-bold text-lg">分析与执行</h3>
                  <p className="text-slate-400 text-sm mt-1">
                    点击“获取数据”。系统会计算每个行权价的<strong>年化收益率</strong>和<strong>胜率</strong>。
                    寻找年化收益率 > 15% 且 胜率 > 80% 的机会。
                  </p>
                </div>
             </div>
          </div>
        )}

        {/* TAB 2: STRATEGIES */}
        {activeTab === 'strategies' && (
          <div className="grid md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4">
             {/* CSP */}
             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="text-emerald-400 font-bold text-lg mb-2 flex items-center gap-2">
                   1. Cash-Secured Put
                </h3>
                <div className="text-xs text-slate-500 mb-3 bg-slate-900 p-2 rounded">
                   <strong>核心逻辑:</strong> 想在 $480 买入 QQQ，但现在价格是 $500？卖出 $480 的 Put，立刻拿钱等待。
                </div>
                <ul className="text-sm text-slate-300 space-y-2">
                   <li className="flex gap-2"><CaretRight className="text-emerald-500 shrink-0 mt-0.5"/> <span><strong>收益:</strong> 赚取权利金 (Premium)。</span></li>
                   <li className="flex gap-2"><CaretRight className="text-emerald-500 shrink-0 mt-0.5"/> <span><strong>风险:</strong> 若股价跌破行权价，必须以原价接盘。</span></li>
                   <li className="flex gap-2"><CaretRight className="text-emerald-500 shrink-0 mt-0.5"/> <span><strong>资金:</strong> 需 100% 现金担保 (Strike x 100)。</span></li>
                </ul>
             </div>

             {/* PCS */}
             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="text-blue-400 font-bold text-lg mb-2 flex items-center gap-2">
                   2. Put Credit Spread
                </h3>
                <div className="text-xs text-slate-500 mb-3 bg-slate-900 p-2 rounded">
                   <strong>核心逻辑:</strong> 卖出一个 Put (赚钱)，同时买入一个更低价的 Put (买保险)。锁定最大亏损。
                </div>
                <ul className="text-sm text-slate-300 space-y-2">
                   <li className="flex gap-2"><CaretRight className="text-blue-500 shrink-0 mt-0.5"/> <span><strong>收益:</strong> 两者权利金差价 (Net Credit)。</span></li>
                   <li className="flex gap-2"><CaretRight className="text-blue-500 shrink-0 mt-0.5"/> <span><strong>风险:</strong> 也就是价差宽度减去权利金。</span></li>
                   <li className="flex gap-2"><CaretRight className="text-blue-500 shrink-0 mt-0.5"/> <span><strong>资金:</strong> 仅需价差宽度的保证金，资金利用率极高。</span></li>
                </ul>
             </div>

             {/* CC */}
             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <h3 className="text-purple-400 font-bold text-lg mb-2 flex items-center gap-2">
                   3. Covered Call
                </h3>
                <div className="text-xs text-slate-500 mb-3 bg-slate-900 p-2 rounded">
                   <strong>核心逻辑:</strong> 手里有 100 股 QQQ 被套或者长期持有？卖出 Call “出租”股票收租金。
                </div>
                <ul className="text-sm text-slate-300 space-y-2">
                   <li className="flex gap-2"><CaretRight className="text-purple-500 shrink-0 mt-0.5"/> <span><strong>收益:</strong> 权利金 + 股票上涨收益 (至行权价)。</span></li>
                   <li className="flex gap-2"><CaretRight className="text-purple-500 shrink-0 mt-0.5"/> <span><strong>风险:</strong> 股价大涨时，少赚了超过行权价的部分。</span></li>
                </ul>
             </div>
          </div>
        )}

        {/* TAB 3: GLOSSARY */}
        {activeTab === 'glossary' && (
          <div className="grid sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2">
             <div className="p-3 border border-slate-800 rounded bg-slate-950/50">
                <h4 className="text-white font-bold text-sm">Strike (行权价)</h4>
                <p className="text-slate-400 text-xs mt-1">
                   合约约定的买卖价格。卖 Put 时，如果股价跌破这个价格，你需要以这个价格买入股票。
                </p>
             </div>
             <div className="p-3 border border-slate-800 rounded bg-slate-950/50">
                <h4 className="text-white font-bold text-sm">Premium (权利金)</h4>
                <p className="text-slate-400 text-xs mt-1">
                   买方付给你的钱。无论最后是否行权，这笔钱都归你所有，这就是你的主要收益来源。
                </p>
             </div>
             <div className="p-3 border border-slate-800 rounded bg-slate-950/50">
                <h4 className="text-blue-400 font-bold text-sm">Delta (Δ)</h4>
                <p className="text-slate-400 text-xs mt-1">
                   衡量期权变成实值 (亏损) 的概率。Delta 0.20 意味着大约有 20% 的概率会被行权 (80% 胜率)。通常卖方选择 0.15 - 0.30 Delta。
                </p>
             </div>
             <div className="p-3 border border-slate-800 rounded bg-slate-950/50">
                <h4 className="text-purple-400 font-bold text-sm">IV (Implied Volatility)</h4>
                <p className="text-slate-400 text-xs mt-1">
                   隐含波动率。IV 越高，代表市场越恐慌，权利金越贵 (卖方越赚钱)。“低买高卖”在期权里指：低波动买入，高波动卖出。
                </p>
             </div>
             <div className="p-3 border border-slate-800 rounded bg-slate-950/50">
                <h4 className="text-emerald-400 font-bold text-sm">Annualized Return (年化)</h4>
                <p className="text-slate-400 text-xs mt-1">
                   为了横向对比不同到期日的收益效率，我们将单笔回报率折算成一年的理论回报。公式: ROI × (365 / 剩余天数)。
                </p>
             </div>
             <div className="p-3 border border-slate-800 rounded bg-slate-950/50">
                <h4 className="text-red-400 font-bold text-sm">ITM / OTM</h4>
                <p className="text-slate-400 text-xs mt-1">
                   ITM (价内): 对卖方不利的状态。OTM (价外): 对卖方有利的状态 (也就是目前安全)。
                </p>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};
