import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.13.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Blockscout API for Gensyn testnet (no auth required)
const BLOCKSCOUT_API = 'https://gensyn-testnet.explorer.alchemy.com/api';
const CONTRACT_ADDRESS = '0xFaD7C5e93f28257429569B854151A1B8DCD404c2';

// WinnersDeclared event signature: keccak256("WinnersDeclared(uint256,string[],uint256[])")
const WINNERS_DECLARED_TOPIC = '0x6573c813f7617c0f7c6e3c89e1eb0a3e77eed41d7f3e30e58e30f4f3e88b4b72';

// Batch size for API calls
const BATCH_SIZE = 10000;
const MAX_BLOCKS_PER_RUN = 100000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting blockchain listener via Blockscout API...');

    // Get last synced block from metadata
    const { data: metadata } = await supabase
      .from('blockchain_sync_metadata')
      .select('last_synced_block')
      .eq('contract_address', CONTRACT_ADDRESS.toLowerCase())
      .single();

    const START_BLOCK = 10000000;
    let fromBlock = metadata?.last_synced_block || START_BLOCK;
    console.log(`Syncing from block: ${fromBlock}`);

    // Get current block number from Blockscout
    let currentBlock: number;
    try {
      const blockResponse = await fetch(`${BLOCKSCOUT_API}?module=block&action=eth_block_number`);
      const blockData = await blockResponse.json();
      currentBlock = parseInt(blockData.result, 16);
      console.log(`Current block from Blockscout: ${currentBlock}`);
    } catch (blockError: any) {
      console.error('Failed to get current block:', blockError?.message);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to get current block',
          details: blockError?.message || 'Blockscout API error',
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const targetBlock = Math.min(fromBlock + MAX_BLOCKS_PER_RUN, currentBlock);
    const totalBlocksToSync = currentBlock - fromBlock;
    
    let processedEvents = 0;
    let lastProcessedBlock = fromBlock;
    let batchErrors = 0;

    // Process in batches
    for (let start = fromBlock; start < targetBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, targetBlock);
      
      try {
        // Use Blockscout getLogs API
        const logsUrl = `${BLOCKSCOUT_API}?module=logs&action=getLogs&address=${CONTRACT_ADDRESS}&fromBlock=${start}&toBlock=${end}`;
        console.log(`Fetching logs for blocks ${start}-${end}`);
        
        const logsResponse = await fetch(logsUrl);
        const logsData = await logsResponse.json();
        
        if (logsData.status === '1' && logsData.result && logsData.result.length > 0) {
          console.log(`Found ${logsData.result.length} logs in blocks ${start}-${end}`);
          
          // Process each log
          for (const log of logsData.result) {
            try {
              // Decode the event data
              const abiCoder = new ethers.AbiCoder();
              const decoded = abiCoder.decode(
                ['uint256', 'string[]', 'uint256[]'],
                log.data
              );
              
              const round = Number(decoded[0]);
              const winners: string[] = decoded[1];
              const rewards: bigint[] = decoded[2];
              
              if (winners.length > 0) {
                // Get block timestamp
                const blockNumber = parseInt(log.blockNumber, 16);
                const timestamp = log.timeStamp 
                  ? new Date(parseInt(log.timeStamp, 16) * 1000).toISOString()
                  : new Date().toISOString();
                
                // Insert each winner as a separate event
                const insertBatch = winners.map((peerId, i) => ({
                  peer_id: peerId,
                  block_number: blockNumber,
                  transaction_hash: log.transactionHash,
                  round_number: round,
                  event_timestamp: timestamp,
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
            } catch (decodeError: any) {
              console.error('Error decoding log:', decodeError?.message);
            }
          }
        }

        lastProcessedBlock = end;

      } catch (batchError: any) {
        batchErrors++;
        console.error(`Error processing batch ${start}-${end}:`, batchError?.message || batchError);
        
        if (batchErrors > 5) {
          console.log('Too many errors, stopping this run');
          break;
        }
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
