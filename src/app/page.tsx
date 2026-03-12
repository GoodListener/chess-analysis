'use client';

import { useState } from 'react';
import { fetchLatestGames, ChessGame } from '@/lib/chess-com';
import Link from 'next/link';
import { Search, ChevronRight, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [username, setUsername] = useState('');
  const [games, setGames] = useState<ChessGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pgnInput, setPgnInput] = useState('');
  const router = useRouter();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;

    setLoading(true);
    setError('');
    setGames([]);

    try {
      const fetchedGames = await fetchLatestGames(username);
      setGames(fetchedGames);
      if (fetchedGames.length === 0) {
        setError('No games found for this user.');
      }
    } catch (err) {
      setError('Failed to fetch games. Make sure the username is correct.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePgnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pgnInput.trim()) {
      router.push(`/analyze?pgn=${encodeURIComponent(pgnInput.trim())}`);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Chess Analysis</h1>
          <p className="text-slate-600">Enter your Chess.com username to analyze your games with Stockfish.</p>
        </header>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <form onSubmit={handleSearch} className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Search Chess.com User</label>
            <div className="relative group">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter Chess.com username"
                className="w-full px-6 py-4 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-lg transition-all shadow-sm group-hover:shadow-md"
              />
              <button
                type="submit"
                disabled={loading}
                className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-700 text-white px-6 rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Searching...' : (
                  <>
                    <Search size={20} />
                    Search
                  </>
                )}
              </button>
            </div>
            {error && <p className="mt-2 text-red-500 font-medium">{error}</p>}
          </form>

          <div className="border-t border-slate-100 pt-6">
            <form onSubmit={handlePgnSubmit}>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Or Paste PGN directly</label>
              <textarea
                value={pgnInput}
                onChange={(e) => setPgnInput(e.target.value)}
                placeholder="[Event &quot;FIDE World Cup 2023&quot;]..."
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:outline-none text-sm transition-all shadow-sm h-24 resize-none font-mono"
              />
              <button
                type="submit"
                disabled={!pgnInput.trim()}
                className="mt-3 bg-slate-800 hover:bg-slate-900 text-white px-6 py-2.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                Analyze PGN
              </button>
            </form>
          </div>
        </div>

        <div className="grid gap-4">
          {games.map((game, index) => (
            <div
              key={game.uuid || index}
              className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex items-center gap-2 text-slate-700">
                    <User size={16} />
                    <span className="font-semibold">{game.white.username}</span>
                    <span className="text-slate-400">({game.white.rating})</span>
                  </div>
                  <span className="text-slate-400 font-medium italic">vs</span>
                  <div className="flex items-center gap-2 text-slate-700">
                    <User size={16} />
                    <span className="font-semibold">{game.black.username}</span>
                    <span className="text-slate-400">({game.black.rating})</span>
                  </div>
                </div>
                <div className="text-sm text-slate-500">
                  {new Date(game.end_time * 1000).toLocaleDateString()} • {game.white.result === 'win' ? 'White won' : game.black.result === 'win' ? 'Black won' : 'Draw'}
                </div>
              </div>
              <Link
                href={`/analyze?pgn=${encodeURIComponent(game.pgn)}`}
                className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Analyze
                <ChevronRight size={18} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
