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
          This dashboard reconstructs a <strong className="text-foreground">global leaderboard for ALL nodes</strong> by scanning historical winner events from the SwarmCoordinatorProxy contract.
        </p>
        <p>
          Rankings are based on <strong className="text-primary">participations</strong> (how many times a peer appears as a winner), with wins shown separately as additional context.
        </p>
      </CardContent>
    </Card>
  );
};
