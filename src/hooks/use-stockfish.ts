import { useState, useEffect, useCallback, useRef } from 'react';

export interface Evaluation {
  type: 'cp' | 'mate';
  value: number;
  bestMove?: string;
  isBook?: boolean;
  depth?: number;
  isCloud?: boolean;
  pvs?: Array<{ type: 'cp' | 'mate'; value: number; move: string, variation?: string }>;
}

export function useStockfish() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((value: Evaluation) => void) | null>(null);
  const lastEvalRef = useRef<Evaluation | null>(null);
  const currentFenRef = useRef<string | null>(null);

  useEffect(() => {
    const worker = new Worker('/stockfish.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const line = e.data;
      
      if (line === 'uciok') {
        worker.postMessage('setoption name MultiPV value 3');
        setIsReady(true);
      } else if (line.startsWith('info depth')) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        const pvMatch = line.match(/pv (.+)/); 
        const multiPvMatch = line.match(/multipv (\d+)/);
        const depthMatch = line.match(/depth (\d+)/);
        
        if (scoreMatch) {
          const type = scoreMatch[1] as 'cp' | 'mate';
          const value = parseInt(scoreMatch[2]);
          const pv = pvMatch ? pvMatch[1] : undefined;
          const multiPv = multiPvMatch ? parseInt(multiPvMatch[1]) : 1;
          const depth = depthMatch ? parseInt(depthMatch[1]) : undefined;
          const firstMove = pv ? pv.split(' ')[0] : undefined;
          
          if (!lastEvalRef.current) {
            lastEvalRef.current = { type, value, bestMove: firstMove, pvs: [], depth, isCloud: false };
          }
          
          if (!lastEvalRef.current.pvs) {
            lastEvalRef.current.pvs = [];
          }
          
          if (pv) {
            lastEvalRef.current.pvs[multiPv - 1] = { type, value, move: firstMove || '', variation: pv };
          }
          
          if (multiPv === 1) {
            lastEvalRef.current.type = type;
            lastEvalRef.current.value = value;
            lastEvalRef.current.bestMove = firstMove;
            lastEvalRef.current.depth = depth;
          }
          
          setEvaluation({...lastEvalRef.current});
        }
      } else if (line.startsWith('bestmove')) {
        if (resolveRef.current) {
          const finalEval = lastEvalRef.current || { type: 'cp', value: 0 };
          resolveRef.current(finalEval);
          resolveRef.current = null;
        }
      }
    };

    worker.postMessage('uci');
    worker.postMessage('isready');

    return () => {
      worker.terminate();
    };
  }, []);

  const analyze = useCallback((fen: string, depth: number = 24): Promise<Evaluation> => {
    return new Promise((resolve) => {
      if (!workerRef.current || !isReady) {
        resolve({ type: 'cp', value: 0 });
        return;
      }
      
      currentFenRef.current = fen;
      workerRef.current.postMessage('stop');
      
      if (resolveRef.current) {
        resolveRef.current(lastEvalRef.current || { type: 'cp', value: 0 });
      }

      setEvaluation(null);
      lastEvalRef.current = null;
      resolveRef.current = resolve;
      
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    });
  }, [isReady]);

  const stop = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
    }
  }, []);

  return { evaluation, analyze, isReady, stop };
}
