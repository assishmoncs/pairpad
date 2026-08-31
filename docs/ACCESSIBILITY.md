# PairPad accessibility

PairPad treats accessibility as a release gate, not a visual-polish task.

## Automated gates

The Playwright suite checks public application pages for:

- exactly one page-level `h1`
- accessible names for buttons, links, and form controls
- labels or ARIA naming for form fields
- no positive `tabindex` values
- alternative text on rendered images
- visible keyboard focus on primary controls

The browser suite is executed by the same CI pipeline as the collaboration E2E suite, so accessibility regressions fail the build.

## Implemented foundations

- Skip-to-main-content link on route changes.
- Main-content focus management after navigation.
- Global `:focus-visible` styling with a high-contrast outline.
- `prefers-reduced-motion` support that disables non-essential animation/transition motion.
- Semantic button/link usage for application controls.
- `aria-live` feedback for asynchronous user-facing states.

## Manual review requirements

Automated DOM checks cannot prove full WCAG conformance. Before a production release, manually verify:

1. Keyboard-only navigation through authentication, dashboard, room, workspace, chat, history, and interview flows.
2. Screen-reader announcements for connection changes, execution results, role changes, file operations, and interview state changes.
3. Color contrast for normal text, editor states, alerts, status indicators, and collaborator identity colors.
4. Zoom/reflow at 200% and narrow mobile widths.
5. Reduced-motion behavior in a real browser.
6. Monaco editor keyboard navigation and screen-reader fallback behavior.

## Target

The product target is WCAG 2.2 AA for application chrome and forms, with documented limitations for Monaco's complex code-editing surface.
