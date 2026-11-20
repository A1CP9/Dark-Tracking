# DARK TRACKING — verified progress and blockers

## 2026-11-20 — repository audit (no runtime changes)

Source of truth checked: `main` README.md and packaging/build.py via authenticated GitHub connector.
README labels source **0.68 development** and explicitly says Windows installer is unsigned; protected Windows installation and live console operation remain pending. The main branch did not contain a `PROGRESS.md` at the time of this audit (404). Earlier Library handoff contains a **0.62** Windows acceptance log, not evidence that 0.68/0.69 passed.

### Priority acceptance gates
1. **PSN / PS5 Remote Play:** NOT VERIFIED. Require real PSN authentication and pairing on an authorized console; expose separate authentication, registration, transport, stream and input states, with Connecting / Connected / Disconnected / Error and actionable failure reasons. Connected must depend on a live session, not merely a stored login token.
2. **SIGNAL PATH / Smart App Control:** NOT VERIFIED. The README calls the installer unsigned. Diagnose signing/trust and dependencies on Windows 11 with SAC On and Defender active; do not disable protections or claim SAC compatibility without a real protected-client run.
3. **Dark/Light mode:** NOT VERIFIED. Implement persisted user preference and test restart.
4. **Musashi visual identity:** NOT VERIFIED for installed UI. Packaging references `icons/musashi.ico`; verify icon contents and appearance in window, taskbar, shortcut, installer, and theme. Original illustration rights must be respected.

### Verification performed this run
- Authenticated GitHub read of README.md and packaging/build.py: PASS.
- Confirmed packaging/build.py embeds `icons/musashi.ico` in PE resources and bundles available root-level HTML/JS/Python files: STATIC ONLY.
- Read earlier Library handoff 0.62: historical Linux simulations only, no validated Windows 11 SAC/PS5 acceptance.
- Windows installation, PSN login, PS5 pairing, real frame/input path, and visual UI tests: NOT RUN; no authorized interactive Windows/console runtime attached to this execution.
- No code fix, new installer, or new version claimed.

### Next execution
Obtain the current complete source and authorized Windows 11 test environment; inspect Remote Play session state implementation, add explicit state transitions and error mapping, add regression tests, then test actual login/pairing. Do not label the build release-ready until Windows 11 SAC/Defender and real PS5 acceptance succeed.
