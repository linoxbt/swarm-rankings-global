import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Database, RefreshCw, Play, Square, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SyncProgressPanelProps {
  peerSources: {
    fromApi: number;
    fromBlockchain: number;
    total: number;
  };
  onSyncComplete?: () => void;
}

interface SyncStatus {
  isRunning: boolean;
  autoSync: boolean;
  progress: number;
  fromBlock: number;
  toBlock: number;
  currentBlock: number;
  remainingBlocks: number;
  processedEvents: number;
  totalProcessedEvents: number;
  error: string | null;
  lastSyncTime: string | null;
}

export const SyncProgressPanel = ({ peerSources, onSyncComplete }: SyncProgressPanelProps) => {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isRunning: false,
    autoSync: false,
    progress: 0,
    fromBlock: 0,
    toBlock: 0,
    currentBlock: 0,
    remainingBlocks: 0,
    processedEvents: 0,
    totalProcessedEvents: 0,
    error: null,
    lastSyncTime: null,
  });
  const { toast } = useToast();

  const runSync = useCallback(async (): Promise<boolean> => {
    try {
      setSyncStatus(prev => ({ ...prev, isRunning: true, error: null }));

      const { data, error } = await supabase.functions.invoke('blockchain-listener', {
        body: {}
      });

      if (error) throw error;

      const needsMore = data.needsMoreSync && data.remainingBlocks > 0;
      
      setSyncStatus(prev => ({
        ...prev,
        isRunning: needsMore && prev.autoSync,
        progress: data.progress || 0,
        fromBlock: data.fromBlock || 0,
        toBlock: data.toBlock || 0,
        currentBlock: data.currentBlock || 0,
        remainingBlocks: data.remainingBlocks || 0,
        processedEvents: data.processedEvents || 0,
        totalProcessedEvents: prev.totalProcessedEvents + (data.processedEvents || 0),
        lastSyncTime: new Date().toISOString(),
      }));

      if (!needsMore) {
        toast({
          title: "Sync Complete",
          description: `All blockchain data synchronized. Total events: ${syncStatus.totalProcessedEvents + (data.processedEvents || 0)}`,
        });
        onSyncComplete?.();
      }

      return needsMore;
    } catch (error: any) {
      console.error("Sync error:", error);
      setSyncStatus(prev => ({
        ...prev,
        isRunning: false,
        autoSync: false,
        error: error.message || "Sync failed",
      }));
      toast({
        title: "Sync Error",
        description: error.message || "Failed to sync blockchain data",
        variant: "destructive",
      });
      return false;
    }
  }, [toast, onSyncComplete, syncStatus.totalProcessedEvents]);

  // Auto-sync loop
  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const autoSyncLoop = async () => {
      if (!mounted || !syncStatus.autoSync || syncStatus.isRunning) return;
      
      const needsMore = await runSync();
      
      if (mounted && needsMore && syncStatus.autoSync) {
        // Continue after a short delay
        timeoutId = setTimeout(autoSyncLoop, 2000);
      }
    };

    if (syncStatus.autoSync && !syncStatus.isRunning) {
      autoSyncLoop();
    }

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [syncStatus.autoSync, syncStatus.isRunning, runSync]);

  const handleStartAutoSync = () => {
    setSyncStatus(prev => ({ ...prev, autoSync: true, totalProcessedEvents: 0 }));
    toast({
      title: "Auto-sync started",
      description: "Syncing blockchain data continuously until complete...",
    });
  };

  const handleStopAutoSync = () => {
    setSyncStatus(prev => ({ ...prev, autoSync: false, isRunning: false }));
    toast({
      title: "Auto-sync stopped",
      description: "Sync paused. Click Start to continue.",
    });
  };

  const handleManualSync = async () => {
    if (syncStatus.isRunning) return;
    await runSync();
    onSyncComplete?.();
  };

  const formatNumber = (num: number) => num.toLocaleString();

  const overallProgress = syncStatus.currentBlock > 0 
    ? Math.round(((syncStatus.toBlock - 10000000) / (syncStatus.currentBlock - 10000000)) * 100)
    : 0;

  return (
    <div className="mb-4 p-4 bg-secondary/30 border border-border rounded-md space-y-4">
      {/* Data Sources Row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-mono font-semibold text-foreground">Data Sources:</span>
        </div>
        <Badge variant="outline" className="font-mono">
          API: {formatNumber(peerSources.fromApi)}
        </Badge>
        <Badge variant="outline" className="font-mono">
          Blockchain: {formatNumber(peerSources.fromBlockchain)}
        </Badge>
        <Badge variant="default" className="font-mono">
          Total Peers: {formatNumber(peerSources.total)}
        </Badge>
      </div>

      {/* Sync Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-mono text-muted-foreground">Blockchain Sync:</span>
        
        {!syncStatus.autoSync ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartAutoSync}
              disabled={syncStatus.isRunning}
              className="font-mono terminal-border"
            >
              <Play className="h-4 w-4 mr-2" />
              Auto-Sync All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualSync}
              disabled={syncStatus.isRunning}
              className="font-mono"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncStatus.isRunning ? 'animate-spin' : ''}`} />
              Sync Once
            </Button>
          </>
        ) : (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStopAutoSync}
            className="font-mono"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop Sync
          </Button>
        )}

        {syncStatus.isRunning && (
          <Badge variant="secondary" className="font-mono animate-pulse">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Syncing...
          </Badge>
        )}

        {!syncStatus.isRunning && syncStatus.remainingBlocks === 0 && syncStatus.lastSyncTime && (
          <Badge variant="default" className="font-mono bg-emerald-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            Fully Synced
          </Badge>
        )}

        {syncStatus.error && (
          <Badge variant="destructive" className="font-mono">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )}
      </div>

      {/* Progress Bar (show when syncing or has progress) */}
      {(syncStatus.isRunning || syncStatus.remainingBlocks > 0 || syncStatus.lastSyncTime) && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-mono text-muted-foreground">
            <span>Block {formatNumber(syncStatus.toBlock)} / {formatNumber(syncStatus.currentBlock)}</span>
            <span>{overallProgress}% synced</span>
          </div>
          <Progress value={overallProgress} className="h-2" />
          <div className="flex flex-wrap justify-between text-xs font-mono text-muted-foreground">
            <span>
              {syncStatus.remainingBlocks > 0 
                ? `${formatNumber(syncStatus.remainingBlocks)} blocks remaining`
                : 'All blocks synced'}
            </span>
            <span>
              {syncStatus.totalProcessedEvents > 0 && `${formatNumber(syncStatus.totalProcessedEvents)} events processed`}
            </span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {syncStatus.error && (
        <div className="text-xs font-mono text-destructive bg-destructive/10 p-2 rounded">
          {syncStatus.error}
        </div>
      )}
    </div>
  );
};
