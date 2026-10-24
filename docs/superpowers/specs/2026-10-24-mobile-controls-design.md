# Mobile play controls

Add a left-thumb directional flight stick (always thrust outside its center dead zone; steer toward the held direction using current heading and the existing turn rate) and right-thumb hold buttons for guns, shields, rockets and mining, plus reverse-thrust and dock buttons. Keep the existing inertial flight model and protocol. Support simultaneous touches and keyboard + touch without one source releasing another.

The existing InputSampler remains the input owner. A TouchControls view captures pointers, feeds the sampler, and uses the existing HUD ability states for availability. Controls are shown on devices with a coarse pointer. The HUD becomes a compact resource strip on touch devices so controls fit portrait and landscape screens. Docked controls are hidden and cleared; dock menu and captain training remain native touch-friendly HTML.

Release held inputs on pointer up/cancel, lost capture, window blur, document hide, rotation/resize, docking and session teardown. Keep game gestures from scrolling or selecting the page; retain normal scrolling and typing in login and dock menus. No new server rules, analog protocol or app installation. The mobile Landscape button requests fullscreen followed by a landscape orientation lock; if unsupported, explain that auto-rotate and physical rotation are needed. Fullscreen remains optional. Scale the mobile world to 60% while preserving HUD/control sizes, capped so visible corners stay inside the server snapshot radius.

## Implementation and proof

1. Regression-test and extend InputSampler with independent pointer-held inputs, merged with keyboard inputs.
2. Add the flight-stick mapping and pointer-based control view; wire its lifecycle into ActiveGame.
3. Adapt touch HUD and controls for safe areas and portrait/landscape layouts; document gestures.
4. Run typecheck, all tests, lint and client build. Verify simultaneous steering + fire, cancellation, docking and captain menus in browser automation and on the connected Android over ADB/scrcpy. Do not commit.

## Flight smoothness

Render the predicted own ship and its camera at animation-frame cadence using the shared physics step for the fraction of time since the latest input tick. Clamp visual extrapolation to one tick and freeze it while docked. Keep reconciliation, authoritative state and input sending at their existing rates.
