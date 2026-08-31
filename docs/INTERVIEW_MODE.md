# PairPad Interview Mode

Interview Mode turns a PairPad room into a timed coding assessment.

## Lifecycle

`draft -> running -> paused -> running -> ended`

Only the room owner can configure, start, pause, resume, or end an interview. An interview cannot be reconfigured while it is running or paused.

## Candidate experience

The candidate sees:

- problem title and statement
- selected programming language
- public example tests and expected output
- authoritative countdown timer
- submit button while the interview is running
- public test results
- hidden-test pass/fail status without hidden inputs, expected outputs, or execution output

The server checks the candidate role, optional candidate assignment, language, lifecycle state, and elapsed time. The browser timer is only a presentation layer.

## Host experience

The owner can configure:

- title
- problem statement
- duration from 1 minute to 24 hours
- language
- optional candidate assignment
- public tests
- hidden tests

Each test has a stable id, name, stdin, and expected output. Test collections are bounded to 50 cases per category.

## Hidden-test security

Hidden tests are stored on the server and are never returned by the candidate interview GET endpoint. Candidate submission responses expose only hidden-test id, pass/fail, status, timing, and memory metadata. Expected output and input remain private.

## Execution model

Submissions reuse PairPad's isolated/Judge0 execution service. Tests run sequentially to avoid multiplying untrusted-code concurrency. The interview layer does not bypass execution limits or the production execution policy.

## REST API

- `GET /api/rooms/:roomCode/interview` — get sanitized interview state
- `PUT /api/rooms/:roomCode/interview` — owner configuration
- `POST /api/rooms/:roomCode/interview/start` — owner starts timer
- `POST /api/rooms/:roomCode/interview/pause` — owner pauses timer
- `POST /api/rooms/:roomCode/interview/resume` — owner resumes timer
- `POST /api/rooms/:roomCode/interview/end` — owner ends interview
- `POST /api/rooms/:roomCode/interview/submit` — candidate submits solution

The same state is broadcast over Socket.IO using `interview-updated` and `interview-state-changed`.
