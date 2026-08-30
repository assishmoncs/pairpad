import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import socketService from '../services/socketService';
import { LANGUAGES } from '../constants/languages';
import './InterviewPanel.css';

const emptyTest = () => ({ name: '', stdin: '', expectedOutput: '' });
const formatTime = (seconds) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.max(0, seconds % 60)
    .toString()
    .padStart(2, '0')}`;

const InterviewPanel = ({ roomCode, room, currentRole, code, language, onRoomUpdated }) => {
  const isOwner = currentRole === 'owner';
  const canSubmit = currentRole === 'owner' || currentRole === 'editor';
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    durationMinutes: 60,
    language: language || 'javascript',
    candidateId: '',
    publicTests: [emptyTest()],
    hiddenTests: [emptyTest()],
  });

  const loadInterview = useCallback(async () => {
    try {
      const response = await axios.get(`/api/rooms/${roomCode}/interview`);
      const next = response.data.data.interview;
      setInterview(next);
      if (next && isOwner) {
        setForm((current) => ({
          ...current,
          title: next.title || '',
          description: next.description || '',
          durationMinutes: next.durationMinutes || 60,
          language: next.language || language || 'javascript',
          candidateId: next.candidateId || '',
          publicTests: next.publicTests?.length
            ? next.publicTests.map(({ name, stdin, expectedOutput }) => ({
                name,
                stdin,
                expectedOutput,
              }))
            : [emptyTest()],
          hiddenTests: next.hiddenTests?.length
            ? next.hiddenTests.map(({ name, stdin, expectedOutput }) => ({
                name,
                stdin,
                expectedOutput,
              }))
            : [emptyTest()],
        }));
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load interview mode.');
    } finally {
      setLoading(false);
    }
  }, [roomCode, isOwner, language]);

  useEffect(() => {
    loadInterview();
  }, [loadInterview]);

  useEffect(() => {
    const unsubscribe = socketService.on('interview-state-changed', (next) => setInterview(next));
    const unsubscribeConfig = socketService.on('interview-updated', (next) => setInterview(next));
    return () => {
      unsubscribe();
      unsubscribeConfig();
    };
  }, []);

  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!interview) return undefined;
    const calculate = () => {
      if (interview.status !== 'running' || !interview.startedAt)
        return Math.max(0, interview.remainingSeconds || 0);
      const elapsed = Math.floor((Date.now() - new Date(interview.startedAt).getTime()) / 1000);
      return Math.max(0, (interview.remainingSeconds || 0) - elapsed);
    };
    setRemaining(calculate());
    const timer = window.setInterval(() => setRemaining(calculate()), 1000);
    return () => window.clearInterval(timer);
  }, [interview]);

  const updateTest = (kind, index, field, value) =>
    setForm((current) => ({
      ...current,
      [kind]: current[kind].map((test, i) => (i === index ? { ...test, [field]: value } : test)),
    }));
  const addTest = (kind) =>
    setForm((current) => ({
      ...current,
      [kind]: current[kind].length >= 50 ? current[kind] : [...current[kind], emptyTest()],
    }));
  const removeTest = (kind, index) =>
    setForm((current) => ({ ...current, [kind]: current[kind].filter((_, i) => i !== index) }));

  const saveConfig = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await axios.put(`/api/rooms/${roomCode}/interview`, {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        candidateId: form.candidateId || null,
      });
      setInterview(response.data.data.interview);
      setShowConfig(false);
      onRoomUpdated?.(room);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save interview configuration.');
    } finally {
      setSaving(false);
    }
  };

  const transition = async (action) => {
    setError('');
    try {
      const response = await axios.post(`/api/rooms/${roomCode}/interview/${action}`);
      setInterview(response.data.data.interview);
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${action} interview.`);
    }
  };

  const submit = async () => {
    setError('');
    setSubmission(null);
    setSaving(true);
    try {
      const response = await axios.post(`/api/rooms/${roomCode}/interview/submit`, {
        sourceCode: code,
        language,
      });
      setSubmission(response.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to evaluate submission.');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = useMemo(
    () =>
      interview?.status
        ? interview.status[0].toUpperCase() + interview.status.slice(1)
        : 'Not configured',
    [interview?.status]
  );
  const candidateName = useMemo(() => {
    if (!interview?.candidateId) return 'Any editor';
    const member = room?.members?.find(
      (candidate) => String(candidate._id) === String(interview.candidateId)
    );
    return member?.name || 'Assigned candidate';
  }, [interview?.candidateId, room?.members]);

  if (loading)
    return (
      <section className="sidebar-section interview-section">
        <h3>Interview Mode</h3>
        <p className="interview-muted">Loading…</p>
      </section>
    );

  if (!interview && !isOwner) return null;

  return (
    <section className="sidebar-section interview-section" aria-label="Interview Mode">
      <div className="section-title-row">
        <h3>Interview Mode</h3>
        <span className={`interview-status status-${interview?.status || 'none'}`}>
          {statusLabel}
        </span>
      </div>
      {error && (
        <div className="interview-error" role="alert">
          {error}
        </div>
      )}

      {isOwner && !interview && (
        <div className="interview-owner-empty">
          <p>Create a timed coding interview with public and hidden tests.</p>
          <button
            type="button"
            className="btn-interview-primary"
            onClick={() => setShowConfig(true)}
          >
            Create interview
          </button>
        </div>
      )}

      {isOwner && interview && (
        <div className="interview-owner-controls">
          <div className="interview-summary">
            <strong>{interview.title}</strong>
            <span>
              {candidateName} · {interview.durationMinutes} min
            </span>
          </div>
          <div className="interview-actions">
            {interview.status === 'draft' && (
              <button
                type="button"
                className="btn-interview-primary"
                onClick={() => transition('start')}
              >
                Start
              </button>
            )}
            {interview.status === 'running' && (
              <button
                type="button"
                className="btn-interview-secondary"
                onClick={() => transition('pause')}
              >
                Pause
              </button>
            )}
            {interview.status === 'paused' && (
              <button
                type="button"
                className="btn-interview-primary"
                onClick={() => transition('resume')}
              >
                Resume
              </button>
            )}
            {['running', 'paused'].includes(interview.status) && (
              <button
                type="button"
                className="btn-interview-danger"
                onClick={() => transition('end')}
              >
                End
              </button>
            )}
            {interview.status !== 'running' && interview.status !== 'paused' && (
              <button
                type="button"
                className="btn-interview-secondary"
                onClick={() => setShowConfig((value) => !value)}
              >
                Configure
              </button>
            )}
          </div>
          {showConfig && (
            <form className="interview-form" onSubmit={saveConfig}>
              <label>
                Title
                <input
                  value={form.title}
                  maxLength={120}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </label>
              <label>
                Problem statement
                <textarea
                  rows={4}
                  value={form.description}
                  maxLength={5000}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  required
                />
              </label>
              <div className="interview-form-grid">
                <label>
                  Duration (min)
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    value={form.durationMinutes}
                    onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
                    required
                  />
                </label>
                <label>
                  Language
                  <select
                    value={form.language}
                    onChange={(event) => setForm({ ...form, language: event.target.value })}
                  >
                    {LANGUAGES.map(({ value: val, label }) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Candidate
                <select
                  value={form.candidateId}
                  onChange={(event) => setForm({ ...form, candidateId: event.target.value })}
                >
                  <option value="">Any editor</option>
                  {(room?.members || [])
                    .filter(
                      (member) => String(member._id) !== String(room?.owner?._id || room?.owner)
                    )
                    .map((member) => (
                      <option key={member._id} value={member._id}>
                        {member.name} ({member.email})
                      </option>
                    ))}
                </select>
              </label>
              <TestEditor
                title="Public tests"
                tests={form.publicTests}
                kind="publicTests"
                updateTest={updateTest}
                addTest={addTest}
                removeTest={removeTest}
              />
              <TestEditor
                title="Hidden tests"
                tests={form.hiddenTests}
                kind="hiddenTests"
                updateTest={updateTest}
                addTest={addTest}
                removeTest={removeTest}
              />
              <div className="interview-form-actions">
                <button type="submit" className="btn-interview-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save interview'}
                </button>
                <button
                  type="button"
                  className="btn-interview-secondary"
                  onClick={() => setShowConfig(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {interview && (
        <>
          <div
            className={`interview-timer ${remaining <= 60 && interview.status === 'running' ? 'timer-warning' : ''}`}
            aria-live="polite"
          >
            <span>{formatTime(remaining)}</span>
            <small>
              {interview.status === 'running'
                ? 'Time remaining'
                : interview.status === 'paused'
                  ? 'Paused'
                  : interview.status === 'ended'
                    ? 'Interview ended'
                    : 'Ready to start'}
            </small>
          </div>
          <div className="interview-problem">
            <h4>{interview.title}</h4>
            <p>{interview.description}</p>
          </div>
          {interview.publicTests?.length > 0 && (
            <div className="interview-tests">
              <h4>Public examples</h4>
              {interview.publicTests.map((test, index) => (
                <div className="interview-test" key={test.id || index}>
                  <strong>{test.name}</strong>
                  <code>Input: {test.stdin || '(empty)'}</code>
                  <code>Expected: {test.expectedOutput || '(empty)'}</code>
                </div>
              ))}
            </div>
          )}
          {canSubmit && interview.status === 'running' && (
            <button
              type="button"
              className="btn-interview-primary interview-submit"
              onClick={submit}
              disabled={saving || remaining <= 0}
            >
              {saving ? 'Evaluating…' : 'Submit solution'}
            </button>
          )}
          {submission && (
            <div className="interview-results">
              <strong>
                Score: {submission.score}/{submission.total}
              </strong>
              <div>
                {submission.publicResults?.map((result, index) => (
                  <div
                    key={result.id || index}
                    className={result.passed ? 'test-passed' : 'test-failed'}
                  >
                    {result.passed ? '✓' : '✕'} {result.name}
                  </div>
                ))}
                {submission.hiddenResults?.map((result, index) => (
                  <div
                    key={result.id || index}
                    className={result.passed ? 'test-passed' : 'test-failed'}
                  >
                    {result.passed ? '✓' : '✕'} {result.name} <span>(hidden)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const TestEditor = ({ title, tests, kind, updateTest, addTest, removeTest }) => (
  <div className="test-editor">
    <div className="test-editor-heading">
      <h4>{title}</h4>
      <button type="button" onClick={() => addTest(kind)}>
        + Add
      </button>
    </div>
    {tests.map((test, index) => (
      <div className="test-editor-row" key={index}>
        <input
          placeholder="Test name"
          value={test.name}
          onChange={(event) => updateTest(kind, index, 'name', event.target.value)}
        />
        <textarea
          placeholder="stdin"
          rows={2}
          value={test.stdin}
          onChange={(event) => updateTest(kind, index, 'stdin', event.target.value)}
        />
        <textarea
          placeholder="expected output"
          rows={2}
          value={test.expectedOutput}
          onChange={(event) => updateTest(kind, index, 'expectedOutput', event.target.value)}
        />
        {tests.length > 1 && (
          <button
            type="button"
            className="test-remove"
            onClick={() => removeTest(kind, index)}
            aria-label={`Remove ${title} test ${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>
    ))}
  </div>
);

export default InterviewPanel;
