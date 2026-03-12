'use client';

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useStockfish, Evaluation } from '@/hooks/use-stockfish';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart2, Star, CheckCircle, AlertCircle, XCircle, Info, Loader2, BookOpen } from 'lucide-react';
import Link from 'next/link';

type MoveQuality = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';

function getMoveQuality(current: Evaluation | null, previous: Evaluation | null, isWhite: boolean): { quality: MoveQuality; label: string; color: string } {
  if (current?.isBook) return { quality: 'book', label: 'Book Move', color: 'text-purple-500' };

  if (!current || !previous) return { quality: 'good', label: 'Good', color: 'text-slate-400' };

  const currVal = current.type === 'mate' ? (current.value > 0 ? 1000 : -1000) : current.value;
  const prevVal = previous.type === 'mate' ? (previous.value > 0 ? 1000 : -1000) : previous.value;
  
  const diff = isWhite ? (currVal - prevVal) : (prevVal - currVal);

  if (diff > 200) return { quality: 'brilliant', label: 'Brilliant!!', color: 'text-cyan-500' };
  if (diff > 100) return { quality: 'great', label: 'Great!', color: 'text-blue-500' };
  if (diff > -10) return { quality: 'best', label: 'Best Move', color: 'text-green-500' };
  if (diff > -50) return { quality: 'excellent', label: 'Excellent', color: 'text-green-400' };
  if (diff > -100) return { quality: 'inaccuracy', label: 'Inaccuracy', color: 'text-yellow-500' };
  if (diff > -300) return { quality: 'mistake', label: 'Mistake', color: 'text-orange-500' };
  return { quality: 'blunder', label: 'Blunder??', color: 'text-red-500' };
}

function QualityIcon({ quality }: { quality: MoveQuality }) {
  switch (quality) {
    case 'book': return <BookOpen className="text-purple-500" size={24} />;
    case 'brilliant': return <Star className="text-cyan-500 fill-cyan-500" size={24} />;
    case 'great': return <Star className="text-blue-500 fill-blue-500" size={24} />;
    case 'best': return <CheckCircle className="text-green-500 fill-green-500 text-white" size={24} />;
    case 'excellent': return <CheckCircle className="text-green-400" size={24} />;
    case 'inaccuracy': return <Info className="text-yellow-500" size={24} />;
    case 'mistake': return <AlertCircle className="text-orange-500" size={24} />;
    case 'blunder': return <XCircle className="text-red-500 fill-red-500 text-white" size={24} />;
    default: return null;
  }
}

function AnalysisContent() {
  const searchParams = useSearchParams();
  const pgn = searchParams.get('pgn');
  const [game, setGame] = useState(new Chess());
  const [moveIndex, setMoveIndex] = useState(0);
  const [moves, setMoves] = useState<Move[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { analyze, isReady } = useStockfish();
  const analysisStarted = useRef(false);

  // Initial Full Analysis
  useEffect(() => {
    if (isReady && pgn && !analysisStarted.current && evaluations.length === 0) {
      analysisStarted.current = true;
      const runFullAnalysis = async () => {
        setAnalyzing(true);
        const tempGame = new Chess();
        tempGame.loadPgn(pgn);
        const history = tempGame.history({ verbose: true });
        setMoves(history);

        const evals: Evaluation[] = [];
        const analysisGame = new Chess();
        
        // Initial position evaluation
        const startEval = await analyze(analysisGame.fen(), 10);
        startEval.isBook = true;
        evals.push(startEval);

        let inBook = true;

        for (let i = 0; i < history.length; i++) {
          const move = history[i];
          const previousFen = analysisGame.fen();
          analysisGame.move(move);
          
          let isBookMove = false;
          if (inBook && i < 30) { // Check first 30 plies (15 full moves)
            try {
              const res = await fetch(`https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(previousFen)}&moves=5`);
              if (res.ok) {
                const data = await res.json();
                if (data.moves && data.moves.some((m: any) => m.san === move.san)) {
                  isBookMove = true;
                } else {
                  inBook = false;
                }
              } else {
                inBook = false; // Stop checking on API error or rate limit
              }
            } catch (e) {
              console.error("Lichess API error", e);
              inBook = false;
            }
            // Small delay to prevent rate-limiting from Lichess (limit is 15 requests / second)
            await new Promise(r => setTimeout(r, 70));
          } else {
            inBook = false;
          }

          let result;
          if (analysisGame.isCheckmate()) {
            // If it's white's turn to move and they are in checkmate, black won (negative mate score).
            result = { type: 'mate', value: analysisGame.turn() === 'w' ? -0 : 0 } as Evaluation;
          } else if (analysisGame.isDraw()) {
            result = { type: 'cp', value: 0 } as Evaluation;
          } else {
            result = await analyze(analysisGame.fen(), 8);
          }
          
          result.isBook = isBookMove;
          evals.push(result);
          setProgress(Math.round(((i + 1) / history.length) * 100));
        }

        setEvaluations(evals);
        setAnalyzing(false);
        setMoveIndex(0); // Ensure we start at the beginning
      };

      runFullAnalysis();
    }
  }, [pgn, isReady, analyze, evaluations.length]);

  const currentEval = evaluations[moveIndex] || null;
  const prevEval = moveIndex > 0 ? evaluations[moveIndex - 1] : null;

  const goToMove = useCallback((index: number) => {
    const newGame = new Chess();
    for (let i = 0; i < index; i++) {
      newGame.move(moves[i]);
    }
    setGame(newGame);
    setMoveIndex(index);
  }, [moves]);

  const handleNext = () => moveIndex < moves.length && goToMove(moveIndex + 1);
  const handlePrev = () => moveIndex > 0 && goToMove(moveIndex - 1);
  const handleFirst = () => goToMove(0);
  const handleLast = () => goToMove(moves.length);

  const evalValue = useMemo(() => {
    if (!currentEval) return 0;
    if (currentEval.type === 'mate') return currentEval.value > 0 ? 10 : -10;
    return Math.max(Math.min(currentEval.value / 100, 10), -10);
  }, [currentEval]);

  const barHeight = `${50 + (evalValue * 5)}%`;

  const qualityInfo = useMemo(() => {
    if (moveIndex === 0) return null;
    return getMoveQuality(currentEval, prevEval, moveIndex % 2 !== 0);
  }, [currentEval, prevEval, moveIndex]);

  if (analyzing) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] gap-6 bg-white rounded-3xl shadow-xl border border-slate-200 p-12 text-center">
        <div className="relative">
           <Loader2 className="w-20 h-20 text-blue-600 animate-spin" />
           <div className="absolute inset-0 flex items-center justify-center font-black text-blue-600 text-sm">
             {progress}%
           </div>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Analyzing Game...</h2>
          <p className="text-slate-500 max-w-sm">
            Stockfish is calculating all moves to provide a complete game review. This may take a few seconds.
          </p>
        </div>
        <div className="w-full max-w-md bg-slate-100 h-3 rounded-full overflow-hidden">
           <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-8 items-start animate-in fade-in duration-700">
      {/* Eval Bar */}
      <div className="w-8 h-[400px] lg:h-[600px] bg-slate-800 rounded-full relative overflow-hidden flex flex-col justify-end border-2 border-slate-200 shadow-inner">
        <div className="bg-white transition-all duration-700 ease-in-out" style={{ height: barHeight }} />
        <div className="absolute inset-0 flex flex-col items-center justify-between py-4 pointer-events-none">
          <span className="text-[10px] font-bold text-white mix-blend-difference">
            {currentEval?.type === 'mate' ? `M${currentEval.value}` : (currentEval?.value ? (currentEval.value / 100).toFixed(1) : '0.0')}
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        <div className="relative group">
          <div className="w-full max-w-[600px] aspect-square shadow-2xl rounded-lg overflow-hidden border-4 border-slate-200">
            <Chessboard position={game.fen()} boardOrientation="white" animationDuration={200} />
          </div>
          {qualityInfo && (
            <div className="absolute top-4 right-4 bg-white/90 backdrop-blur shadow-xl rounded-2xl p-4 flex items-center gap-3 border border-slate-100 animate-in zoom-in slide-in-from-top-2 duration-300">
              <QualityIcon quality={qualityInfo.quality} />
              <div>
                <div className={`font-black text-sm uppercase tracking-wider ${qualityInfo.color}`}>{qualityInfo.label}</div>
                <div className="text-[10px] text-slate-500 font-bold">{moves[moveIndex - 1]?.san}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200 w-full max-w-[600px]">
          <button onClick={handleFirst} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronsLeft size={24} /></button>
          <button onClick={handlePrev} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronLeft size={24} /></button>
          <div className="font-bold text-lg min-w-[80px] text-center">
            {moveIndex === 0 ? 'Start' : `${Math.floor((moveIndex - 1) / 2) + 1}${moveIndex % 2 !== 0 ? '.' : '...'}`}
          </div>
          <button onClick={handleNext} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronRight size={24} /></button>
          <button onClick={handleLast} className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ChevronsRight size={24} /></button>
        </div>
      </div>

      <div className="w-full lg:w-80 flex flex-col gap-6 h-full">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BarChart2 size={24} /> Analysis</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
              <span className="text-slate-500 font-medium">Evaluation</span>
              <span className={`text-2xl font-black ${currentEval && (currentEval.type === 'mate' || currentEval.value > 0) ? 'text-green-600' : 'text-slate-900'}`}>
                {currentEval ? (currentEval.type === 'mate' ? `M${Math.abs(currentEval.value)}` : (currentEval.value / 100).toFixed(2)) : '...'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-h-[400px] flex flex-col">
          <h3 className="font-bold mb-4">Moves <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{moves.length} total</span></h3>
          <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-2">
            {moves.map((m, i) => (
              <button
                key={i}
                onClick={() => goToMove(i + 1)}
                className={`p-2 rounded text-left transition-all border flex items-center justify-between group ${moveIndex === i + 1 ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-md' : 'hover:bg-slate-50 border-transparent text-slate-700'}`}
              >
                <span className="truncate">
                  <span className={`text-[10px] mr-1 ${moveIndex === i + 1 ? 'text-blue-200' : 'text-slate-400'}`}>
                    {Math.floor(i / 2) + 1}{i % 2 === 0 ? '.' : '...'}
                  </span>
                  {m.san}
                </span>
                {moveIndex === i + 1 && <ChevronRight size={14} className="animate-pulse" />}
              </button>
            ))}
          </div>
        </div>
        <Link href="/" className="bg-slate-900 text-white p-4 rounded-xl text-center font-bold hover:bg-black transition-all shadow-lg active:scale-95">New Analysis</Link>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
           <Link href="/" className="text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors text-sm font-medium mb-2"><ChevronLeft size={16} /> Back to Games</Link>
           <h1 className="text-3xl font-black text-slate-900">Game Review</h1>
        </header>
        <Suspense fallback={<div className="flex flex-col items-center justify-center h-[600px] gap-4"><Loader2 className="w-12 h-12 text-blue-600 animate-spin" /></div>}>
          <AnalysisContent />
        </Suspense>
      </div>
    </main>
  );
}
