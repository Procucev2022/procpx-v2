'use client';
// src/components/AuctionCountdown.tsx - Live countdown to the server end time for the auction room header.
import { useEffect, useState } from 'react';
import type { AuctionCountdownProps } from '@app-types/components/AuctionCountdown.types';
import {
  AUCTION_COUNTDOWN_TICK_MS,
  AUCTION_DEFAULT_COUNTDOWN_COLOR,
  AUCTION_URGENT_COUNTDOWN_COLOR,
  AUCTION_URGENT_COUNTDOWN_SECONDS,
} from './AuctionCountdown.constants';

export function formatAuctionCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '00:00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Counts down to the target time. Only this component re-renders on each tick, so the rest of the auction room
 * stays still while the countdown runs.
 */
export default function AuctionCountdown({ targetTime, isLive, isClosed, closedLabel }: AuctionCountdownProps) {
  // The auction room mounts this only after the auction has loaded on the client, so reading the clock here is safe.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetTime === null) return;
    const interval = setInterval(() => setNow(Date.now()), AUCTION_COUNTDOWN_TICK_MS);
    return () => clearInterval(interval);
  }, [targetTime]);

  const remainingSeconds = targetTime === null ? 0 : Math.max(0, Math.floor((targetTime - now) / 1000));
  const isUrgent = remainingSeconds < AUCTION_URGENT_COUNTDOWN_SECONDS && isLive;

  return (
    <div style={{
      fontSize: 36,
      fontWeight: 900,
      fontFamily: 'monospace',
      color: isUrgent ? AUCTION_URGENT_COUNTDOWN_COLOR : AUCTION_DEFAULT_COUNTDOWN_COLOR,
    }}>
      {isClosed ? closedLabel : formatAuctionCountdown(remainingSeconds)}
    </div>
  );
}
