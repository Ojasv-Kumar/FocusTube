# YourTube Curiosity / Video UI Redesign

## Files changed
- `src/content/home-ui.js`: Curiosity/Interest home feed layout, spotlight background, animated headline, magnetic Refresh action, video cards, loading skeletons, and compact expandable feed notice.
- `src/content/results-ui.js`: Learn search-results presentation, matching video-card interactions, cursor spotlight, responsive styling, and expandable status details.
- `src/content/ui-kit.js`: shared pointer/scroll motion helpers, reduced-motion and hidden-tab handling, motion tuning, and the reusable accessible status-notice component.

## Tunable motion settings
At the top of `src/content/ui-kit.js`, edit `MOTION_TUNING`:
- `cardTiltDegrees`: card rotation strength.
- `cardLiftPixels`: amount the card lifts on hover.
- `thumbnailParallaxPixels`: thumbnail scroll drift.
- `heroParallaxPixels`: hero/header pointer drift.
- `magneticButtonStrength`: how strongly the Refresh/Retry button follows the pointer.
- `pageSpotlightSize`: cursor-following spotlight size.
- `pageSpotlightOpacity`: spotlight intensity.

No remote libraries, scripts, fonts, or CDN assets were added. Existing fetching, ranking, retry/refresh callbacks, original-results controls, and video links remain connected to their existing functions.
