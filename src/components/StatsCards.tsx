import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Users, Target, TrendingUp } from "lucide-react";

interface StatsCardsProps {
  currentRound: number;
  currentStage: number;
}

export const StatsCards = ({ currentRound, currentStage }: StatsCardsProps) => {
  const stats = [
    {
      title: "Nodes Connected",
      subtitle: "On-chain",
      value: currentStage.toLocaleString(),
      icon: Target,
    },
    {
      title: "Models Trained",
      subtitle: "On-chain",
      value: currentRound.toLocaleString(),
      icon: Activity,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.title} className="terminal-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground font-mono">
                  {stat.title}
                </CardTitle>
                <p className="text-xs text-muted-foreground/60 font-mono">
                  {stat.subtitle}
                </p>
              </div>
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
