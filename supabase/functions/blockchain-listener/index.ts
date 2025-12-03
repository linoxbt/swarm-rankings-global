import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.13.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Contract ABI for WinnersDeclared event
const SWARM_ABI = [
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

// Use Gensyn public RPC (no rate limits like Alchemy free tier)
const RPC_URL = 'https://rpc.gensyn.ai';
const FALLBACK_RPC_URL = 'https://gensyn-testnet.g.alchemy.com/v2/public';
const CONTRACT_ADDRESS = '0xFaD7C5e93f28257429569B854151A1B8DCD404c2';

// Larger batch size for public RPC (adjust if errors occur)
const BATCH_SIZE = 2000;
const MAX_BLOCKS_PER_RUN = 50000; // Process more blocks per run

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting blockchain listener...');

    // Get last synced block from metadata
    const { data: metadata } = await supabase
      .from('blockchain_sync_metadata')
      .select('last_synced_block')
      .eq('contract_address', CONTRACT_ADDRESS.toLowerCase())
      .single();

    // Start from a reasonable recent block
    const START_BLOCK = 10000000;
    let fromBlock = metadata?.last_synced_block || START_BLOCK;
    console.log(`Syncing from block: ${fromBlock}`);

    // Try primary RPC, fallback to secondary
    let provider: ethers.JsonRpcProvider;
    let currentBlock: number;
    
    try {
      provider = new ethers.JsonRpcProvider(RPC_URL);
      currentBlock = await provider.getBlockNumber();
      console.log(`Connected to primary RPC. Current block: ${currentBlock}`);
    } catch (rpcError) {
      console.log('Primary RPC failed, trying fallback...');
      provider = new ethers.JsonRpcProvider(FALLBACK_RPC_URL);
      currentBlock = await provider.getBlockNumber();
      console.log(`Connected to fallback RPC. Current block: ${currentBlock}`);
    }

    const contract = new ethers.Contract(CONTRACT_ADDRESS, SWARM_ABI, provider);

    // Calculate target block for this run
    const targetBlock = Math.min(fromBlock + MAX_BLOCKS_PER_RUN, currentBlock);
    const totalBlocksToSync = currentBlock - fromBlock;
    const blocksThisRun = targetBlock - fromBlock;
    
    let processedEvents = 0;
    let lastProcessedBlock = fromBlock;
    let batchErrors = 0;

    for (let start = fromBlock; start < targetBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, targetBlock);
      
      try {
        const filter = contract.filters.WinnersDeclared();
        const events = await contract.queryFilter(filter, start, end);

        if (events.length > 0) {
          console.log(`Found ${events.length} WinnersDeclared events in blocks ${start}-${end}`);
          
          // Process events in batch
          for (const event of events) {
            if (!('args' in event) || !event.args) continue;
            
            const [round, winners, rewards] = event.args as unknown as [bigint, string[], bigint[]];
            
            // Get block timestamp (batch these to reduce calls)
            let eventTimestamp = new Date().toISOString();
            try {
              const block = await event.getBlock();
              if (block) {
                eventTimestamp = new Date(Number(block.timestamp) * 1000).toISOString();
              }
            } catch (e) {
              // Use current time if block fetch fails
            }
            
            // Insert each winner as a separate event
            const insertBatch = winners.map((peerId, i) => ({
              peer_id: peerId,
              block_number: event.blockNumber,
              transaction_hash: event.transactionHash,
              round_number: Number(round),
              event_timestamp: eventTimestamp,
            }));

            const { error: insertError } = await supabase
              .from('winner_events')
              .upsert(insertBatch, {
                onConflict: 'transaction_hash,peer_id',
                ignoreDuplicates: true
              });

            if (insertError && !insertError.message.includes('duplicate')) {
              console.error('Error inserting events:', insertError);
            } else {
              processedEvents += winners.length;
            }
          }
        }

        lastProcessedBlock = end;

      } catch (batchError: any) {
        batchErrors++;
        console.error(`Error processing batch ${start}-${end}:`, batchError?.message || batchError);
        
        // If too many errors, try smaller batch
        if (batchErrors > 5) {
          console.log('Too many errors, stopping this run');
          break;
        }
        
        // Brief delay on error
        await sleep(500);
      }
    }

    // Update sync metadata
    if (lastProcessedBlock > fromBlock) {
      await supabase
        .from('blockchain_sync_metadata')
        .upsert({
          contract_address: CONTRACT_ADDRESS.toLowerCase(),
          last_synced_block: lastProcessedBlock,
          last_sync_timestamp: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'contract_address',
        });
    }

    const remainingBlocks = currentBlock - lastProcessedBlock;
    const progress = totalBlocksToSync > 0 
      ? Math.round(((lastProcessedBlock - fromBlock) / totalBlocksToSync) * 100)
      : 100;

    console.log(`Sync complete. Processed ${processedEvents} events. Remaining: ${remainingBlocks} blocks`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${processedEvents} events`,
        fromBlock,
        toBlock: lastProcessedBlock,
        currentBlock,
        processedEvents,
        remainingBlocks,
        totalBlocksToSync,
        progress,
        needsMoreSync: remainingBlocks > 0,
        batchErrors,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Blockchain listener error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: 'Failed to sync blockchain events',
        details: errorMessage,
        success: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
