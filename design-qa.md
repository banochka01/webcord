# WebCord Telegram UI — Design QA

- Source visual truth:
  - `design-reviews/concept-messenger-desktop-telegram.png`
  - `design-reviews/concept-native-mobile.png`
- Implementation screenshots:
  - `design-reviews/native-desktop-telegram-final.png`
  - `design-reviews/native-mobile-telegram-final.png`
- Comparison boards:
  - `design-reviews/qa-desktop-comparison.png`
  - `design-reviews/qa-mobile-comparison.png`
- Viewports: desktop 1536 × 1024; mobile 390 × 844 at DPR 1.
- State: authenticated server workspace, `#общий`, populated message timeline.

## Full-view comparison evidence

Desktop now uses the same three-part composition as the reference: a narrow
workspace rail, a wide navigation/conversation column, and a flat chat surface.
The previous outer frame, pane gaps, and rounded nested shells are gone.

Mobile now uses a full-width top bar, horizontally scrollable channels,
unboxed incoming messages, a Telegram-like outgoing bubble, a bottom composer,
and five persistent destinations. The voice-room card no longer consumes the
top of every chat.

## Focused comparison evidence

Focused review covered the brand mark, sidebar/header proportions, message
alignment, composer, and mobile bottom navigation. The launcher and in-app
brand asset use the landing-page `webcord.png`. Standard controls continue to
use Material Symbols rather than hand-built icons.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- P3: fixture avatars use initials because the deterministic test does not
  perform network requests. Real user avatars continue to render from profile
  data.
- P3: the native client intentionally keeps voice/video actions in the header
  and composer; the concept shows a smaller subset of the production controls.
- P3: the source mobile mock includes reactions and administrative role chips
  not available in the current message payload.

## Required fidelity surfaces

- Fonts and typography: Segoe UI is loaded for the Windows-native hierarchy;
  sizes, weights, line heights, truncation, and wrapping were checked at both
  viewports.
- Spacing and layout rhythm: pane widths, separators, chat gutters, channel
  strip, composer, and bottom navigation align with the selected direction.
- Colors and visual tokens: deep navy surfaces, violet selection/outgoing
  messages, cyan identity accents, muted labels, and semantic live state all
  map through the active theme palette.
- Image quality and asset fidelity: the landing-page logo is used directly;
  screenshots render at native pixel dimensions without resampling artifacts.
- Copy and content: app-specific labels, channel names, Russian sample
  messages, and navigation destinations were verified for clipping.

## Comparison history

1. Initial implementation: P1 nested card composition and P1 mobile voice dock;
   P2 incoming mobile bubbles; P2 missing personal-message section.
2. Fixes: flattened desktop panes, removed permanent mobile voice dock, added
   personal-message rows, expanded mobile content width, and removed incoming
   message cards.
3. Post-fix evidence: both final screenshots and comparison boards above.

## Interaction and regression checks

- Channel switching, navigation destinations, menu/voice sheets, composer
  controls, and responsive shell selection remain wired to production state.
- Flutter analyzer and widget tests pass, including 390 × 844 overflow coverage.
- Deterministic golden captures pass for desktop and mobile.

final result: passed
