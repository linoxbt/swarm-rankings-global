import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ethers } from "npm:ethers@^6.13.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Contract configuration
const CONTRACT_ADDRESS = "0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0";
const DEFAULT_RPC_URL = "https://gensyn-testnet.g.alchemy.com/public";

const SWARM_COORDINATOR_ABI = [
  {
    "inputs": [],
    "name": "currentRound",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentStage",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniqueVoters",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniqueVotedPeers",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "start", "type": "uint256" },
      { "internalType": "uint256", "name": "end", "type": "uint256" }
    ],
    "name": "winnerLeaderboard",
    "outputs": [
      { "internalType": "string[]", "name": "peerIds", "type": "string[]" },
      { "internalType": "uint256[]", "name": "wins", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "round", "type": "uint256" },
      { "indexed": false, "internalType": "string[]", "name": "winners", "type": "string[]" },
      { "indexed": false, "internalType": "uint256[]", "name": "rewards", "type": "uint256[]" }
    ],
    "name": "WinnersDeclared",
    "type": "event"
  }
];

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

function getContract() {
  const rpcUrl = Deno.env.get('GENSYN_RPC_URL') || DEFAULT_RPC_URL;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(CONTRACT_ADDRESS, SWARM_COORDINATOR_ABI, provider);
}

async function buildFullLeaderboard(): Promise<CacheData> {
  console.log("Building full leaderboard from events...");
  
  const now = Date.now();
  if (cache && (now - cacheTimestamp) < CACHE_TTL) {
    console.log("Returning cached data");
    return cache;
  }

  const contract = getContract();
  
  // Fetch contract stats
  const [currentRound, currentStage, uniqueVoters, uniqueVotedPeers] = await Promise.all([
    contract.currentRound(),
    contract.currentStage(),
    contract.uniqueVoters(),
    contract.uniqueVotedPeers(),
  ]);

  console.log(`Contract stats - Round: ${currentRound}, Stage: ${currentStage}, Voters: ${uniqueVoters}, Voted Peers: ${uniqueVotedPeers}`);

  // Maps to track participations and wins
  const participationsMap = new Map<string, number>();
  const winsMap = new Map<string, number>();

  try {
    // Query WinnersDeclared events from block 0 to latest
    console.log("Fetching WinnersDeclared events...");
    const filter = contract.filters.WinnersDeclared();
    const events = await contract.queryFilter(filter, 0, 'latest');
    
    console.log(`Found ${events.length} WinnersDeclared events`);

    // Process each event
    for (const event of events) {
      if (!('args' in event)) continue;
      const args = event.args;
      if (!args) continue;

      const winners = args.winners as string[];
      const rewards = args.rewards as bigint[];

      for (let i = 0; i < winners.length; i++) {
        const peerId = winners[i];
        
        // Increment participations
        participationsMap.set(peerId, (participationsMap.get(peerId) || 0) + 1);
        
        // Add wins (if rewards field exists, use it; otherwise use 1)
        const winValue = rewards && rewards[i] ? Number(rewards[i]) : 1;
        winsMap.set(peerId, (winsMap.get(peerId) || 0) + winValue);
      }
    }

    console.log(`Processed ${participationsMap.size} unique peers`);
  } catch (error) {
    console.error("Error fetching events:", error);
    // If event fetching fails, we can still return the stats
  }

  // Build leaderboard entries
  const entries: LeaderboardEntry[] = [];
  for (const [peerId, participations] of participationsMap.entries()) {
    entries.push({
      rank: 0, // Will be set after sorting
      peerId,
      participations,
      wins: winsMap.get(peerId) || participations,
    });
  }

  // Sort by participations (DESC), then wins (DESC), then peerId (ASC)
  entries.sort((a, b) => {
    if (b.participations !== a.participations) {
      return b.participations - a.participations;
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    return a.peerId.localeCompare(b.peerId);
  });

  // Assign ranks
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const result: CacheData = {
    entries,
    updatedAt: new Date().toISOString(),
    stats: {
      currentRound: Number(currentRound),
      currentStage: Number(currentStage),
      uniqueVoters: Number(uniqueVoters),
      uniqueVotedPeers: Number(uniqueVotedPeers),
    },
  };

  // Update cache
  cache = result;
  cacheTimestamp = now;

  console.log(`Leaderboard built with ${entries.length} entries`);
  return result;
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
