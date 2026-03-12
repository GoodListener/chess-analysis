export interface ChessGame {
  url: string;
  pgn: string;
  fen: string;
  white: {
    username: string;
    rating: number;
    result: string;
  };
  black: {
    username: string;
    rating: number;
    result: string;
  };
  end_time: number;
  uuid: string;
}

export interface Archive {
  archives: string[];
}

export async function fetchUserArchives(username: string): Promise<string[]> {
  const response = await fetch(`https://api.chess.com/pub/player/${username}/games/archives`);
  if (!response.ok) {
    throw new Error('User not found or API error');
  }
  const data: Archive = await response.json();
  return data.archives;
}

export async function fetchGamesByArchive(url: string): Promise<ChessGame[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch games from archive');
  }
  const data = await response.json();
  return data.games;
}

export async function fetchLatestGames(username: string): Promise<ChessGame[]> {
  const archives = await fetchUserArchives(username);
  if (archives.length === 0) return [];
  
  // Get the most recent archive (last in the list)
  const latestArchiveUrl = archives[archives.length - 1];
  const games = await fetchGamesByArchive(latestArchiveUrl);
  
  // Sort by end_time descending
  return games.sort((a, b) => b.end_time - a.end_time);
}
