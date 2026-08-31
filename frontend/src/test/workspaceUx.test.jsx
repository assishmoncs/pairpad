import { describe, expect, it, vi } from 'vitest';

import axios from 'axios';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConnectionBanner from '../components/ConnectionBanner';
import WorkspaceFilesPanel from '../components/WorkspaceFilesPanel';
import socketService from '../services/socketService';

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

  it('announces workspace file select buttons by full path', async () => {
    axios.get.mockResolvedValueOnce({
      data: {
        data: {
          files: [{ _id: 'file-1', path: 'src/main.js' }],
        },
      },
    });

    render(
      <WorkspaceFilesPanel
        roomCode="ABC123"
        currentRole="owner"
        activeFileId={null}
        onSelectFile={vi.fn()}
      />
    );

    expect(await screen.findByRole('button', { name: 'Open src/main.js' })).toBeInTheDocument();
  });

  it('does not duplicate a created file when the socket event arrives first', async () => {
    const file = { _id: 'file-1', path: 'src/main.js', language: 'javascript' };
    let resolveCreate;

    axios.get.mockResolvedValueOnce({ data: { data: { files: [] } } });
    axios.post.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveCreate = resolve;
      })
    );

    render(
      <WorkspaceFilesPanel
        roomCode="ABC123"
        currentRole="owner"
        activeFileId={null}
        onSelectFile={vi.fn()}
      />
    );

    await userEvent.type(screen.getByLabelText('New file path'), file.path);
    await userEvent.click(screen.getByRole('button', { name: 'Create file' }));

    await act(async () => {
      socketService.emitEvent('workspace-file-created', { file });
      resolveCreate({ data: { data: { file } } });
    });

    expect(await screen.findByRole('button', { name: 'Open src/main.js' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Open src/main.js' })).toHaveLength(1);
  });
});
