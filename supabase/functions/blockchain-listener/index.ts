import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ethers } from 'https://esm.sh/ethers@6.13.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Contract ABI for Winner events (minimal - just what we need)
const SWARM_ABI = [
  "event Winner(address indexed winner, bytes32 indexed peerId, uint256 round)",
  "function getCurrentRound() view returns (uint256)"
];

const RPC_URL = 'wss://gensyn-testnet.g.alchemy.com/v2/Ee27UnNxpPWcpIbIsXFCH';
const CONTRACT_ADDRESS = '0xFaD7C5e93f28257429569B854151A1B8DCD404c2';

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

    let fromBlock = metadata?.last_synced_block || 0;
    console.log(`Syncing from block: ${fromBlock}`);

    // Connect to blockchain
    const provider = new ethers.WebSocketProvider(RPC_URL);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, SWARM_ABI, provider);

    // Get current block
    const currentBlock = await provider.getBlockNumber();
    console.log(`Current block: ${currentBlock}`);

    // Fetch historical events in batches
    const BATCH_SIZE = 10000;
    let processedEvents = 0;

    for (let start = fromBlock; start < currentBlock; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, currentBlock);
      console.log(`Fetching events from block ${start} to ${end}`);

      try {
        const filter = contract.filters.Winner();
        const events = await contract.queryFilter(filter, start, end);

        console.log(`Found ${events.length} Winner events in batch`);

        // Process events
        for (const event of events) {
          if (!('args' in event) || !event.args) continue;
          
          const { winner, peerId, round } = event.args as any;
          const peerIdString = ethers.decodeBytes32String(peerId);

          // Insert into database (ON CONFLICT DO NOTHING to avoid duplicates)
          const { error: insertError } = await supabase
            .from('winner_events')
            .insert({
              peer_id: peerIdString,
              block_number: event.blockNumber,
              transaction_hash: event.transactionHash,
              round_number: Number(round),
              event_timestamp: new Date().toISOString(),
            })
            .select()
            .single();

          if (insertError && !insertError.message.includes('duplicate')) {
            console.error('Error inserting event:', insertError);
          } else {
            processedEvents++;
          }
        }

        // Update sync metadata
        await supabase
          .from('blockchain_sync_metadata')
          .upsert({
            contract_address: CONTRACT_ADDRESS.toLowerCase(),
            last_synced_block: end,
            last_sync_timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'contract_address',
          });

      } catch (batchError) {
        console.error(`Error processing batch ${start}-${end}:`, batchError);
      }
    }

    await provider.destroy();

    console.log(`Blockchain sync complete. Processed ${processedEvents} new events.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${processedEvents} events from block ${fromBlock} to ${currentBlock}`,
        fromBlock,
        toBlock: currentBlock,
        processedEvents,
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
