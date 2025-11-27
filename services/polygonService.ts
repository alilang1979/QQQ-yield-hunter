import { GeminiResponseData } from "../types.ts";
import { calculateDynamicTargets } from "../utils/calculations.ts";

const BASE_URL = "https://api.polygon.io";

// 1. Validate API Key
export const validateApiKey = async (apiKey: string): Promise<{valid: boolean, message?: string}> => {
  try {
    const cleanKey = apiKey.trim();
    const url = `${BASE_URL}/v3/reference/tickers?market=stocks&active=true&limit=1&apiKey=${cleanKey}`;
    
    const res = await fetch(url);
    
    if (res.status === 401 || res.status === 403) {
      return { valid: false, message: "Key 被拒绝 (401/403)。请检查 Key 是否正确或已过期。" };
    }
    
    if (!res.ok) {
      return { valid: false, message: `网络错误: ${res.status} ${res.statusText}` };
    }

    const data = await res.json();
    if (data.status === "OK" || Array.isArray(data.results)) {
      return { valid: true, message: "Key 有效！" };
    }
    
    return { valid: false, message: "未知的响应格式" };
  } catch (e: any) {
    return { valid: false, message: e.message || "验证失败" };
  }
};

// Helper: Fallback Strategy for Free Tier / Restricted Keys
async function fetchFreeTierOptions(apiKey: string, targetDate: string, currentPrice: number, contractType: 'put' | 'call'): Promise<any[]> {
    
    // A. Calculate Ideal Targets
    const targets = calculateDynamicTargets(currentPrice, targetDate);
    // Note: This logic assumes Puts (below price). For Calls, logic needs inversion, but for simplicity we'll keep similar spread logic or just use close targets.
    // If contractType is call, we want strikes ABOVE price.
    
    let idealStrikes: {label: string, val: number}[] = [];
    
    if (contractType === 'call') {
        const stdDev = targets.stdDev;
        idealStrikes = [
             { label: "Aggressive", val: currentPrice + (0.5 * stdDev) },
             { label: "Moderate", val: currentPrice + (1.0 * stdDev) },
             { label: "Safe", val: currentPrice + (2.0 * stdDev) }
        ];
    } else {
        idealStrikes = [
            { label: "Aggressive", val: targets.aggressive },
            { label: "Moderate", val: targets.moderate },
            { label: "Safe", val: targets.safe }
        ];
    }
    
    // B. Fetch Contract List (Reference API)
    // Adjust lte/gte based on type.
    let rangeParam = '';
    if (contractType === 'put') {
        rangeParam = `strike_price.lte=${currentPrice}&sort=strike_price&order=desc`;
    } else {
        rangeParam = `strike_price.gte=${currentPrice}&sort=strike_price&order=asc`;
    }

    const contractsUrl = `${BASE_URL}/v3/reference/options/contracts?underlying_ticker=QQQ&contract_type=${contractType}&expiration_date=${targetDate}&${rangeParam}&limit=500&apiKey=${apiKey}`;
    
    const contractsRes = await fetch(contractsUrl);
    if (!contractsRes.ok) throw new Error("获取合约列表失败 (Free Tier Fallback)。");
    
    const contractsData = await contractsRes.json();
    const allContracts = contractsData.results || [];
    
    if (allContracts.length === 0) return [];

    // C. Find Closest Match for each Ideal Target
    const selectedTickers = new Set<string>();
    const selectedContracts: any[] = [];

    idealStrikes.forEach(target => {
        // Find contract with strike closest to target.val
        const closest = allContracts.reduce((prev: any, curr: any) => {
            return (Math.abs(curr.strike_price - target.val) < Math.abs(prev.strike_price - target.val) ? curr : prev);
        });

        if (closest && !selectedTickers.has(closest.ticker)) {
            selectedTickers.add(closest.ticker);
            selectedContracts.push(closest);
        }
    });

    // D. Fetch Prices
    const options: any[] = [];
    
    for (const contract of selectedContracts) {
        const ticker = contract.ticker;
        const strike = contract.strike_price;
        
        // Fetch Previous Close (Aggs API) - Most reliable free endpoint
        const prevUrl = `${BASE_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${apiKey}`;
        try {
            const prevRes = await fetch(prevUrl);
            if (prevRes.ok) {
                const prevData = await prevRes.json();
                const res = prevData.results?.[0];
                if (res) {
                    options.push({
                        strike: strike,
                        premium: res.c, // Close price
                        iv: undefined, // Not available in Aggs
                        delta: undefined // Not available in Aggs, undefined ensures UI shows N/A instead of 100%
                    });
                }
            }
        } catch (e) {
            console.warn(`Failed to fetch price for ${ticker}`, e);
        }
    }
    
    return options.sort((a,b) => contractType === 'call' ? a.strike - b.strike : b.strike - a.strike);
}

export const fetchPolygonData = async (
  apiKey: string,
  targetDate: string,
  contractType: 'put' | 'call' = 'put'
): Promise<GeminiResponseData> => {
  const cleanKey = apiKey.trim();
  
  // ----------------------------------------
  // STEP 1: Fetch Underlying Price
  // ----------------------------------------
  let currentPrice = 0;
  
  try {
    const priceUrl = `${BASE_URL}/v2/last/trade/QQQ?apiKey=${cleanKey}`;
    const priceRes = await fetch(priceUrl);
    if (priceRes.ok) {
        const json = await priceRes.json();
        currentPrice = json.results?.p;
    }
  } catch (e) { 
    console.warn("Polygon Last Trade failed, trying Prev Close");
  }

  if (!currentPrice) {
      const prevUrl = `${BASE_URL}/v2/aggs/ticker/QQQ/prev?adjusted=true&apiKey=${cleanKey}`;
      const prevRes = await fetch(prevUrl);
      if (!prevRes.ok) {
         throw new Error("无法获取 QQQ 价格，请检查 API Key 是否有效。");
      }
      const prevJson = await prevRes.json();
      currentPrice = prevJson.results?.[0]?.c;
  }

  if (!currentPrice) {
    throw new Error("Polygon 未返回 QQQ 价格数据。");
  }

  // ----------------------------------------
  // STEP 2: Fetch Option Chain
  // ----------------------------------------
  try {
      // Prepare Snapshot URL
      let minStrike = 0;
      let maxStrike = 0;

      if (contractType === 'put') {
          minStrike = Math.floor(currentPrice * 0.80);
          maxStrike = Math.ceil(currentPrice * 1.02);
      } else {
          // For calls, we generally want above current price, maybe slightly below (ITM)
          minStrike = Math.floor(currentPrice * 0.95);
          maxStrike = Math.ceil(currentPrice * 1.20);
      }
      
      const chainUrl = `${BASE_URL}/v3/snapshot/options/QQQ?expiration_date=${targetDate}&contract_type=${contractType}&strike_price.gte=${minStrike}&strike_price.lte=${maxStrike}&limit=250&apiKey=${cleanKey}`;
      
      const chainRes = await fetch(chainUrl);
      
      // *** FREE TIER FALLBACK ***
      if (chainRes.status === 403) {
         console.warn("Snapshot API Forbidden (403). Switching to Smart Strategy.");
         const fallbackOptions = await fetchFreeTierOptions(cleanKey, targetDate, currentPrice, contractType);
         return {
            currentPrice,
            options: fallbackOptions,
            sources: [{ uri: "https://polygon.io", title: "Polygon.io API (Free Tier 智能选筹)" }]
         };
      }

      if (!chainRes.ok) {
         throw new Error(`Polygon Snapshot 错误: ${chainRes.statusText}`);
      }

      const chainJson = await chainRes.json();
      const results = chainJson.results || [];

      const options = results.map((contract: any) => {
        const strike = contract.details?.strike_price;
        
        let premium = contract.day?.close; 
        if (contract.day && contract.day.l) premium = contract.day.l;
        if (contract.last_quote && contract.last_quote.b > 0) premium = contract.last_quote.b;

        return {
          strike,
          premium,
          iv: contract.implied_volatility,
          delta: contract.greeks?.delta
        };
      }).filter((o: any) => o.strike && o.premium > 0);

      // Sort: Puts descending, Calls ascending
      options.sort((a: any, b: any) => contractType === 'call' ? a.strike - b.strike : b.strike - a.strike);
      const topOptions = options.slice(0, 15);

      return {
        currentPrice,
        options: topOptions,
        sources: [{ uri: "https://polygon.io", title: "Polygon.io API (Snapshot 官方快照)" }]
      };

  } catch (e: any) {
      throw e;
  }
};