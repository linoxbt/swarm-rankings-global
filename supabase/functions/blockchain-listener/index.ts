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

// Use HTTP RPC (more reliable for queries) - Alchemy public endpoint
const RPC_URL = 'https://gensyn-testnet.g.alchemy.com/public';
const CONTRACT_ADDRESS = '0xFaD7C5e93f28257429569B854151A1B8DCD404c2';

// Alchemy free tier limit: 10 blocks per eth_getLogs request
const BATCH_SIZE = 10;
const DELAY_BETWEEN_REQUESTS_MS = 200; // Avoid rate limits

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

    // If no metadata, start from a reasonable recent block (not 0)
    // The contract deployment block or a recent block to avoid scanning millions of blocks
    const START_BLOCK = 11000000; // Reasonable starting point for Gensyn testnet
    let fromBlock = metadata?.last_synced_block || START_BLOCK;
    console.log(`Syncing from block: ${fromBlock}`);

    // Connect to blockchain via HTTP
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, SWARM_ABI, provider);

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    // Limit processing to avoid timeout (max ~500 batches per invocation = 5000 blocks)
    const MAX_BLOCKS_PER_RUN = 5000;
    const targetBlock = Math.min(fromBlock + MAX_BLOCKS_PER_RUN, currentBlock);
    
    let processedEvents = 0;
    let lastProcessedBlock = fromBlock;

    for (let start = fromBlock; start < targetBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, targetBlock);
      
      try {
        const filter = contract.filters.WinnersDeclared();
        const events = await contract.queryFilter(filter, start, end);

        if (events.length > 0) {
          console.log(`Found ${events.length} WinnersDeclared events in blocks ${start}-${end}`);
        }

        // Process events
        for (const event of events) {
          if (!('args' in event) || !event.args) continue;
          
          const [round, winners, rewards] = event.args as unknown as [bigint, string[], bigint[]];
          
          // Get block timestamp
          const block = await event.getBlock();
          const eventTimestamp = block ? new Date(Number(block.timestamp) * 1000).toISOString() : new Date().toISOString();
          
          // Insert each winner as a separate event
          for (let i = 0; i < winners.length; i++) {
            const peerId = winners[i];
            const reward = rewards[i] ? Number(rewards[i]) : 0;
            
            const { error: insertError } = await supabase
              .from('winner_events')
              .upsert({
                peer_id: peerId,
                block_number: event.blockNumber,
                transaction_hash: event.transactionHash,
                round_number: Number(round),
                event_timestamp: eventTimestamp,
              }, {
                onConflict: 'transaction_hash,peer_id',
                ignoreDuplicates: true
              });

            if (insertError && !insertError.message.includes('duplicate')) {
              console.error('Error inserting event:', insertError);
            } else {
              processedEvents++;
            }
          }
        }

        lastProcessedBlock = end;
        
        // Rate limiting delay
        await sleep(DELAY_BETWEEN_REQUESTS_MS);

      } catch (batchError: any) {
        // Handle rate limit specifically
        if (batchError?.error?.code === 429) {
          console.log('Rate limited, waiting 1 second...');
          await sleep(1000);
          start -= BATCH_SIZE; // Retry this batch
          continue;
        }
        console.error(`Error processing batch ${start}-${end}:`, batchError?.message || batchError);
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
    console.log(`Blockchain sync complete. Processed ${processedEvents} events. Remaining blocks: ${remainingBlocks}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${processedEvents} events from block ${fromBlock} to ${lastProcessedBlock}`,
        fromBlock,
        toBlock: lastProcessedBlock,
        currentBlock,
        processedEvents,
        remainingBlocks,
        needsMoreSync: remainingBlocks > 0,
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
        details: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
