import { GoogleGenAI } from "@google/genai";
import { GeminiResponseData, VolatilityMetrics } from "../types";
import { getTargetStrikes, getIVStatus, calculateIVRank } from "../utils/calculations";

// Helper to extract JSON
const extractJson = (text: string): any => {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    try { return JSON.parse(jsonMatch[1]); } catch (e) { console.warn("Markdown JSON parse fail", e); }
  }
  
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const potentialJson = text.substring(firstBrace, lastBrace + 1);
    try { return JSON.parse(potentialJson); } catch (e) { console.warn("Raw JSON parse fail", e); }
  }
  return null;
};

// Define distinct search strategies
// We prioritize sites with simpler HTML structures (Static HTML) over complex Single Page Apps (Nasdaq/Yahoo)
// to ensure the AI can actually read the data from the search snippets.
const SEARCH_STRATEGIES = [
  {
    name: "StockAnalysis",
    queryPrefix: "site:stockanalysis.com",
    description: "Scanning StockAnalysis.com...",
    queryTemplate: (ticker: string, date: string, strike: number, type: string) => 
      `site:stockanalysis.com ${ticker} option chain ${type} ${date}`
  },
  {
    name: "BarChart",
    queryPrefix: "site:barchart.com",
    description: "Scanning BarChart.com...",
    queryTemplate: (ticker: string, date: string, strike: number, type: string) => 
      `site:barchart.com ${ticker} ${type} option ${date} strike ${strike}`
  },
  {
    name: "Yahoo Finance",
    queryPrefix: "site:finance.yahoo.com",
    description: "Scanning Yahoo Finance...",
    queryTemplate: (ticker: string, date: string, strike: number, type: string) => 
      `site:finance.yahoo.com ${ticker} ${date} option chain`
  },
  {
    name: "General Search",
    queryPrefix: "", 
    description: "Trying General Sources...",
    queryTemplate: (ticker: string, date: string, strike: number, type: string) => 
      `${ticker} ${type} option prices expiration ${date} strike ${strike}`
  }
];

export const fetchMarketData = async (
  targetDate: string, 
  onProgress: (msg: string) => void,
  contractType: 'put' | 'call' = 'put',
  apiKey: string
): Promise<GeminiResponseData> => {
  if (!apiKey) {
    throw new Error("Gemini API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  let currentPrice = 0;
  let sources: any[] = [];
  let optionsData: any = { options: [] };

  // ==========================================
  // STEP 1: Fetch Current Price
  // ==========================================
  // For price, Yahoo/Google Finance is usually best/fastest
  const priceStrategies = [
     SEARCH_STRATEGIES[2], // Yahoo
     SEARCH_STRATEGIES[3], // General
  ];

  for (const strategy of priceStrategies) {
    if (currentPrice > 0) break;

    onProgress(`Finding Price on ${strategy.name}...`);
    
    try {
      const pricePrompt = `
        Search query: ${strategy.queryPrefix} current real-time price NASDAQ:QQQ ETF.
        Task: Find the live price.
        Return JSON ONLY: { "currentPrice": <number> }
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: pricePrompt,
        config: { tools: [{ googleSearch: {} }] },
      });

      const data = extractJson(response.text);
      if (data && data.currentPrice && typeof data.currentPrice === 'number') {
        currentPrice = data.currentPrice;
        if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
           sources = [...sources, ...response.candidates[0].groundingMetadata.groundingChunks];
        }
      }
    } catch (e) {
      console.warn(`Price fetch failed on ${strategy.name}`);
    }
  }

  if (!currentPrice) {
    throw new Error("Could not retrieve QQQ price from any source.");
  }

  // ==========================================
  // STEP 2: Fetch Targeted Options
  // ==========================================
  const targetStrikes = getTargetStrikes(currentPrice); 
  const strikeList = targetStrikes.join(", ");

  // Use the full list of strategies for options
  for (const strategy of SEARCH_STRATEGIES) {
    if (optionsData.options.length > 0) break; 

    onProgress(`${strategy.description}`);

    try {
      // Dynamic query construction based on strategy
      const searchQuery = strategy.queryTemplate("QQQ", targetDate, targetStrikes[1], contractType);

      const optionsPrompt = `
        Context: QQQ Price is $${currentPrice}. Expiration: ${targetDate}.
        Target Strikes: ${strikeList}. Contract Type: ${contractType.toUpperCase()}.
        
        Search Query: ${searchQuery}
        
        Task: Find the "Bid" or "Last" price for QQQ ${contractType.toUpperCase()} options expiring ${targetDate} for these specific strikes: ${strikeList}.
        If you find the option table, extract the premiums.
        
        Return JSON ONLY:
        {
          "options": [
            { "strike": ${targetStrikes[0]}, "premium": <number> },
            { "strike": ${targetStrikes[1]}, "premium": <number> },
            { "strike": ${targetStrikes[2]}, "premium": <number> }
          ]
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: optionsPrompt,
        config: { tools: [{ googleSearch: {} }] },
      });

      const parsed = extractJson(response.text);
      if (parsed && Array.isArray(parsed.options) && parsed.options.length > 0) {
        const validOptions = parsed.options.filter((o: any) => o.premium > 0);
        if (validOptions.length > 0) {
            optionsData.options = validOptions;
            
            if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                sources = [...sources, ...response.candidates[0].groundingMetadata.groundingChunks];
            }
        }
      }
    } catch (e) {
       console.warn(`Option fetch failed on ${strategy.name}`);
    }
  }

  // Format sources for UI
  const formattedSources = sources
    .map((chunk: any) => chunk.web)
    .filter((web: any) => web)
    .map((web: any) => ({ uri: web.uri, title: web.title || "Source" }));

  const uniqueSources = Array.from(new Map(formattedSources.map((item:any) => [item.uri, item])).values());

  return {
    currentPrice,
    options: optionsData.options,
    sources: uniqueSources as any
  };
};


// ========================================================
// NEW: Fetch Volatility Data (VXN Index - The VIX of Nasdaq)
// ========================================================
export const fetchVolatilityData = async (apiKey: string): Promise<VolatilityMetrics | null> => {
  if (!apiKey) return null;
  
  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  try {
      // Prompt to specifically fetch VXN (Cboe Nasdaq-100 Volatility Index)
      // We need Current Price, 52 Week High, and 52 Week Low
      const prompt = `
        Search Query: ^VXN index price 52 week range CBOE Nasdaq Volatility
        
        Task: Find the current price and the 52-week High/Low range for the Cboe Nasdaq-100 Volatility Index (^VXN).
        
        Return JSON ONLY:
        {
            "currentIV": <number>,
            "highIV": <number>,
            "lowIV": <number>
        }
      `;
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: { tools: [{ googleSearch: {} }] },
      });

      const data = extractJson(response.text);
      
      if (data && data.currentIV) {
          // If high/low are missing, use rough defaults or estimates if possible
          const high = data.highIV || 35; 
          const low = data.lowIV || 15;
          
          const rank = calculateIVRank(data.currentIV, low, high);
          const status = getIVStatus(rank);
          
          return {
              currentIV: data.currentIV,
              highIV: high,
              lowIV: low,
              rank,
              status: status.msg,
              statusColor: status.color
          };
      }
      return null;
  } catch (e) {
      console.warn("Vol fetch failed", e);
      return null;
  }
};
