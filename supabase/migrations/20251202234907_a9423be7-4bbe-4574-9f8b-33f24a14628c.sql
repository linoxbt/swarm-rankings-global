-- Add unique constraint on transaction_hash + peer_id for proper upsert handling
ALTER TABLE public.winner_events 
ADD CONSTRAINT winner_events_tx_peer_unique UNIQUE (transaction_hash, peer_id);