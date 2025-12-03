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
      <CardContent className="text-sm text-muted-foreground font-mono">
        <p>
          Track all RL-Swarm nodes on the Gensyn Testnet. Rankings are based on <strong className="text-primary">participations</strong> in winner events.
        </p>
      </CardContent>
    </Card>
  );
};
