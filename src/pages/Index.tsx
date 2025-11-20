import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { StatsCards } from "@/components/StatsCards";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { SearchBar } from "@/components/SearchBar";
import { InfoPanel } from "@/components/InfoPanel";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  peerId: string;
  participations: number;
  wins: number;
}

interface Stats {
  currentRound: number;
  currentStage: number;
  uniqueVoters: number;
  uniqueVotedPeers: number;
}

const Index = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [stats, setStats] = useState<Stats>({
    currentRound: 0,
    currentStage: 0,
    uniqueVoters: 0,
    uniqueVotedPeers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(0);
  const { toast } = useToast();

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      
      // Fetch all entries at once for client-side filtering and pagination
      const { data, error } = await supabase.functions.invoke('leaderboard', {
        body: { limit: 10000, offset: 0 }
      });

      if (error) throw error;

      setAllEntries(data.entries || []);
      setStats(data.stats);
      setUpdatedAt(data.updatedAt);
      setCurrentPage(0);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      toast({
        title: "Error",
        description: "Unable to load leaderboard. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Filter entries based on search query
  const filteredEntries = useMemo(() => {
    if (!searchQuery) return allEntries;
    const query = searchQuery.toLowerCase();
    return allEntries.filter(entry => 
      entry.peerId.toLowerCase().includes(query)
    );
  }, [allEntries, searchQuery]);

  // Paginate filtered entries
  const paginatedEntries = useMemo(() => {
    const start = currentPage * pageSize;
    const end = start + pageSize;
    return filteredEntries.slice(start, end);
  }, [filteredEntries, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredEntries.length / pageSize);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setCurrentPage(0);
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const startIndex = currentPage * pageSize + 1;
  const endIndex = Math.min((currentPage + 1) * pageSize, filteredEntries.length);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-2 terminal-glow text-primary font-mono">
            RL Swarm Global Leaderboard
          </h1>
          <p className="text-xl text-muted-foreground font-mono mb-1">coder-swarm</p>
          <div className="inline-block bg-secondary px-4 py-1 rounded-md border border-border">
            <span className="text-sm font-mono text-foreground">
              Live from SwarmCoordinatorProxy • Gensyn Testnet
            </span>
          </div>
          {updatedAt && (
            <p className="text-xs text-muted-foreground font-mono mt-2">
              Last updated: {new Date(updatedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Stats Cards */}
        <StatsCards
          currentRound={stats.currentRound}
          currentStage={stats.currentStage}
          uniqueVoters={stats.uniqueVoters}
          uniqueVotedPeers={stats.uniqueVotedPeers}
        />

        {/* Info Panel */}
        <InfoPanel />

        {/* Search and Controls */}
        <div className="mb-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex-1 w-full sm:max-w-md">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>
          <div className="flex gap-2">
            <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-32 font-mono terminal-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchLeaderboard}
              disabled={loading}
              className="terminal-border"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {searchQuery && (
          <div className="mb-4 text-sm text-muted-foreground font-mono">
            Filtering results by "{searchQuery}" • {filteredEntries.length} matches
          </div>
        )}

        {/* Leaderboard Table */}
        <LeaderboardTable entries={paginatedEntries} isLoading={loading} />

        {/* Pagination */}
        {!loading && filteredEntries.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-sm text-muted-foreground font-mono">
              Showing {startIndex}–{endIndex} of {filteredEntries.length} nodes
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevPage}
                disabled={currentPage === 0}
                className="font-mono terminal-border"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextPage}
                disabled={currentPage >= totalPages - 1}
                className="font-mono terminal-border"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center">
          <p className="text-sm text-muted-foreground/70 font-mono">
            Made by marisdigitals11/steste
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
