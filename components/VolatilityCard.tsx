import React from 'react';
import { VolatilityMetrics } from '../types.ts';
import { Gauge, Info, ArrowUpRight, ArrowDownRight, Minus } from '@phosphor-icons/react';

interface VolatilityCardProps {
    metrics: VolatilityMetrics | null;
    isLoading: boolean;
}

export const VolatilityCard: React.FC<VolatilityCardProps> = ({ metrics, isLoading }) => {
    
    if (isLoading) {
        return (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse h-[140px]">
                <div className="h-4 w-32 bg-slate-800 rounded mb-4"></div>
                <div className="h-8 w-full bg-slate-800 rounded mb-2"></div>
                <div className="h-4 w-2/3 bg-slate-800 rounded"></div>
            </div>
        );
    }

    if (!metrics) return null;

    // Calculate position of the marker (0-100%)
    const markerPosition = Math.min(100, Math.max(0, metrics.rank));
    
    // Determine signal icon
    let SignalIcon = Minus;
    if (metrics.rank > 50) SignalIcon = ArrowUpRight;
    if (metrics.rank < 20) SignalIcon = ArrowDownRight;

    return (
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-xl p-6 shadow-lg relative overflow-hidden">
            {/* Background Decoration */}
            <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none ${metrics.statusColor === 'emerald' ? 'bg-emerald-500' : metrics.statusColor === 'red' ? 'bg-red-500' : 'bg-yellow-500'}`}></div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
                <div>
                    <h3 className="text-slate-200 font-bold flex items-center gap-2">
                        <Gauge size={20} className="text-purple-400"/>
                        VXN 指数 (Nasdaq-100 Volatility)
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        VXN 之于 QQQ 等同于 VIX 之于 SPY。它是衡量纳斯达克 100 市场恐慌程度的权威指标。
                    </p>
                </div>
                <div className={`text-right px-3 py-1 rounded border ${
                    metrics.statusColor === 'emerald' ? 'bg-emerald-900/20 border-emerald-800 text-emerald-400' : 
                    metrics.statusColor === 'red' ? 'bg-red-900/20 border-red-800 text-red-400' : 
                    'bg-yellow-900/20 border-yellow-800 text-yellow-400'
                }`}>
                    <div className="text-xs uppercase font-bold tracking-wider mb-0.5">策略信号</div>
                    <div className="font-bold text-sm flex items-center justify-end gap-1">
                        <SignalIcon size={14} weight="bold"/>
                        {metrics.status}
                    </div>
                </div>
            </div>

            {/* Main Bar Visualization */}
            <div className="relative z-10">
                <div className="flex justify-between text-xs text-slate-500 font-mono mb-1">
                   <span>52周低: {metrics.lowIV.toFixed(2)}</span>
                   <span className="text-white font-bold">当前: {metrics.currentIV.toFixed(2)}</span>
                   <span>52周高: {metrics.highIV.toFixed(2)}</span>
                </div>
                
                <div className="h-4 bg-slate-800 rounded-full overflow-hidden relative">
                    {/* Color Zones */}
                    <div className="absolute top-0 left-0 h-full w-[20%] bg-red-900/40 border-r border-slate-950" title="买方区域 (Long)"></div>
                    <div className="absolute top-0 left-[20%] h-full w-[30%] bg-yellow-900/40 border-r border-slate-950" title="中性区域"></div>
                    <div className="absolute top-0 left-[50%] h-full w-[50%] bg-emerald-900/40" title="卖方黄金区域 (Short)"></div>
                    
                    {/* Marker */}
                    <div 
                        className="absolute top-0 h-full w-1.5 bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)] transition-all duration-1000 ease-out rounded-full z-20"
                        style={{ left: `${markerPosition}%` }}
                    ></div>
                </div>
                
                <div className="flex justify-between mt-2 text-xs">
                    <div className="text-red-400/60">IV Rank &lt; 20</div>
                    <div className="text-slate-600">IV Rank: <span className="text-white font-mono">{metrics.rank.toFixed(0)}</span></div>
                    <div className="text-emerald-400/60">IV Rank &gt; 50</div>
                </div>
            </div>
        </div>
    );
};