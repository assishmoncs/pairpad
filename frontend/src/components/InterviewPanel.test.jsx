import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios from 'axios';
import InterviewPanel from './InterviewPanel';

const room = { owner: 'owner-1', members: [{ _id: 'candidate-1', name: 'Ada' }] };
const draft = {
  title: 'Sum',
  description: 'Add two numbers',
  status: 'draft',
  remainingSeconds: 600,
  durationMinutes: 10,
  language: 'javascript',
  publicTests: [],
  hiddenTests: [],
};

describe('interview configuration', () => {
  it('lets an owner create the first interview and submit its configuration', async () => {
    axios.get.mockResolvedValue({ data: { data: { interview: null } } });
    axios.put.mockResolvedValue({ data: { data: { interview: draft } } });
    render(
      <InterviewPanel
        roomCode="ABC123"
        room={room}
        currentRole="owner"
        code=""
        language="javascript"
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Create interview' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Sum' } });
    fireEvent.change(screen.getByLabelText('Problem statement'), {
      target: { value: 'Add two numbers' },
    });
    fireEvent.change(screen.getByLabelText('Duration (min)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Candidate'), { target: { value: 'candidate-1' } });
    fireEvent.change(screen.getByLabelText('Public tests 1 stdin'), { target: { value: '1 2' } });
    fireEvent.change(screen.getByLabelText('Public tests 1 expected output'), {
      target: { value: '3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save interview' }));

    await waitFor(() =>
      expect(axios.put).toHaveBeenCalledWith(
        '/api/rooms/ABC123/interview',
        expect.objectContaining({
          title: 'Sum',
          description: 'Add two numbers',
          durationMinutes: 10,
          candidateId: 'candidate-1',
          publicTests: [expect.objectContaining({ stdin: '1 2', expectedOutput: '3' })],
        })
      )
    );
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save interview' })).not.toBeInTheDocument();
  });

  it('shows configuration errors without losing entered data', async () => {
    axios.get.mockResolvedValue({ data: { data: { interview: null } } });
    axios.put.mockRejectedValue({ response: { data: { message: 'Invalid test cases.' } } });
    render(<InterviewPanel roomCode="ABC123" room={room} currentRole="owner" code="" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create interview' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Sum' } });
    fireEvent.change(screen.getByLabelText('Problem statement'), {
      target: { value: 'Add numbers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save interview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid test cases.');
    expect(screen.getByLabelText('Title')).toHaveValue('Sum');
  });

  it('hides unconfigured interview controls from viewers', async () => {
    axios.get.mockResolvedValue({ data: { data: { interview: null } } });
    const { container } = render(
      <InterviewPanel roomCode="ABC123" room={room} currentRole="viewer" />
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
