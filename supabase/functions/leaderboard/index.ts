import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gensyn API configuration
const GENSYN_API_BASE = "https://dashboard.gensyn.ai/api/v1";

interface LeaderboardEntry {
  rank: number;
  peerId: string;
  participations: number;
  wins: number;
}

interface CacheData {
  entries: LeaderboardEntry[];
  updatedAt: string;
  stats: {
    currentRound: number;
    currentStage: number;
    uniqueVoters: number;
    uniqueVotedPeers: number;
  };
}

let cache: CacheData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 60 seconds

async function fetchGensynAPI(endpoint: string) {
  const response = await fetch(`${GENSYN_API_BASE}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return await response.json();
}

async function buildFullLeaderboard(): Promise<CacheData> {
  console.log("Building full leaderboard from Gensyn API...");
  
  const now = Date.now();
  if (cache && (now - cacheTimestamp) < CACHE_TTL) {
    console.log("Returning cached data");
    return cache;
  }

  try {
    // Fetch all data in parallel
    const [leaderboardData, networkStatsData, nodesConnectedData, uniqueVotersData] = await Promise.all([
      fetchGensynAPI('/leaderboard'),
      fetchGensynAPI('/network-stats'),
      fetchGensynAPI('/nodes-connected'),
      fetchGensynAPI('/unique-voters'),
    ]);

    console.log("API data fetched successfully");
    console.log("Raw leaderboard response:", JSON.stringify(leaderboardData).substring(0, 500));
    console.log("Leaderboard entries count:", leaderboardData.entries?.length || 0);
    if (leaderboardData.entries?.length > 0) {
      console.log("Sample entry:", JSON.stringify(leaderboardData.entries[0]));
    }

    // Process leaderboard entries - preserve API order (official leaderboard order)
    const entries: LeaderboardEntry[] = (leaderboardData.entries || []).map((entry: any, index: number) => {
      const participation = entry.participation ?? entry.participations ?? entry.score ?? 0;
      const rewards = entry.trainingRewards ?? entry.training_rewards ?? entry.reward ?? 0;
      
      console.log(`Entry ${index}: peerId=${entry.peerId}, participation=${participation}, rewards=${rewards}`);
      
      return {
        rank: index + 1,
        peerId: entry.peerId,
        participations: participation,
        wins: rewards,
      };
    });

    // Do NOT resort - keep server-provided order so ranks match official leaderboard
    // entries.sort(...);

    // Reassign ranks after sorting
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    console.log("Network stats data:", JSON.stringify(networkStatsData));
    console.log("Nodes connected data:", JSON.stringify(nodesConnectedData));
    
    const result: CacheData = {
      entries,
      updatedAt: leaderboardData.updatedAt || new Date().toISOString(),
      stats: {
        currentRound: networkStatsData?.transactions || networkStatsData?.total || 0,
        currentStage: nodesConnectedData?.nodesConnected || nodesConnectedData?.count || 0,
        uniqueVoters: uniqueVotersData?.uniqueVoters || uniqueVotersData?.count || 0,
        uniqueVotedPeers: entries.length,
      },
    };

    // Update cache
    cache = result;
    cacheTimestamp = now;

    console.log(`Leaderboard built with ${entries.length} entries`);
    return result;
  } catch (error) {
    console.error("Error fetching from Gensyn API:", error);
    
    // Return cached data if available, otherwise throw
    if (cache) {
      console.log("Returning stale cached data due to API error");
      return cache;
    }
    
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get('limit') || '100');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    console.log(`Leaderboard request - limit: ${limit}, offset: ${offset}`);

    const data = await buildFullLeaderboard();
    
    const total = data.entries.length;
    const pageEntries = data.entries.slice(offset, offset + limit);

    return new Response(
      JSON.stringify({
        entries: pageEntries,
        total,
        updatedAt: data.updatedAt,
        stats: data.stats,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error in leaderboard function:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
