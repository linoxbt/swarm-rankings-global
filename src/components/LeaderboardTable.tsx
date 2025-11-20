import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LeaderboardEntry {
  rank: number;
  peerId: string;
  participations: number;
  wins: number;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  isLoading?: boolean;
}

const truncatePeerId = (peerId: string): string => {
  if (peerId.length <= 20) return peerId;
  return `${peerId.substring(0, 10)}...${peerId.substring(peerId.length - 8)}`;
};

export const LeaderboardTable = ({ entries, isLoading }: LeaderboardTableProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-primary terminal-glow font-mono">Loading leaderboard...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground font-mono">No entries found</div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="border rounded-md terminal-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-secondary/50">
              <TableHead className="font-mono text-primary font-bold">Rank</TableHead>
              <TableHead className="font-mono text-primary font-bold">Peer ID</TableHead>
              <TableHead className="font-mono text-primary font-bold text-right">Participations</TableHead>
              <TableHead className="font-mono text-primary font-bold text-right">Wins</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={`${entry.rank}-${entry.peerId}`} className="border-border hover:bg-secondary/30">
                <TableCell className="font-mono font-bold">
                  {entry.rank <= 3 ? (
                    <Badge variant={entry.rank === 1 ? "default" : "secondary"} className="font-mono">
                      #{entry.rank}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">#{entry.rank}</span>
                  )}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">
                      {truncatePeerId(entry.peerId)}
                    </TooltipTrigger>
                    <TooltipContent className="font-mono text-xs max-w-md break-all">
                      {entry.peerId}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="font-mono text-right font-bold text-primary">
                  {entry.participations}
                </TableCell>
                <TableCell className="font-mono text-right text-muted-foreground">
                  {entry.wins}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  );
};
