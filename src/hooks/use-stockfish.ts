import { useState, useEffect, useCallback, useRef } from 'react';

export interface Evaluation {
  type: 'cp' | 'mate';
  value: number;
  bestMove?: string;
  isBook?: boolean;
}

export function useStockfish() {
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isReady, setIsReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const resolveRef = useRef<((value: Evaluation) => void) | null>(null);
  const lastEvalRef = useRef<Evaluation | null>(null);

  useEffect(() => {
    const worker = new Worker('/stockfish.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const line = e.data;
      
      if (line === 'uciok') {
        setIsReady(true);
      } else if (line.startsWith('info depth')) {
        const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
        const pvMatch = line.match(/pv (\w+)/);
        
        if (scoreMatch) {
          const result: Evaluation = {
            type: scoreMatch[1] as 'cp' | 'mate',
            value: parseInt(scoreMatch[2]),
            bestMove: pvMatch ? pvMatch[1] : undefined
          };
          lastEvalRef.current = result;
          setEvaluation(result);
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

  const analyze = useCallback((fen: string, depth: number = 10): Promise<Evaluation> => {
    return new Promise((resolve) => {
      if (!workerRef.current || !isReady) {
        resolve({ type: 'cp', value: 0 });
        return;
      }
      
      // Clear previous resolve if any
      if (resolveRef.current) {
        resolveRef.current(lastEvalRef.current || { type: 'cp', value: 0 });
      }

      resolveRef.current = resolve;
      workerRef.current.postMessage(`position fen ${fen}`);
      workerRef.current.postMessage(`go depth ${depth}`);
    });
  }, [isReady]);

  return { evaluation, analyze, isReady };
}
