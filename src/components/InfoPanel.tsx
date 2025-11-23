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
          This dashboard attempts to reconstruct a global leaderboard by scanning the Gensyn API endpoints (<code>/leaderboard</code>, <code>/gossip-messages</code>, <code>/top-rewards</code>).
        </p>
        <p>
          <strong className="text-destructive">⚠ Data Limitation:</strong> Currently, the Gensyn API endpoints only expose data for the top ~100 peers. Historical data for all ever-active nodes is not available through these endpoints.
        </p>
        <p>
          Rankings are based on <strong className="text-primary">participations</strong> (how many times a peer appears as a winner), with wins shown separately as additional context.
        </p>
      </CardContent>
    </Card>
  );
};
