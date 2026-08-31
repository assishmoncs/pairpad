# PairPad Workspace UX

Phase 11 focuses on making the collaboration workspace understandable without reading the source code.

## Connection states

The room displays connected, reconnecting, and disconnected states. A reconnecting banner explains that Socket.IO is recovering the session; a disconnected banner exposes a retry action. Socket errors are announced with `aria-live`.

## Editing states

The editor remains read-only until the authoritative CRDT state is ready. Viewers remain read-only after authorization. Sync status is visible in the toolbar so users can distinguish local editing from collaboration initialization.

## Shortcuts

- `Ctrl/Cmd + Enter`: run code.
- `Ctrl/Cmd + Shift + C`: copy the room code.
- `Ctrl/Cmd + Shift + F`: toggle focus mode.

A visible Shortcuts dialog documents these actions.

## Focus mode

Focus mode hides the collaboration sidebar and expands the editor to the full workspace width. It is reversible and does not alter room state.

## Accessibility

Interactive room controls use visible focus styles, semantic labels, `aria-live` for asynchronous state changes, and reduced-motion handling for the reconnecting indicator.

## Responsive behavior

The collaboration layout collapses from editor-plus-sidebar to a stacked mobile layout below 700px. The header and toolbar wrap instead of overflowing horizontally.

## Error recovery

Room loading errors provide retry and dashboard navigation. Runtime collaboration errors remain visible without blocking access to the editor when the room is already loaded.
