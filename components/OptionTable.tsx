import React, { useState } from 'react';
import { OptionRow } from '../types.ts';
import { formatCurrency, calculateOptionMetrics } from '../utils/calculations.ts';
import { Info, Warning } from '@phosphor-icons/react';

interface OptionTableProps {
  data: OptionRow[];
  currentPrice: number;
  onUpdateRow: (updatedRow: OptionRow) => void;
  onDeleteRow: (id: string) => void;
  strategy: 'CSP' | 'PCS' | 'CC';
  spreadWidth?: number; // Expected spread width (e.g., 5, 10)
  costBasis?: number;
}

export const OptionTable: React.FC<OptionTableProps> = ({ 
    data, 
    currentPrice, 
    onUpdateRow, 
    onDeleteRow, 
    strategy,
    spreadWidth = 5, // Default to 5
    costBasis = 0
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{premium: string, strike: string} | null>(null);

  const handleEditStart = (row: OptionRow) => {
    setEditingId(row.id);
    setEditValues({ premium: row.premium.toString(), strike: row.strike.toString() });
  };

  const handleSave = (row: OptionRow) => {
    if (editValues) {
      const newPremium = parseFloat(editValues.premium);
      const newStrike = parseFloat(editValues.strike);
      
      if (!isNaN(newPremium) && !isNaN(newStrike)) {
        // Recalculate based on existing expiration, strategy type is assumed same
        // Note: In a real app we might need to pass contractType down or derive it
        const updated = calculateOptionMetrics(newStrike, newPremium, row.expirationDate); 
        // Preserve extra data like iv/delta/type if present
        const existing = row as any;
        const updatedAny = updated as any;
        if (existing.iv) updatedAny.iv = existing.iv;
        if (existing.delta) updatedAny.delta = existing.delta;
        if (existing.type) updatedAny.type = existing.type;
        if (existing.winRate) updatedAny.winRate = existing.winRate;
        
        onUpdateRow(updated);
      }
    }
    setEditingId(null);
    setEditValues(null);
  };

  // Sort logic:
  // Puts (CSP, PCS) -> Descending (Highest strike first = Closest to ITM/Price)
  // Calls (CC) -> Ascending (Lowest strike first = Closest to ITM/Price)
  const isCall = strategy === 'CC';
  const sortedData = [...data].sort((a, b) => isCall ? a.strike - b.strike : b.strike - a.strike);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
      <table className="w-full text-sm text-left text-slate-400">
        <thead className="text-xs uppercase bg-slate-800 text-slate-300">
          <tr>
            <th scope="col" className="px-4 py-4 min-w-[100px]">行权价 (Strike)</th>
            {strategy === 'PCS' && (
                <th scope="col" className="px-4 py-4 text-blue-400">
                    <div className="flex items-center gap-1">
                        组合 (Spread)
                        <div className="group relative">
                            <Info size={14} className="text-slate-500 cursor-help"/>
                            <div className="absolute left-0 top-6 w-64 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl hidden group-hover:block z-10 text-xs text-slate-400 normal-case font-normal">
                                系统会自动寻找比卖方行权价低 ${spreadWidth} 的合约作为保护腿。如果找不到确切价格，会匹配最接近的。
                            </div>
                        </div>
                    </div>
                </th>
            )}
            <th scope="col" className="px-4 py-4 hidden sm:table-cell">价外深度 (OTM)</th>
            <th scope="col" className="px-4 py-4 hidden md:table-cell text-slate-500">
                <div className="flex items-center gap-1">
                    预估胜率 (PoP)
                    <div className="group relative">
                        <Info size={14} className="text-slate-500 cursor-help"/>
                        <div className="absolute left-0 top-6 w-64 bg-slate-900 border border-slate-700 p-2 rounded shadow-xl hidden group-hover:block z-10 text-xs text-slate-400 normal-case font-normal">
                            基于 Delta 计算的胜率估算 (1 - |Delta|)。表示合约到期归零（卖方获利）的概率。
                        </div>
                    </div>
                </div>
            </th>
            <th scope="col" className="px-4 py-4 min-w-[100px]">权利金 (Bid)</th>
            {strategy === 'PCS' && <th scope="col" className="px-4 py-4 text-blue-400">净权利金</th>}
            
            <th scope="col" className="px-4 py-4 hidden md:table-cell">
                {strategy === 'CSP' && '盈亏平衡点'}
                {strategy === 'PCS' && '最大风险'}
                {strategy === 'CC' && '被行权总收益 (If Called)'}
            </th>
            
            <th scope="col" className="px-4 py-4 text-emerald-400 font-bold min-w-[120px]">
                {strategy === 'CSP' ? '年化收益率' : strategy === 'PCS' ? '价差年化(ROI)' : '备兑年化'}
            </th>
            <th scope="col" className="px-4 py-4 text-center">操作</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 && (
            <tr>
              <td colSpan={strategy === 'PCS' ? 9 : 8} className="px-6 py-8 text-center text-slate-500 italic">
                暂无数据。请点击上方“获取数据”或手动添加。
              </td>
            </tr>
          )}
          {sortedData.map((row, index) => {
            const isEditing = editingId === row.id;
            // Calculate distance: For Put (Price - Strike), For Call (Strike - Price)
            const distanceToStrike = isCall 
                ? ((row.strike - currentPrice) / currentPrice) * 100
                : ((currentPrice - row.strike) / currentPrice) * 100;
                
            // ITM Logic: Put (Strike > Price), Call (Strike < Price)
            const isITM = isCall ? row.strike < currentPrice : row.strike > currentPrice;
            
            // PoP / Delta
            const winRate = (row as any).winRate;
            const deltaVal = (row as any).delta;
            
            // --- SPREAD LOGIC (PCS) ---
            let longLeg = null;
            let netCredit = 0;
            let spreadRisk = 0;
            let spreadRoi = 0;
            let spreadAnnReturn = 0;
            let spreadActualWidth = 0;

            if (strategy === 'PCS') {
                // Target strike for long leg
                const targetStrike = row.strike - spreadWidth;
                
                // Find the closest available strike to the target
                // We search the whole dataset to be safe
                let bestMatch = null;
                let minDiff = Number.MAX_VALUE;
                
                sortedData.forEach(candidate => {
                    // Must be lower strike for Put Spread
                    if (candidate.strike < row.strike) {
                        const diff = Math.abs(candidate.strike - targetStrike);
                        if (diff < minDiff) {
                            minDiff = diff;
                            bestMatch = candidate;
                        }
                    }
                });
                
                longLeg = bestMatch;

                if (longLeg) {
                    netCredit = row.premium - longLeg.premium;
                    spreadActualWidth = row.strike - longLeg.strike;
                    spreadRisk = (spreadActualWidth * 100) - (netCredit * 100);
                    const netCreditTotal = netCredit * 100;
                    
                    if (spreadRisk > 0) {
                        spreadRoi = (netCreditTotal / spreadRisk) * 100;
                        spreadAnnReturn = spreadRoi * (365 / row.daysToExpiration);
                    }
                }
            }
            
            // --- COVERED CALL LOGIC ---
            let profitIfCalled = 0;
            let isBelowCost = false;
            if (strategy === 'CC' && costBasis > 0) {
                // If called, you sell at strike.
                // Profit = (Strike - Cost) + Premium
                profitIfCalled = (row.strike - costBasis) + row.premium;
                if (row.strike < costBasis) isBelowCost = true;
            }

            return (
              <tr key={row.id} className={`border-b border-slate-800 hover:bg-slate-800/40 transition-colors ${isITM ? 'bg-red-900/10' : ''}`}>
                {/* Strike */}
                <td className="px-4 py-4 font-medium text-slate-200">
                  {isEditing ? (
                     <input 
                        type="number" 
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:border-blue-500 outline-none"
                        value={editValues?.strike}
                        onChange={(e) => setEditValues(prev => ({...prev!, strike: e.target.value}))}
                     />
                  ) : (
                    <div className="flex items-center gap-2">
                        {formatCurrency(row.strike)}
                        {strategy === 'CC' && isBelowCost && (
                            <div title="行权价低于成本价 (锁定亏损)" className="text-red-500 cursor-help"><Warning size={14} weight="fill"/></div>
                        )}
                    </div>
                  )}
                  {isITM && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">ITM</span>}
                </td>

                {/* Spread Viz (PCS) */}
                {strategy === 'PCS' && (
                    <td className="px-4 py-4 text-xs font-mono">
                        {longLeg ? (
                            <div className="flex flex-col">
                                <div className="flex justify-between w-24">
                                    <span className="text-red-400">卖 {row.strike}</span>
                                </div>
                                <div className="flex justify-between w-24 items-center">
                                    <span className="text-emerald-400">买 {longLeg.strike}</span>
                                    {Math.abs(spreadActualWidth - spreadWidth) > 0.5 && (
                                        <div className="text-yellow-500 cursor-help" title={`实际宽度 $${spreadActualWidth.toFixed(2)} (目标 $${spreadWidth})`}>
                                            <Warning size={12} weight="fill"/>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <span className="text-slate-600 italic">缺腿 (No Leg)</span>
                        )}
                    </td>
                )}

                {/* Distance OTM */}
                <td className={`px-4 py-4 hidden sm:table-cell ${isITM ? 'text-red-400' : 'text-slate-400'}`}>
                  {isITM ? 'N/A' : `${distanceToStrike.toFixed(2)}%`}
                </td>

                 {/* Win Rate (PoP) */}
                <td className="px-4 py-4 hidden md:table-cell" title={deltaVal !== undefined ? `Raw Delta: ${deltaVal}` : "Delta not available"}>
                    {winRate !== undefined ? (
                        <div className="flex items-center gap-2">
                            <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full rounded-full ${winRate > 80 ? 'bg-emerald-500' : winRate > 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                    style={{ width: `${winRate}%` }}
                                ></div>
                            </div>
                            <span className={`text-xs font-mono ${winRate > 80 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {winRate.toFixed(0)}%
                            </span>
                        </div>
                    ) : (
                        <span className="text-slate-600 text-xs cursor-help" title="Free Tier 模式下无法获取准确 Delta">N/A</span>
                    )}
                </td>

                {/* Premium */}
                <td className="px-4 py-4 text-slate-200">
                   {isEditing ? (
                     <input 
                        type="number" 
                        className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white focus:border-blue-500 outline-none"
                        value={editValues?.premium}
                        onChange={(e) => setEditValues(prev => ({...prev!, premium: e.target.value}))}
                     />
                  ) : (
                    formatCurrency(row.premium)
                  )}
                </td>

                {/* Net Credit (PCS) */}
                {strategy === 'PCS' && (
                    <td className="px-4 py-4 text-slate-200 font-bold">
                        {longLeg ? formatCurrency(netCredit) : '-'}
                    </td>
                )}

                {/* Strategy Specific Metric */}
                <td className="px-4 py-4 hidden md:table-cell text-slate-300">
                  {strategy === 'CSP' && formatCurrency(row.breakeven)}
                  {strategy === 'PCS' && (longLeg ? <span className="text-orange-300">{formatCurrency(spreadRisk / 100)}</span> : '-')}
                  {strategy === 'CC' && (
                      <span className={profitIfCalled > 0 ? 'text-emerald-300' : 'text-red-400'}>
                          {formatCurrency(profitIfCalled)}
                      </span>
                  )}
                </td>

                {/* Annualized Return */}
                <td className="px-4 py-4 font-bold text-emerald-400 text-base">
                  {strategy === 'CSP' && (
                      <>
                        {row.annualizedReturn.toFixed(2)}%
                        <div className="text-[10px] font-normal text-slate-500">ROI: {row.roi.toFixed(2)}%</div>
                      </>
                  )}
                  {strategy === 'CC' && (
                      <>
                        {row.annualizedReturn.toFixed(2)}%
                        <div className="text-[10px] font-normal text-slate-500">ROI: {row.roi.toFixed(2)}%</div>
                      </>
                  )}
                  {strategy === 'PCS' && (
                      longLeg ? (
                         <>
                            {spreadAnnReturn.toFixed(2)}%
                            <div className="text-[10px] font-normal text-slate-500">ROI: {spreadRoi.toFixed(2)}%</div>
                         </>
                      ) : <span className="text-slate-600 text-xs">需更多数据</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-4 text-center whitespace-nowrap">
                   {isEditing ? (
                      <button 
                        onClick={() => handleSave(row)}
                        className="font-medium text-emerald-500 hover:underline mr-3 text-xs"
                      >
                        保存
                      </button>
                   ) : (
                      <button 
                        onClick={() => handleEditStart(row)}
                        className="font-medium text-blue-500 hover:underline mr-3 text-xs"
                      >
                        编辑
                      </button>
                   )}
                  <button 
                    onClick={() => onDeleteRow(row.id)}
                    className="font-medium text-red-500 hover:underline text-xs"
                  >
                    删除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};