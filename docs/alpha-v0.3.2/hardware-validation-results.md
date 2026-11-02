# NEUD v0.3.2 — Hardware validation results

**Date recorded:** 2026-11-02  
**Source:** Owner acceptance confirmation (physical hardware).

## Blackmagic UltraStudio Key/Fill — PASSED

- Real Blackmagic UltraStudio hardware was used.
- Key/Fill output functionality passed.
- This is no longer an outstanding hardware-validation blocker for v0.3.2.

No additional technical measurements beyond Owner confirmation are recorded here.

## Allen & Heath SQ-5 Mic Tally — PASSED

Confirmed on a physical SQ-5:

- Ethernet/TCP MIDI connectivity
- Live microphone mute and fader monitoring
- Correct LIVE, MUTED, and FADER DOWN status indications
- Stable channel states during extended mixer inactivity
- Automatic detection of physical network disconnection
- Automatic transition to UNKNOWN when mixer connectivity is lost
- Automatic reconnection after network restoration
- Re-synchronization of actual channel states without manual intervention
- Manual Disconnect behavior
- Compact three-card UHD graphic with transparent background (3840×2160; cards top left, center, and right)

Do not require another hardware acceptance test as a release prerequisite unless a subsequent code change invalidates these results.
