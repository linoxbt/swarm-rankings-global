import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  peerSources: {
    fromApi: number;
    fromBlockchain: number;
    total: number;
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
  console.log("Building full leaderboard from Gensyn API and blockchain events...");
  
  const now = Date.now();
  if (cache && (now - cacheTimestamp) < CACHE_TTL) {
    console.log("Returning cached data");
    return cache;
  }

  try {
    // Fetch all data in parallel from multiple endpoints
    const [leaderboardData, networkStatsData, nodesConnectedData, uniqueVotersData, gossipData, topRewardsData] = await Promise.all([
      fetchGensynAPI('/leaderboard'),
      fetchGensynAPI('/network-stats'),
      fetchGensynAPI('/nodes-connected'),
      fetchGensynAPI('/unique-voters'),
      fetchGensynAPI('/gossip-messages'),
      fetchGensynAPI('/top-rewards'),
    ]);

    console.log("API data fetched successfully");
    console.log("Leaderboard entries:", leaderboardData.entries?.length || 0);
    console.log("Gossip peers:", gossipData.peers?.length || 0);
    console.log("Top rewards:", topRewardsData.rewards?.length || 0);

    // Fetch blockchain events from database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { data: blockchainEvents, error: dbError } = await supabase
      .from('winner_events')
      .select('peer_id, round_number')
      .order('block_number', { ascending: true });

    if (dbError) {
      console.error('Error fetching blockchain events:', dbError);
    } else {
      console.log(`Blockchain events from DB: ${blockchainEvents?.length || 0}`);
    }

    // Build a map of all unique peers with their metrics
    const peerMap = new Map<string, { participations: number; wins: number; source: 'api' | 'blockchain' | 'both' }>();

    // Add peers from leaderboard (top 100 with full stats)
    (leaderboardData.entries || []).forEach((entry: any) => {
      const participation = entry.participation ?? entry.participations ?? entry.score ?? 0;
      const rewards = entry.trainingRewards ?? entry.training_rewards ?? entry.reward ?? 0;
      
      peerMap.set(entry.peerId, {
        participations: participation,
        wins: rewards,
        source: 'api',
      });
    });

    // Add peers from gossip messages (all active peers)
    (gossipData.peers || []).forEach((peer: any) => {
      const peerId = peer.peerId || peer.peer_id || peer.id;
      if (peerId && !peerMap.has(peerId)) {
        peerMap.set(peerId, {
          participations: peer.participations || peer.score || 0,
          wins: peer.rewards || peer.reward || 0,
          source: 'api',
        });
      }
    });

    // Add/update peers from top rewards
    (topRewardsData.rewards || []).forEach((entry: any) => {
      const peerId = entry.peerId || entry.peer_id;
      if (peerId) {
        const existing = peerMap.get(peerId);
        const rewards = entry.totalRewards || entry.total_rewards || entry.reward || 0;
        
        if (existing) {
          existing.wins = Math.max(existing.wins, rewards);
        } else {
          peerMap.set(peerId, {
            participations: entry.participations || entry.score || 0,
            wins: rewards,
            source: 'api',
          });
        }
      }
    });

    // Add peers from blockchain winner events
    if (blockchainEvents && blockchainEvents.length > 0) {
      blockchainEvents.forEach((event: any) => {
        const peerId = event.peer_id;
        if (peerId) {
          const existing = peerMap.get(peerId);
          if (existing) {
            existing.participations += 1;
            existing.wins += 1;
            existing.source = 'both';
          } else {
            peerMap.set(peerId, {
              participations: 1,
              wins: 1,
              source: 'blockchain',
            });
          }
        }
      });
    }

    // Count peer sources
    let fromApi = 0;
    let fromBlockchain = 0;
    peerMap.forEach((value) => {
      if (value.source === 'api') fromApi++;
      else if (value.source === 'blockchain') fromBlockchain++;
      else if (value.source === 'both') {
        fromApi++;
        fromBlockchain++;
      }
    });

    console.log(`Total unique peers found (API + Blockchain): ${peerMap.size}`);

    // Convert map to array and sort by participation (desc), then wins (desc), then peerId (asc)
    const entries: LeaderboardEntry[] = Array.from(peerMap.entries())
      .map(([peerId, metrics]) => ({
        rank: 0,
        peerId,
        participations: metrics.participations,
        wins: metrics.wins,
      }))
      .sort((a, b) => {
        // Sort by participations (descending)
        if (b.participations !== a.participations) {
          return b.participations - a.participations;
        }
        // Tie-break by wins (descending)
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        // Tie-break by peerId (ascending)
        return a.peerId.localeCompare(b.peerId);
      });

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    console.log("Network stats data:", JSON.stringify(networkStatsData));
    console.log("Nodes connected data:", JSON.stringify(nodesConnectedData));
    
    // Extract models trained from network-stats (completedTransactions)
    const modelsTrained = networkStatsData?.completedTransactions || 0;
    
    // Extract nodes connected from nodes-connected (count)
    const nodesConnected = nodesConnectedData?.count || 0;
    
    console.log("Extracted models trained:", modelsTrained);
    console.log("Extracted nodes connected:", nodesConnected);
    
    const result: CacheData = {
      entries,
      updatedAt: leaderboardData.updatedAt || new Date().toISOString(),
      stats: {
        currentRound: modelsTrained,
        currentStage: nodesConnected,
        uniqueVoters: uniqueVotersData?.uniqueVoters || uniqueVotersData?.count || 0,
        uniqueVotedPeers: entries.length,
      },
      peerSources: {
        fromApi,
        fromBlockchain,
        total: peerMap.size,
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

    // Always return the full leaderboard so the frontend can paginate over ALL peers
    const pageEntries = data.entries;

    return new Response(
      JSON.stringify({
        entries: pageEntries,
        total,
        updatedAt: data.updatedAt,
        stats: data.stats,
        peerSources: data.peerSources,
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
