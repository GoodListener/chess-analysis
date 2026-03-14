'use client';

import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Chess, Square, Move } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { useStockfish, Evaluation } from '@/hooks/use-stockfish';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BarChart2, Loader2, RefreshCw, BookOpen, Star, CheckCircle, Info, AlertCircle, XCircle, Lightbulb } from 'lucide-react';
import Link from 'next/link';

interface CloudEvalPV {
  cp?: number;
  mate?: number;
  moves: string;
}

interface CloudEvalData {
  depth: number;
  knps?: number;
  pvs: CloudEvalPV[];
  opening?: {
    eco: string;
    name: string;
  };
}

interface OpeningMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
}

interface OpeningData {
  opening?: {
    eco: string;
    name: string;
  };
  moves: OpeningMove[];
}

interface ExtendedEvaluation extends Evaluation {
  knps?: number;
}

type MoveQuality = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';

interface QualityInfo {
  quality: MoveQuality;
  label: string;
  color: string;
  bestMove?: string;
}

function getMoveQuality(current: ExtendedEvaluation | null, previous: ExtendedEvaluation | null, isWhite: boolean): QualityInfo | null {
  if (!current || !previous) return null;
  if (current.isBook) return { quality: 'book', label: 'Book Move', color: 'text-purple-500' };

  const currVal = current.type === 'mate' ? (current.value > 0 ? 1000 : -1000) : current.value;
  const prevVal = previous.type === 'mate' ? (previous.value > 0 ? 1000 : -1000) : previous.value;
  
  const diff = isWhite ? (currVal - prevVal) : (prevVal - currVal);

  // Brilliant/Great logic using Multi-PV if available
  let isOnlyGoodMove = false;
  if (previous.pvs && previous.pvs.length >= 2) {
      const bestVal = previous.pvs[0].type === 'mate' ? (previous.pvs[0].value > 0 ? 1000 : -1000) : previous.pvs[0].value;
      const secondBestVal = previous.pvs[1].type === 'mate' ? (previous.pvs[1].value > 0 ? 1000 : -1000) : previous.pvs[1].value;
      const valDiff = isWhite ? (bestVal - secondBestVal) : (secondBestVal - bestVal);
      if (valDiff > 150 && diff > -50) {
          isOnlyGoodMove = true;
      }
  }

  if (isOnlyGoodMove) {
      if (diff > -20) return { quality: 'brilliant', label: 'Brilliant!!', color: 'text-cyan-500' };
      return { quality: 'great', label: 'Great!', color: 'text-blue-500' };
  }

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
  const [opening, setOpening] = useState<string>('');
  const [openingData, setOpeningData] = useState<OpeningData | null>(null);
  const [evalCache, setEvalCache] = useState<Record<number, ExtendedEvaluation>>({});
  const evalCacheRef = useRef<Record<number, ExtendedEvaluation>>({});
  const lastRequestIdRef = useRef<number>(0);
  
  const moves = useMemo<Move[]>(() => {
    if (!pgn) return [];
    const tempGame = new Chess();
    try {
      tempGame.loadPgn(pgn);
      return tempGame.history({ verbose: true });
    } catch (e) {
      console.error("Failed to load PGN", e);
      return [];
    }
  }, [pgn]);

  const [moveIndex, setMoveIndex] = useState(0);
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white');
  const [cloudEval, setCloudEval] = useState<CloudEvalData | null>(null);
  const [hoveredVariation, setHoveredVariation] = useState<string | null>(null);
  const { analyze, isReady, evaluation: liveEval, stop } = useStockfish();

  const game = useMemo(() => {
    const newGame = new Chess();
    for (let i = 0; i < moveIndex; i++) {
      if (moves[i]) newGame.move(moves[i]);
    }
    return newGame;
  }, [moves, moveIndex]);

  const updateCache = (index: number, evaluation: ExtendedEvaluation) => {
    const current = evalCacheRef.current[index];
    const isNewBetter = !current || 
      (evaluation.isBook && !current.isBook) ||
      (evaluation.depth && (!current.depth || evaluation.depth > current.depth));

    if (isNewBetter) {
      evalCacheRef.current[index] = { ...current, ...evaluation };
      setEvalCache({ ...evalCacheRef.current });
    }
  };

  // Fetch Opening Name and Cloud Eval
  useEffect(() => {
    const requestId = ++lastRequestIdRef.current;
    const controller = new AbortController();

    const fetchAnalysisData = async () => {
      const fen = game.fen();
      const currentIndex = moveIndex;

      // Don't fetch if game is over
      if (game.isGameOver()) {
        if (requestId !== lastRequestIdRef.current) return;
        const result: ExtendedEvaluation = game.isCheckmate() 
          ? { type: 'mate', value: game.turn() === 'w' ? -0 : 0, depth: 0 }
          : { type: 'cp', value: 0, depth: 0 };
        updateCache(currentIndex, result);
        return;
      }
      
      // Fetch Cloud Eval
      setCloudEval(null);
      try {
        const res = await fetch(`/api/lichess?fen=${encodeURIComponent(fen)}&type=cloud-eval`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json() as CloudEvalData | null;
          if (data && requestId === lastRequestIdRef.current) {
            setCloudEval(data);
            updateCache(currentIndex, {
              type: (data.pvs[0].cp !== undefined ? 'cp' : 'mate'),
              value: data.pvs[0].cp !== undefined ? data.pvs[0].cp : (data.pvs[0].mate ?? 0),
              depth: data.depth,
              isCloud: true,
              pvs: data.pvs.map(pv => ({
                type: (pv.cp !== undefined ? 'cp' : 'mate'),
                value: pv.cp !== undefined ? pv.cp : (pv.mate ?? 0),
                move: pv.moves.split(' ')[0]
              }))
            });
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          console.error('Cloud Eval error', e);
        }
      }

      // Fetch Opening Explorer data for opening name
      try {
        const res = await fetch(`/api/lichess?fen=${encodeURIComponent(fen)}&type=explorer`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json() as OpeningData | null;
          if (data && requestId === lastRequestIdRef.current) {
            if (data.opening) {
              setOpening(`${data.opening.eco}: ${data.opening.name}`);
            }
            setOpeningData(data);
            
            // If we have book moves, mark as book and potentially skip engine
            if (data.moves && data.moves.length > 0) {
              updateCache(currentIndex, { 
                isBook: true, 
                type: 'cp', 
                value: 0,
                pvs: data.moves.map(m => ({
                  type: 'cp',
                  value: 0,
                  move: m.uci
                }))
              });
            }
          }
        }
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          console.error('Opening Explorer error', e);
        }
      }
    };

    fetchAnalysisData();
    return () => controller.abort();
  }, [game, moveIndex]);

  // Real-time continuous analysis
  useEffect(() => {
    // Stage 1: Optimize engine usage based on game phase
    const isEarlyGame = moveIndex <= 15;
    const hasBookMoves = openingData && openingData.moves && openingData.moves.length > 0;
    
    if (isReady && game) {
      if (isEarlyGame && hasBookMoves) {
        // Run a shallow analysis if we're in the opening with known stats
        analyze(game.fen(), 12);
      } else {
        // Deep analysis for middle/endgame
        analyze(game.fen(), 24);
      }
      return () => stop();
    }
  }, [game, isReady, analyze, stop, moveIndex, openingData]);

  // Update cache from live engine
  useEffect(() => {
    if (liveEval && !cloudEval) {
      updateCache(moveIndex, liveEval);
    }
  }, [liveEval, moveIndex, cloudEval]);

  const handleNext = () => moveIndex < moves.length && setMoveIndex(moveIndex + 1);
  const handlePrev = () => moveIndex > 0 && setMoveIndex(moveIndex - 1);
  const handleFirst = () => setMoveIndex(0);
  const handleLast = () => setMoveIndex(moves.length);

  // displayEval: current position score
  const displayEval = useMemo<ExtendedEvaluation | null>(() => {
    if (cloudEval && cloudEval.pvs && cloudEval.pvs.length > 0) {
      return {
        type: (cloudEval.pvs[0].cp !== undefined ? 'cp' : 'mate') as 'cp' | 'mate',
        value: cloudEval.pvs[0].cp !== undefined ? cloudEval.pvs[0].cp : (cloudEval.pvs[0].mate ?? 0),
        depth: cloudEval.depth,
        knps: cloudEval.knps,
        isCloud: true,
        pvs: cloudEval.pvs.map((pv) => ({
          type: (pv.cp !== undefined ? 'cp' : 'mate') as 'cp' | 'mate',
          value: pv.cp !== undefined ? pv.cp : (pv.mate ?? 0),
          move: pv.moves.split(' ')[0]
        }))
      };
    }
    return liveEval;
  }, [cloudEval, liveEval]);

  const evalValue = useMemo(() => {
    if (!displayEval) return 0;
    if (displayEval.type === 'mate') return displayEval.value > 0 ? 10 : -10;
    return Math.max(Math.min(displayEval.value / 100, 10), -10);
  }, [displayEval]);

  const barHeight = `${50 + (evalValue * 5)}%`;

  const formatUci = (uci: string) => {
    if (!uci) return '';
    return uci.substring(0, 2) + ' → ' + uci.substring(2, 4);
  };

  const WinLossBar = ({ white, draws, black }: { white: number, draws: number, black: number }) => {
    const total = white + draws + black;
    if (total === 0) return null;
    const w = (white / total) * 100;
    const d = (draws / total) * 100;
    const b = (black / total) * 100;
    
    return (
      <div className="h-1.5 w-full flex rounded-full overflow-hidden mt-1 bg-slate-100">
        <div className="bg-white border-r border-slate-200" style={{ width: `${w}%` }} title={`White wins: ${Math.round(w)}%`} />
        <div className="bg-slate-400" style={{ width: `${d}%` }} title={`Draws: ${Math.round(d)}%`} />
        <div className="bg-slate-900" style={{ width: `${b}%` }} title={`Black wins: ${Math.round(b)}%`} />
      </div>
    );
  };

  const qualityInfo = useMemo<QualityInfo | null>(() => {
    if (moveIndex === 0) return null;
    const current = evalCache[moveIndex];
    const previous = evalCache[moveIndex - 1];
    const info = getMoveQuality(current, previous, moveIndex % 2 !== 0);
    
    if (info && previous?.pvs && previous.pvs.length > 0) {
        const playedMove = moves[moveIndex - 1];
        const playedUci = playedMove.from + playedMove.to + (playedMove.promotion || '');
        const bestUci = previous.pvs[0].move;
        
        if (playedUci !== bestUci) {
            return { ...info, bestMove: previous.pvs[0].move };
        }
    }
    return info;
  }, [evalCache, moveIndex, moves]);

  // recommendations: alternatives for the MOVE JUST PLAYED
  const recommendations = useMemo(() => {
    if (moveIndex === 0) return displayEval?.pvs || [];
    return evalCache[moveIndex - 1]?.pvs || [];
  }, [evalCache, moveIndex, displayEval]);

  const customArrows = useMemo(() => {
    // If hovering over a variation, show it
    if (hoveredVariation) {
      const variationMoves = hoveredVariation.split(' ').slice(0, 3); // Show first 3 moves
      return variationMoves.map((m, i) => {
        const from = m.substring(0, 2) as Square;
        const to = m.substring(2, 4) as Square;
        const opacity = 0.8 - (i * 0.2);
        const color = `rgba(59, 130, 246, ${opacity})`; // Blue variation
        return [from, to, color] as [Square, Square, string];
      }).filter((a): a is [Square, Square, string] => /^[a-h][1-8]$/.test(a[0]) && /^[a-h][1-8]$/.test(a[1]));
    }

    // Review mode: show alternatives from the PREVIOUS position
    const recs = recommendations;
    if (!recs || recs.length === 0) return [];

    return recs
      .filter((pv) => pv && pv.move && pv.move.length >= 4)
      .map((pv, i) => {
        const from = pv.move.substring(0, 2) as Square;
        const to = pv.move.substring(2, 4) as Square;
        
        const isValidSquare = (s: string) => /^[a-h][1-8]$/.test(s);
        
        if (isValidSquare(from) && isValidSquare(to)) {
            const isBest = i === 0;
            
            // Check if this move was from Opening Explorer
            const prevEval = moveIndex > 0 ? evalCache[moveIndex - 1] : null;
            const isBook = prevEval?.isBook;
            
            // Highlight color: 
            // - Blue for Book moves (with decreasing opacity for lower priority)
            // - Green for Engine Best move
            // - Subtle Blue/Purple for other engine moves
            let color = 'rgba(34, 197, 94, 0.8)'; // Engine Green
            if (isBook) {
              const opacity = 0.9 - (i * 0.2); // First: 0.9, Second: 0.7, etc.
              color = `rgba(59, 130, 246, ${Math.max(0.3, opacity)})`; // Opening Blue
            } else if (!isBest) {
              color = i === 1 ? 'rgba(168, 85, 247, 0.7)' : 'rgba(168, 85, 247, 0.4)'; // Engine alternatives (Purple)
            }
            
            return [from, to, color] as [Square, Square, string];
        }
        return null;
      })
      .filter((arrow): arrow is [Square, Square, string] => arrow !== null);
  }, [recommendations, moveIndex, moves, evalCache, hoveredVariation]);

  const lastMoveSquares = useMemo(() => {
    if (moveIndex === 0) return {};
    const lastMove = moves[moveIndex - 1];
    if (!lastMove) return {};
    return {
      [lastMove.from]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' },
      [lastMove.to]: { backgroundColor: 'rgba(255, 255, 0, 0.4)' }
    };
  }, [moveIndex, moves]);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-700">
      {/* Header with Opening Info */}
      <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
        <Link href="/" className="text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors text-sm font-medium mb-2">
          <ChevronLeft size={16} /> Back to Games
        </Link>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Game Review</h1>
            {opening && (
              <div className="flex items-center gap-2 text-blue-600 font-bold mt-1">
                <BookOpen size={18} />
                <span className="text-sm tracking-tight">{opening}</span>
              </div>
            )}
          </div>
          <Link href="/" className="hidden md:block bg-slate-900 text-white px-6 py-2 rounded-xl text-center font-bold hover:bg-black transition-all shadow-lg active:scale-95 text-sm">
            New Analysis
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Eval Bar */}
        <div className="w-8 h-[400px] lg:h-[600px] bg-slate-800 rounded-full relative overflow-hidden flex flex-col justify-end border-2 border-slate-200 shadow-inner">
          <div className="bg-white transition-all duration-700 ease-in-out" style={{ height: barHeight }} />
          <div className="absolute inset-0 flex flex-col items-center justify-between py-4 pointer-events-none">
            <span className="text-[10px] font-bold text-white mix-blend-difference">
              {displayEval?.type === 'mate' ? `M${Math.abs(displayEval.value)}` : (displayEval?.value ? (displayEval.value / 100).toFixed(1) : '0.0')}
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          <div className="relative group">
            <div className="w-full max-w-[600px] aspect-square shadow-2xl rounded-lg overflow-hidden border-4 border-slate-200 relative">
              <Chessboard 
                position={game.fen()} 
                boardOrientation={boardOrientation} 
                animationDuration={0} 
                customArrows={customArrows}
                customSquareStyles={lastMoveSquares}
              />
              <button 
                onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                className="absolute bottom-4 right-4 bg-slate-900/80 hover:bg-slate-900 text-white p-2 rounded-full backdrop-blur transition-all shadow-lg z-10"
                title="Flip Board"
              >
                <RefreshCw size={20} />
              </button>
            </div>
            {qualityInfo && (
              <div className={`absolute top-4 right-4 bg-white/90 backdrop-blur shadow-xl rounded-2xl p-4 flex items-center gap-3 border transition-all duration-300 animate-in zoom-in slide-in-from-top-2 ${qualityInfo.quality === 'blunder' ? 'border-red-500 animate-bounce shadow-red-200' : 'border-slate-100'}`}>
                <QualityIcon quality={qualityInfo.quality} />
                <div>
                  <div className={`font-black text-sm uppercase tracking-wider ${qualityInfo.color}`}>{qualityInfo.label}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-bold">{moves[moveIndex - 1]?.san}</span>
                    {qualityInfo.bestMove && (
                        <span className="text-[10px] text-blue-600 font-black bg-blue-50 px-1.5 py-0.5 rounded">
                          Best was {formatUci(qualityInfo.bestMove)}
                        </span>
                    )}
                  </div>
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
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <BarChart2 size={24} /> 
              Move Analysis
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg">
                <span className="text-slate-500 font-medium">Current Eval</span>
                <span className={`text-2xl font-black ${displayEval && (displayEval.type === 'mate' || displayEval.value > 0) ? 'text-green-600' : 'text-slate-900'}`}>
                  {displayEval ? (displayEval.type === 'mate' ? `M${Math.abs(displayEval.value)}` : (displayEval.value / 100).toFixed(2)) : '...'}
                </span>
              </div>

              {/* Recommendations for the move played */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  <Lightbulb size={12} className="text-yellow-500" />
                  {moveIndex > 0 ? `Alternatives for Move ${moveIndex}` : 'Engine Recommendations'}
                </div>
                
                {/* Show Opening Explorer data if in book */}
                {openingData && openingData.moves && openingData.moves.length > 0 ? (
                  <div className="space-y-2 mb-4">
                    <div className="text-[9px] font-bold text-blue-500 flex items-center gap-1 mb-2">
                      <BookOpen size={10} /> Opening Stats (Lichess)
                    </div>
                    {openingData.moves.map((m) => (
                      <div key={m.uci} className="flex flex-col bg-blue-50/30 p-2 rounded-lg border border-blue-100/50 hover:border-blue-300 transition-colors">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">{m.san}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{formatUci(m.uci)}</span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500">{m.white + m.draws + m.black} games</span>
                        </div>
                        <WinLossBar white={m.white} draws={m.draws} black={m.black} />
                      </div>
                    ))}
                  </div>
                ) : null}

                {recommendations.length > 0 ? recommendations
                  .filter(pv => !openingData?.moves.some(m => m.uci === pv.move)) // Only show engine moves NOT in explorer
                  .map((pv, i) => (
                  <div 
                    key={i} 
                    onMouseEnter={() => pv.variation && setHoveredVariation(pv.variation)}
                    onMouseLeave={() => setHoveredVariation(null)}
                    className="flex items-center justify-between text-sm bg-slate-50/50 p-2 rounded-lg border border-slate-100 group hover:border-blue-200 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 && !openingData?.moves.length ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                        {i + 1}
                      </span>
                      <span className="font-mono font-bold text-slate-700">{formatUci(pv.move)}</span>
                    </div>
                    <span className={`text-[11px] font-black ${pv.value >= 0 ? 'text-green-600' : 'text-slate-500'}`}>
                      {pv.type === 'mate' ? `M${Math.abs(pv.value)}` : (pv.value / 100).toFixed(1)}
                    </span>
                  </div>
                )) : (!openingData?.moves.length && (
                  <div className="text-xs text-slate-400 italic py-2">Calculating alternatives...</div>
                ))}
              </div>

              {displayEval?.depth && (
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2 border-t border-slate-100">
                  <span>Depth: {displayEval.depth}</span>
                  {displayEval.knps && <span>{Math.round(displayEval.knps / 1000)} MN/s</span>}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-h-[400px] flex flex-col">
            <h3 className="font-bold mb-4">Moves <span className="text-[10px] bg-slate-100 px-2 py-1 rounded text-slate-500">{moves.length} total</span></h3>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto pr-2">
              {moves.map((m, i) => (
                <button
                  key={i}
                  onClick={() => setMoveIndex(i + 1)}
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
          <Link href="/" className="bg-slate-900 text-white p-4 rounded-xl text-center font-bold hover:bg-black transition-all shadow-lg active:scale-95 text-sm">New Analysis</Link>
        </div>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <Suspense fallback={<div className="flex flex-col items-center justify-center h-[600px] gap-4"><Loader2 className="w-12 h-12 text-blue-600 animate-spin" /></div>}>
          <AnalysisContent />
        </Suspense>
      </div>
    </main>
  );
}
