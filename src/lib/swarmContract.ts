// Minimal ABI for SwarmCoordinator contract
export const SWARM_COORDINATOR_ABI = [
  {
    "inputs": [],
    "name": "currentRound",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentStage",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniqueVoters",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "uniqueVotedPeers",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "start", "type": "uint256" },
      { "internalType": "uint256", "name": "end", "type": "uint256" }
    ],
    "name": "winnerLeaderboard",
    "outputs": [
      { "internalType": "string[]", "name": "peerIds", "type": "string[]" },
      { "internalType": "uint256[]", "name": "wins", "type": "uint256[]" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": false, "internalType": "uint256", "name": "round", "type": "uint256" },
      { "indexed": false, "internalType": "string[]", "name": "winners", "type": "string[]" },
      { "indexed": false, "internalType": "uint256[]", "name": "rewards", "type": "uint256[]" }
    ],
    "name": "WinnersDeclared",
    "type": "event"
  }
];

export const CONTRACT_ADDRESS = "0x7745a8FE4b8D2D2c3BB103F8dCae822746F35Da0";
export const DEFAULT_RPC_URL = "https://gensyn-testnet.g.alchemy.com/public";
