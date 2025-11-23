import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export const InfoPanel = () => {
  return (
    <Card className="terminal-border bg-card mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary font-mono">
          <Info className="h-5 w-5" />
          About This Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground font-mono space-y-2">
        <p>
          The official on-chain <code className="text-primary">winnerLeaderboard</code> function only exposes the top 100 entries.
        </p>
        <p>
          This dashboard <strong className="text-primary">combines two data sources</strong>:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><strong>Gensyn API</strong>: Real-time stats for top 100 peers</li>
          <li><strong>Blockchain Events</strong>: Historical winner events from the SwarmCoordinator contract</li>
        </ul>
        <p>
          By merging these sources, we reconstruct a <strong className="text-foreground">complete global leaderboard</strong> showing ALL peers who have ever participated, not just the current top 100.
        </p>
        <p>
          Rankings are based on <strong className="text-primary">participations</strong> (appearances in winner events), with wins shown separately.
        </p>
        <p className="text-xs text-muted-foreground/70 pt-2">
          🔄 Blockchain data syncs automatically every 5 minutes
        </p>
      </CardContent>
    </Card>
  );
};
