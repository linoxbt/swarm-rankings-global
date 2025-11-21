import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Target, TrendingUp } from "lucide-react";

interface StatsCardsProps {
  currentRound: number;
  currentStage: number;
  uniqueVoters: number;
  uniqueVotedPeers: number;
}

export const StatsCards = ({ currentRound, currentStage, uniqueVoters, uniqueVotedPeers }: StatsCardsProps) => {
  const stats = [
    {
      title: "Total Transactions",
      value: currentRound.toLocaleString(),
      icon: Activity,
    },
    {
      title: "Connected Nodes",
      value: currentStage.toLocaleString(),
      icon: Target,
    },
    {
      title: "Active Users",
      value: uniqueVoters.toLocaleString(),
      icon: Users,
    },
    {
      title: "Total Peers",
      value: uniqueVotedPeers.toLocaleString(),
      icon: TrendingUp,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="terminal-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
                {stat.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono terminal-glow text-primary">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
