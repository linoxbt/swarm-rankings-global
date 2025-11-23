-- Create table to store winner events from blockchain
CREATE TABLE IF NOT EXISTS public.winner_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_id TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash TEXT NOT NULL,
  round_number BIGINT,
  event_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(transaction_hash, peer_id)
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_winner_events_peer_id ON public.winner_events(peer_id);
CREATE INDEX IF NOT EXISTS idx_winner_events_block_number ON public.winner_events(block_number);
CREATE INDEX IF NOT EXISTS idx_winner_events_created_at ON public.winner_events(created_at DESC);

-- Create table to track blockchain sync progress
CREATE TABLE IF NOT EXISTS public.blockchain_sync_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_address TEXT NOT NULL UNIQUE,
  last_synced_block BIGINT NOT NULL DEFAULT 0,
  last_sync_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.winner_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blockchain_sync_metadata ENABLE ROW LEVEL SECURITY;

-- Public read access (leaderboard is public)
CREATE POLICY "Allow public read on winner_events" 
  ON public.winner_events 
  FOR SELECT 
  USING (true);

CREATE POLICY "Allow public read on blockchain_sync_metadata" 
  ON public.blockchain_sync_metadata 
  FOR SELECT 
  USING (true);

-- Service role can write
CREATE POLICY "Service role can insert winner_events" 
  ON public.winner_events 
  FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Service role can update blockchain_sync_metadata" 
  ON public.blockchain_sync_metadata 
  FOR ALL 
  USING (true);