import { createLogger } from './debug.ts';

const log = createLogger('wavedash');
export const LEADERBOARD_ID = 'high-scores';

interface WavedashResult<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface WavedashSdk {
  updateLoadProgressZeroToOne?: (progress: number) => void;
  init?: (config: { debug: boolean }) => boolean;
  getUser?: () => { id: string; username: string } | null;
  getLeaderboard?: (slug: string) => Promise<WavedashResult<{ id: string; name?: string }>>;
  uploadLeaderboardScore?: (id: string, score: number, force: boolean) => Promise<WavedashResult>;
  toggleOverlay?: () => void;
}

declare global {
  interface Window {
    Wavedash?: WavedashSdk;
  }
}

export const hasSDK = (): boolean => typeof window !== 'undefined' && Boolean(window.Wavedash);

export function initWavedash({ debug = false }: { debug?: boolean } = {}): boolean {
  const sdk = window.Wavedash;
  if (!sdk) {
    log.log('SDK not present; running standalone');
    return false;
  }
  try {
    sdk.updateLoadProgressZeroToOne?.(0);
    sdk.updateLoadProgressZeroToOne?.(1);
    sdk.init?.({ debug });
    log.log('initialized', sdk.getUser?.());
    return true;
  } catch (error) {
    log.error('initialization failed', error);
    return false;
  }
}

export async function submitScore(score: number): Promise<boolean> {
  const sdk = window.Wavedash;
  if (!sdk?.getLeaderboard || !sdk.uploadLeaderboardScore) return false;
  try {
    const board = await sdk.getLeaderboard(LEADERBOARD_ID);
    if (!board.success || !board.data) return false;
    const result = await sdk.uploadLeaderboardScore(board.data.id, score, true);
    return result.success;
  } catch (error) {
    log.error('score submission failed', error);
    return false;
  }
}

export function toggleOverlay(): void {
  try {
    window.Wavedash?.toggleOverlay?.();
  } catch (error) {
    log.error('overlay failed', error);
  }
}
