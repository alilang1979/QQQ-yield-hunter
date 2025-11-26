import React from 'react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import { OptionRow } from '../types';

interface YieldChartProps {
  data: OptionRow[];
  currentPrice: number;
  strategy?: 'CSP' | 'PCS' | 'CC';
  spreadWidth?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 p-3 rounded shadow-xl text-sm">
        <p className="text-slate-300 font-semibold mb-1">行权价: ${label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.name.includes('年化') || entry.name.includes('ROI') 
              ? `${Number(entry.value).toFixed(2)}%` 
              : `$${Number(entry.value).toFixed(2)}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const YieldChart: React.FC<YieldChartProps> = ({ 
    data, 
    currentPrice, 
    strategy = 'CSP',
    spreadWidth = 5 
}) => {
  // Sort data for chart (X-Axis Order)
  // Puts: Low -> High strike (so chart goes Left to Right)
  // Calls: Low -> High strike
  const sortedData = [...data].sort((a, b) => a.strike - b.strike);
  
  // Prepare Data for Chart including Spread Calcs if needed
  const chartData = sortedData.map((row) => {
      let spreadAnnReturn = 0;
      let netCredit = 0;
      let totalReturn = 0;

      if (strategy === 'PCS') {
          // Find logic matching table: Target = Strike - Width
          // Since chart is sorted Ascending, we look for a strike smaller than current
          const targetStrike = row.strike - spreadWidth;
          
          // Find match in the whole sorted dataset
          let bestMatch = null;
          let minDiff = Number.MAX_VALUE;
          
          sortedData.forEach(candidate => {
             if (candidate.strike < row.strike) {
                 const diff = Math.abs(candidate.strike - targetStrike);
                 if (diff < minDiff) {
                     minDiff = diff;
                     bestMatch = candidate;
                 }
             }
          });
          
          const longLeg = bestMatch;
          
          if (longLeg) {
             netCredit = row.premium - longLeg.premium;
             const actualWidth = row.strike - longLeg.strike;
             const risk = (actualWidth * 100) - (netCredit * 100);
             if (risk > 0) {
                 const roi = ((netCredit * 100) / risk) * 100;
                 spreadAnnReturn = roi * (365 / row.daysToExpiration);
             }
          }
      } 
      else if (strategy === 'CC') {
          // Total Return calc if needed for visualization
          // Currently Chart uses Annualized Return calculated in row
      }

      return { ...row, spreadAnnReturn, netCredit };
  });

  // Determine Metrics to Display
  const showNetCredit = strategy === 'PCS';
  const showPremium = strategy !== 'PCS';
  
  const yieldKey = strategy === 'PCS' ? 'spreadAnnReturn' : 'annualizedReturn';
  const moneyKey = showNetCredit ? 'netCredit' : 'premium';
  const moneyName = showNetCredit ? '净权利金 (Net Credit)' : '权利金 (Premium)';

  return (
    <div className="h-[400px] w-full bg-slate-900/50 p-4 rounded-xl border border-slate-800">
      <h3 className="text-lg font-semibold text-slate-200 mb-4">
          {strategy === 'PCS' ? '价差策略收益分析 (Spread ROI)' : '收益率曲线分析 (Yield Curve)'}
      </h3>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis 
            dataKey="strike" 
            stroke="#94a3b8" 
            tickFormatter={(val) => `$${val}`} 
            label={{ value: '行权价 (Strike)', position: 'insideBottom', offset: -5, fill: '#94a3b8', fontSize: 12 }}
          />
          <YAxis 
            yAxisId="left" 
            stroke="#4ade80" 
            tickFormatter={(val) => `${val}%`} 
            label={{ value: '年化收益率 %', angle: -90, position: 'insideLeft', fill: '#4ade80', fontSize: 12 }}
          />
          <YAxis 
            yAxisId="right" 
            orientation="right" 
            stroke="#60a5fa" 
            tickFormatter={(val) => `$${val}`}
            label={{ value: moneyName, angle: 90, position: 'insideRight', fill: '#60a5fa', fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend verticalAlign="top" height={36}/>
          <Bar 
            yAxisId="right" 
            dataKey={moneyKey} 
            name={moneyName}
            barSize={20} 
            fill="#60a5fa" 
            opacity={0.5}
          >
             {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="#60a5fa" />
              ))}
          </Bar>
          <Line
            yAxisId="left"
            type="monotone"
            dataKey={yieldKey}
            name="年化收益率 (Ann. Return)"
            stroke="#4ade80"
            strokeWidth={3}
            dot={{ r: 4, fill: '#22c55e' }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};