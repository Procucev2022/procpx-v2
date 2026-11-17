/** @jest-environment jsdom */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import AuctionCountdown, { formatAuctionCountdown } from '../src/components/AuctionCountdown';

const CLOSED_LABEL = 'Concluded';
const NOW = new Date('2026-11-17T10:00:00.000Z');

describe('auction countdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats remaining seconds as hours, minutes and seconds', () => {
    expect(formatAuctionCountdown(3723)).toBe('01:02:03');
    expect(formatAuctionCountdown(0)).toBe('00:00:00');
    expect(formatAuctionCountdown(-5)).toBe('00:00:00');
  });

  it('counts down once every second', () => {
    render(<AuctionCountdown targetTime={NOW.getTime() + 3723_000} isLive isClosed={false} closedLabel={CLOSED_LABEL} />);

    expect(screen.getByText('01:02:03')).toBeInTheDocument();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(screen.getByText('01:02:02')).toBeInTheDocument();
  });

  it('turns red in the last five minutes of a live auction only', () => {
    const { container, rerender } = render(
      <AuctionCountdown targetTime={NOW.getTime() + 299_000} isLive isClosed={false} closedLabel={CLOSED_LABEL} />,
    );
    expect(container.firstChild).toHaveStyle({ color: '#fca5a5' });

    rerender(<AuctionCountdown targetTime={NOW.getTime() + 299_000} isLive={false} isClosed={false} closedLabel={CLOSED_LABEL} />);
    expect(container.firstChild).toHaveStyle({ color: '#ffffff' });
  });

  it('shows the closed label once the auction is closed', () => {
    render(<AuctionCountdown targetTime={NOW.getTime() + 60_000} isLive={false} isClosed closedLabel={CLOSED_LABEL} />);

    expect(screen.getByText(CLOSED_LABEL)).toBeInTheDocument();
  });

  it('shows zero when there is no end time or the end time has passed', () => {
    const { rerender } = render(<AuctionCountdown targetTime={null} isLive isClosed={false} closedLabel={CLOSED_LABEL} />);
    expect(screen.getByText('00:00:00')).toBeInTheDocument();

    rerender(<AuctionCountdown targetTime={NOW.getTime() - 60_000} isLive isClosed={false} closedLabel={CLOSED_LABEL} />);
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
  });
});
