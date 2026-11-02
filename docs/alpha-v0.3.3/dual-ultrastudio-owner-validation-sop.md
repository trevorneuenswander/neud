# Dual UltraStudio output — Owner hardware validation SOP (v0.3.3)

**Status:** Required for claiming the dual-output fix. Automated tests cover session isolation with fixtures; they cannot prove simultaneous physical video.

## Setup

1. Connect **two** Blackmagic UltraStudio devices to the MacBook (Thunderbolt/USB-C as required).
2. Confirm both appear in **Desktop Video Setup** without errors.
3. Connect each device’s Fill (and Key if used) to a distinct monitor or switcher input so both signals can be observed at once.
4. Launch NEUD from this development branch (`feature/v0.3.3-fixes`) with a real DeckLink addon build.
5. Sign in and open **Output**.

## Identity check

1. Confirm NEUD lists **two** distinct External Device ports (different persistent ids / model labels).
2. Record for the report:
   - Device A model label as shown in NEUD
   - Device B model label as shown in NEUD
   - Selected mode for A
   - Selected mode for B

Do not assume the devices are the same model or share modes.

## Simultaneous LIVE

1. Configure Output route A → UltraStudio A, choose a mode returned by A, assign a known display, presentation Fill (or Key/Fill if supported).
2. **Start** A. Confirm physical video on A’s monitor/switcher. Confirm NEUD shows A as LIVE.
3. Configure Output route B → UltraStudio B, choose a mode returned by B, assign a display (same or different).
4. **Start** B. Confirm physical video on B.
5. **Confirm A’s physical output is still present** while B is LIVE.
6. Confirm NEUD still shows **both** A and B as LIVE.

## Reverse start order

1. Stop both outputs.
2. Start B first, then A.
3. Confirm both physical outputs remain present and both routes show LIVE.

## Independent stop / restart

1. With both LIVE: **Stop A**. Confirm A’s physical signal stops; B continues; NEUD shows A stopped and B LIVE.
2. **Start A** again. Confirm both physical outputs; both LIVE.
3. **Stop B**. Confirm B stops; A continues.
4. **Start B** again. Confirm both remain LIVE.

## Independent reconfiguration

1. With both LIVE: change A’s assigned display (or mode if safely supported) and re-take LIVE as the product UI requires.
2. Confirm B’s physical output is uninterrupted.
3. Repeat swapping B’s display while A stays LIVE.

## Failure reporting

1. While both LIVE, power-cycle or unplug UltraStudio A only.
2. Confirm NEUD does **not** keep A marked LIVE once the session is gone (error / device-unavailable / stopped-unexpectedly is acceptable).
3. Confirm B remains LIVE with physical output.

## Pass criteria

- Both UltraStudios can output simultaneously.
- Starting/stopping/reconfiguring one does not silently stop the other.
- UI LIVE state matches real native playback for each device independently.

Do **not** mark this fix complete until this SOP passes on physical hardware.
