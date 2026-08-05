# Windows Release Checklist

Use this checklist before publishing a NEUD Windows release and when validating on a second computer.

## Developer release gate

- [ ] Root and `@neud/desktop` versions match
- [ ] `npm run test:neud-release-version` passes
- [ ] `npm run test:neud-release-security` passes (with `NEUD_BUILD_RELEASE=1` when applicable)
- [ ] `npm run test:neud-packaged-browser` passes
- [ ] `npm run test:neud-auto-update` passes
- [ ] `npm run release:win` completes
- [ ] `latest.yml` and blockmap present
- [ ] No service-role key or `.env.local` in packaged output
- [ ] Bundled Chrome launches in smoke test

## Second-computer acceptance (clean Windows PC)

The test computer must **not** require Node.js, npm, Git, Puppeteer, Chrome, source code, or environment files.

1. [ ] Transfer only `NEUD-Setup-<version>-x64.exe`
2. [ ] Install NEUD (per-user default)
3. [ ] Launch from Start Menu
4. [ ] Confirm version displays **Alpha 0.1.1** (or current release)
5. [ ] Confirm local API health at `http://127.0.0.1:3000/api/health`
6. [ ] Sign in with normal credentials
7. [ ] Open Broad Arrow project
8. [ ] Confirm scraper engine initializes bundled browser
9. [ ] Confirm browser path is under `{InstallDir}\resources\puppeteer\chrome\`
10. [ ] Run safe scraper initialization (no live auction required for gate)
11. [ ] Confirm displays still work
12. [ ] Close and reopen NEUD; confirm local data persists
13. [ ] No Chrome installation prompt
14. [ ] No browser download on first launch
15. [ ] No console window remains open
16. [ ] No orphaned Chrome processes after exit
17. [ ] Settings → Check for Updates shows clear status
18. [ ] Help → Check for Updates uses same status (no duplicate checks)
19. [ ] Offline launch still permits local operation
20. [ ] Uninstall/reinstall confirms expected data retention

## Update acceptance (0.1.1 → 0.1.2 test)

1. [ ] Install 0.1.1 on second computer
2. [ ] Publish controlled 0.1.2 draft release with installer + `latest.yml`
3. [ ] Launch 0.1.1 → Check for Updates detects 0.1.2
4. [ ] Download progress visible
5. [ ] **Later** keeps app usable
6. [ ] **Restart and Install** upgrades to 0.1.2
7. [ ] SQLite, downloads, auth, settings, and projects intact
8. [ ] Bundled browser still launches after update

## Code signing

- [ ] Production release signed with Authenticode certificate
- [ ] Certificate secrets stored only in CI, not in repo
- [ ] SmartScreen behavior documented for unsigned test builds

## SmartScreen note

Unsigned local test builds **will** show Windows SmartScreen warnings. This is expected until signing is configured.
