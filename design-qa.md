# WebCord unified theme system — Design QA

## Evidence

- Source of visual truth: `design-reviews/concept-unified-theme-system.png` (`1487 × 1058`).
- Final comparison board: `design-reviews/qa-fidelity-final.png`.
- Web captures: `design-reviews/web-fidelity-desktop.png` (`1536 × 1024`) and `design-reviews/web-fidelity-mobile.png` (`390 × 844`).
- Flutter goldens: desktop and mobile captures for Telegram Focus, Material Motion, and Adaptive Atmosphere in `clients/webcord_native/test/goldens/`.
- Tested state: authenticated Calm server workspace, populated text channel, voice room, personal conversations, outgoing messages, and Material Motion selected.

## Full-view comparison

The final implementations preserve the reference hierarchy: branded destination rail, wide conversation navigation, dominant chat surface, floating composer, and a dedicated Theme Studio on wide screens. Both clients use lightweight incoming messages and content-fit outgoing bubbles instead of full-width message cards.

The theme selector changes the complete interaction system:

- Telegram Focus: compact density, outline icons, flat surfaces, quick motion, and blue message geometry.
- Material Motion: Material icon mapping, tonal containers, emphasized easing, state layers, and expressive shapes.
- Adaptive Atmosphere: luminous icon mapping, translucent surfaces, spring motion, ambient light, and reactive depth.

## Focused checks

- Desktop pane proportions, header hierarchy, selected rows, message grouping, timestamps, composer width, and Theme Studio density.
- Mobile navigation, channel opening, message geometry, composer fit, and text wrapping at `390 × 844`.
- Theme interactions in the browser: Telegram Focus → Adaptive Atmosphere → Material Motion, with `data-theme-mode` verified after each selection.
- Flutter Theme Studio selected state and all desktop/mobile golden fixtures.

## Findings and fixes

1. P1 fixed: later legacy responsive rules hid Theme Studio and collapsed the rail/sidebar widths. Final scoped layout guards now preserve the four-column concept at `≥1380px`.
2. P1 fixed: incoming messages inherited Material containers on mobile. Incoming messages are now unboxed in every theme and viewport; outgoing messages remain compact, asymmetric bubbles.
3. P1 fixed: all clients now use the supplied transparent white/black WebCord brand assets; generated launcher tiles use the white mark on Aura Nightfall.
4. P2 fixed: full locale timestamps crowded message bubbles. Timeline messages now show compact local time while the date divider carries the calendar context.
5. P2 fixed: mobile composer copy and controls clipped at `390px`; the hint is shortened and the form is constrained to the viewport.
6. P3 accepted: deterministic Flutter fixtures use initial avatars because golden tests do not perform network requests; production avatars remain data-driven.

## Regression checks

- `npm.cmd run check` — passed, including backend syntax, Prisma validation, and React production build.
- Flutter analyzer — passed with no issues.
- Flutter tests — all 10 passed, including responsive theme goldens and Theme Studio coverage.
- Browser QA — desktop/mobile rendering and all three theme selections passed. The only console entries were expected failed WebSocket handshakes from the isolated mocked QA backend; no React runtime errors occurred.
- Reduced-motion behavior remains implemented in both clients.

final result: passed

## 2026-07-23 brand and icon polish

- Aura Nightfall is now the only landing presentation; the A/B/C design switch is no longer rendered.
- Material and Atmosphere use familiar semantic icon mappings in React and Flutter. The React SVG contract was fixed so fill-based icon libraries no longer inherit the outline-only `fill: none` rule.
- The supplied 2000 x 2000 white and black logos are used by the web and Flutter clients. Windows, Android, Capacitor, desktop bundle, PWA, and touch icons were regenerated from the same mark.
- Browser QA verified zero design switches, the locked Nightfall class, both 2000 x 2000 source assets, Material/Atmosphere icon-family rendering, and zero React/console errors.
- React production build, Flutter analyzer, seven golden scenarios, and all ten Flutter tests passed.

## 2026-07-23 release polish

- The always-visible Theme Studio was replaced with a compact right-side drawer on the web and an on-demand dialog in Flutter. The conversation now keeps the full remaining width.
- Web and Flutter now persist `System`, `Dark`, and `Light` appearance modes. Light mode has its own surface hierarchy, contrast tokens, system chrome, and the supplied black WebCord mark.
- The web composer is a Telegram-style multiline pill with `Enter` to send, `Shift+Enter` for a newline, an icon-only send action, and visible sending/saved/error phases. Direct-message delivery state has a separate animated treatment.
- The landing page remains locked to Aura Nightfall; obsolete design-switch markup and the B/C presentation blocks were removed. Theme-system overrides were split into `frontend/src/theme-systems.css`.
- Browser QA covered desktop dark, desktop light, the compact Theme Studio, multiline send behavior, and the `390 x 844` mobile shell with no page errors. Comparison evidence: `design-reviews/qa-release-polish-comparison.png`.
- Flutter QA now includes eight golden scenarios, including a real Material Motion light render with the black logo. Analyzer and all 12 tests pass.

final result: passed
