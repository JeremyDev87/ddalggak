# Fixture form design

This is an intentionally synthetic functional state harness, not a product redesign. No external research, models, assets or dependencies. Native semantic form primitives are the design system.

- Tokens: system font 16px, ink #182230, background #f4f6f8, white surface, accent #174ea6; spacing 8/16/24px; max width 480px.
- Single responsive column with 24px page padding; no decorative motion.
- Name label, required text input, submit button, live status. Visible native focus ring, 44px controls.
- States: idle, native required-invalid, pending disabled, success, error, retry-success.
- QA widths: 375, 768, 1280. Server response release is event-controlled, never delayed by a sleep.
- Accepted debt: native controls vary by browser; semantic behavior, not exact pixels, is the oracle.
