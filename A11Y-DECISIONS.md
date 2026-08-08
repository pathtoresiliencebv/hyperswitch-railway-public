# Accessibility decisions

## Persistent sandbox restriction notice

- **Profile:** Standard, WCAG 2.2 AA.
- **Platform:** Non-React web wrapper around the existing control center.
- **Pattern:** A persistent in-flow `<aside>` placed before the SPA application root.
- **Decision:** Use an informational region with visible warning text and a native link, rather than a modal or dismissible toast.
- **Reason:** The restriction applies for the entire beta session and does not require a user decision. A modal would create unnecessary focus management and a dismissible toast could hide safety-critical information.
- **Interaction:** The only interactive element is a native link with a 44 CSS px minimum target, visible underline, and a three-pixel high-contrast focus indicator.
- **Responsive behavior:** The notice wraps in normal flow and the link becomes full-width at narrow viewport widths. A scoped wrapper override removes the vendor login card's fixed 30-rem/24-rem widths below 480 CSS px so the form reflows at 320 CSS px without horizontal clipping. It has no motion or time limit.
- **Human validation still required:** Screen-reader announcement order and browser zoom/reflow must be checked on the deployed page; automated tests are not certification.
