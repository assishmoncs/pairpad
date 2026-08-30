import { describe, expect, it, vi } from 'vitest';

import { render, screen } from '@testing-library/react';
import ConnectionBanner from '../components/ConnectionBanner';

describe('workspace UX', () => {
  it('hides the banner while connected', () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.firstChild).toBeNull();
  });

  it('announces reconnecting state', () => {
    render(<ConnectionBanner status="reconnecting" message="Network interruption" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting to PairPad');
    expect(screen.getByText('Network interruption')).toBeInTheDocument();
  });

  it('offers retry after a disconnect', async () => {
    const onRetry = vi.fn();
    render(<ConnectionBanner status="disconnected" onRetry={onRetry} />);
    const button = screen.getByRole('button', { name: 'Retry' });
    expect(button).toBeInTheDocument();
    button.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
