# Changelog

All notable changes to this plugin are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.5.2] — 2026-11-20

Clear actually clears.

### Fixed

- **Clearing the reader left the text in place on the next open.** The document lives in
  `localStorage` (`gpt-sovits:reader-doc`) and was only written when playback started;
  「清空」 cleared the component's memory and the textarea but never that entry, so the next
  mount read the document straight back. Clearing now stops playback, resets the buffer and
  removes the stored document.
- **Editing without pressing 朗读 lost the edit.** The document was only persisted on playback
  start, so a correction followed by closing the panel came back as the old text. The textarea
  now saves on blur, and deleting all the text clears the stored copy.
- **Importing a file did not persist it.** A file was only remembered once it had been read
  aloud; it is now stored as soon as it loads, so reopening the panel shows it.
- **Re-decoding with another encoding did not persist either.** The re-decoded text is now
  stored immediately.

### Changed

- **The self-check passes 62 / 62.** Five checks had drifted from the implementation rather
  than from a defect: a renamed read-mark accessor, a restructured turn-claim guard, a restart
  that intentionally keeps the per-session mark, a multi-line assertion that CRLF broke, and a
  fixture that marked a streaming reply as settled and gave it no sentence terminator. Each was
  updated to assert the current behaviour; the restart case now pins the opposite rule
  (the per-session mark must survive) explicitly.

### Tests

- `node --check lib/client.js`; `node scripts/selfcheck.mjs` → 62 passed, 0 failed.

## [0.5.1] — 2026-11-20

Pick any block and read from there.

### Added

- **Block list with a live highlight.** The reader view renders the text as blocks instead of a
  textarea, highlights the block being spoken, and scrolls it into view. Clicking any block starts
  playback from that block. The player receives the same pre-split blocks the list renders, so
  "click block N / highlight block N / speak block N" can never disagree.
- **A 编辑 / 朗读视图 toggle.** 编辑 switches back to the textarea for corrections; 朗读 returns to the
  block list. Importing a file now opens in edit mode first, so the text and detected encoding can be
  checked before playback starts; pressing 朗读 switches to the block list automatically.
- **`SovitsPlayer.play()` accepts pre-split blocks** through `options.blocks`, reusing the reader's own
  splitter instead of splitting the text a second time.

### Changed

- **The reader toolbar is one row.** Voice, encoding, 打开文件 and the view toggle share a single
  wrapped row; the two selects size to their content instead of stretching across the panel.
- **The encoding control no longer disappears** when the text came from cache: it stays visible but
  disabled, with a tooltip explaining that raw bytes are needed to re-decode.
- **The empty state states the limits**: supported extensions, the 300,000-character cap, how encoding
  detection works, and what playback inherits from the plugin.
- **`GBK / ANSI（中文 Windows）` is now `GBK / ANSI`**, freeing most of that control's width.

### Fixed

- **Clicking a second block no longer clears the new playback's state.** An interrupted `play()` also
  resolves, so a stale `then` could reset the stop button and progress of the playback that replaced
  it. A monotonic `speakToken` now gates those callbacks.

### Tests

- No new automated tests; `node --check lib/client.js` and `node scripts/selfcheck.mjs` still report
  57 passed / 5 pre-existing failures (the same five fail on the previous tag).

## [0.5.0] — 2026-11-20

Read any text aloud.

### Added

- **A sidebar reader (right rail → 「朗读文本」).** Drop a text file (`.txt` / `.md` / `.srt`, 40+
  extensions) or paste text straight in, press 朗读, and it reads from the first character to the last.
  Blocking, sentence splitting, the symbol and unit tables, punctuation pauses, voice, speed and volume
  all come from the same player and settings as the chat buttons — this is not a second playback path.
  Progress shows 「第 i / m 块」. The text, file name and position live in browser storage, so a reload
  keeps them; when playback is interrupted (a conversation switch, or the main chat button taking the
  channel), a 「继续阅读」 bar appears and resumes from the block that was interrupted.
- **Encoding detection.** BOM first, then strict UTF-8, then GB18030 (the ANSI code page on Chinese
  Windows). A wrong guess can be re-decoded as UTF-8 / GBK / UTF-16LE / UTF-16BE without re-picking the
  file.
- **Read any selected text.** Select text anywhere in the page and a 🔊 button appears under the
  selection; it speaks the selection and turns into 「停止」 with progress while playing. It does not
  appear inside inputs, textareas or editable regions.
- **Two switches.** Settings → 语音朗读 gains 划词朗读 and 侧边栏朗读面板; both take effect immediately.

### Changed

- **The chat button still wins the channel, but no longer stops the sidebar for good.** When the main
  reply button (or auto-read) starts, the sidebar yields and remembers the block it reached; switching
  conversations or sending a message no longer interrupts it.
- **`SovitsPlayer` gained progress and a resume point.** `play()` accepts `startIndex`; playback tracks
  「block i of m」; `stop()` stores the resume point.

### Tests

- No new automated tests; `node --check lib/client.js` and `node scripts/selfcheck.mjs` (62 checks)
  pass.

---

## [0.4.6] — 2026-11-19

Voice presets fold.

### Changed

- **Each voice preset is its own fold.** A preset is a whole form — name, two model pickers, a
  reference clip, prompt text, language — so a few of them turned the settings page into a wall of
  inputs where the one you meant to edit was hard to find. Each preset is now a single summary row
  (its name, the two weight files and the reference clip) that opens on demand and folds back. A
  newly added preset opens, a single preset opens by itself, and removing one leaves the surviving
  rows folded exactly as they were.

---

## [0.4.5] — 2026-11-17

The first answer of a new conversation is spoken again.

### Fixed

- **A brand-new conversation's first reply was never read aloud.** The switch window silences any reply
  that had already settled inside it, which is what landing on an old conversation needs — but the first
  answer in a new conversation settles inside that window too, so it was filed as history and never
  spoken. The window now yields to a turn the user started, and, for the case where the client mounts
  only after the reply has arrived, to a conversation with a single turn and no read mark: the answer to
  the question just asked in a conversation that did not exist before. A conversation with more turns,
  or one that carries a mark, still stays silent.

- **A switch left the previous conversation's turn marker behind.** Turn numbers are per conversation,
  so landing on one with fewer turns than the old marker made every later turn compare "not greater"
  and be ignored — including the turn count that decides whether a reply is new.

---

## [0.4.4] — 2026-11-17

The switch fix that 0.4.3 was meant to be. 0.4.3 tried to silence the newest reply on a switch and did
the opposite.

### Fixed

- **Switching conversations still read the last reply aloud.** The interception marked the reply as
  `CLAIMED`, and `CLAIMED` means "the queue owns this". The next mounted driver copy saw the claim,
  skipped the speak branch, and fell through to `enqueue()` — the queue check was
  `queuedUpTo === 0`, which is exactly what a reply that was never queued looks like. The
  interception was causing the playback. Silenced replies now live in their own set, checked before
  any other branch, and the grace window counts a never-stamped copy as "just landed" rather than
  "landed long ago".

---

## [0.4.3] — 2026-11-17

A reply belongs to its own conversation. Two fixes around auto-read, both about state that was kept
in one place but belonged in another.

### Fixed

- **Switching conversations no longer reads the previous reply aloud.** The read mark was a single
  global message id, so every other conversation's newest reply looked unread; `restart()` also cleared
  it on the way out, which made switching back read a reply that had already been heard. The mark is
  keyed by conversation now, and every switch establishes a baseline: a newest message that had already
  settled is history and is marked read, while one still streaming was generated just now and is spoken
  normally.

- **The speaker button follows auto-read.** `playing` was only set by `play()` — the one-shot path
  behind the button and the preview — while the queue ran on `busy` alone, and the button compared its
  whole message text against the queue's current *sentence*, so it never matched. It matches on the
  message id now, and the glyph turns into a pause for the duration of a spoken reply.

- **A synthesis in progress can be cancelled.** The button was disabled while loading, which made the
  cancel branch in its click handler unreachable exactly when the user needed it.

---

## [0.4.2] — 2026-11-17

The second correctness pass: the edge cases that fail quietly. Nothing new to configure, and every
item here was reproduced or probed before it was changed.

### Fixed

- **The engine's weights are forgotten when it stops.** The cached pair answered "the engine already
  has this voice" after a restart, so no `set_*_weights` was sent and the reply came out in whatever
  voice `api_v2.py` had loaded from its own yaml — audibly wrong, with nothing in the log.

- **Settings are written atomically.** A kill or power cut during the old `writeFileSync` left half a
  JSON file, which reads back as "no voice presets at all". The new file is written beside the old
  one and renamed over it, so a reader sees either version, never a mixture.

- **One failed sentence no longer ends the reply.** The drain loop used to leave through its outer
  `catch`, dropping every sentence still queued behind the failure; a single engine hiccup mid
  paragraph left the rest of a long answer unspoken. The failure is now handled per sentence.

- **The tail-trim analyser no longer exhausts audio contexts.** It created a live `AudioContext` per
  sentence to measure where the voice stops. Chrome caps how many a page may hold, so long replies
  went silent once the cap was reached. It now uses an offline context, which is pure computation.

- **"Already running" is no longer reported as "start failed".** The host answers `launched: false`
  for four different situations — already up, launcher in flight, memory gate, stopped by the user —
  and the client flattened all of them into a failure message.

- **A Chinese engine path reaches the standalone launcher intact.** `settings.local.bat` was written
  as ASCII, so non-ASCII directories arrived as `?` and the launcher pointed nowhere. It is UTF-8 now
  and switches the console to 65001 on its second line. Quotes are stripped and `%` escaped, which
  also closes the one place a configured path could inject a command.

- **The drive sweep only runs when it is needed.** Candidate discovery built its whole list up front,
  so every caller paid for `readdirSync` on all 26 drive letters — and a disconnected network share
  blocks that call for seconds. It is a generator now, and stops at the first checkout it finds.

- **The log route reads a tail, not the file.** `engine-output.log` grows for as long as the engine
  runs, and the settings page re-read it whole on every poll. It reads the last 256 KB, and reports
  the real file size rather than the decoded length.

- **Two boot sequences handle their own rejections.** An unhandled rejection is fatal on Node 22, so
  a throw in either `void (async …)()` would have taken the whole Host down over a failed engine
  start or an orphan sweep.

- **The preview can be cancelled.** The button was disabled while synthesis ran, so a mis-click meant
  waiting out a whole clip. A second click stops it, and the label says so.

- **The on-disk clip purge actually runs.** `audioDir()` was called as a function although it is a
  string, so the cleanup threw a `TypeError` that the surrounding `try` swallowed and old WAV files
  were never reclaimed.

---

## [0.4.1] — 2026-11-17

A correctness pass over the reading queue and the engine switch. Nothing new to configure; every
change fixes a case that used to fail silently.

### Fixed

- **Auto-read no longer goes quiet after a single stop.** `pauseFor` handed its timer to `stop()`,
  which cleared the timer without settling the promise the drain loop was awaiting. The loop stayed
  `draining` forever and every later reply was silent until the page reloaded.

- **Stopping no longer replays the reply.** `stop()` cleared the queue but not the driver's claim,
  so the next text update re-queued the message from offset 0.

- **The first reply of a new conversation can no longer break the chat page.** The text hook
  returned before calling `useChat` when no message id existed yet, so the hook count changed on the
  render where the reply appeared — the shape React rejects outright. The diagnostic probes that
  made extra hook calls during render moved into effects.

- **A missing engine interpreter no longer takes DSH down.** `spawn` failures arrive as an
  asynchronous `error` event; without a listener Node treated them as an uncaught exception.

- **The launch slot is claimed before the first probe.** Two callers could both pass the guard
  during the ten-second health probe and start two supervisors on the same port. A failed spawn now
  also releases the slot immediately instead of holding it for four minutes.

- **The audio cache key includes the split method.** The same text asked for `cut0` and then `cut5`
  was served the first clip.

- **The tray rows step aside when the plugin is gone.** A 404 from the plugin's route now hides both
  rows instead of leaving a permanent "检测中…"; a network failure still reads as unknown, and
  reinstalling the plugin restores them.

- **An engine that never becomes ready is no longer orphaned.** After 140 seconds the supervisor
  kills the child it started instead of exiting and leaving it holding the GPU.

- **The read-aloud action reports once per message, not once per render.** Each report was a
  synchronous log write on the Host thread while a reply streamed.

---

## [0.4.0] — 2026-11-17

The engine switch, where people actually look for it: on the tray icon. The desktop app builds its
tray menu in the Electron main process, which a plugin cannot reach, so the plugin makes a
byte-for-byte edit to `app.asar` instead — backed up, verified, reversible, and re-applied after a
DSH upgrade.

### Added

- **Two rows in the tray menu.** A status row (`GPT-SoVITS已启用` in green, `GPT-SoVITS已停用` in red,
  grey `GPT-SoVITS检测中…` when the probe cannot answer) and an action row (`启动` / `停止`, with
  `启动中…` / `停止中…` while it works). Clicking the status row probes immediately; clicking the
  action row starts or stops the engine and re-checks 1.5 s later. Windows cannot colour menu text,
  so the colour lives in a 16×16 dot icon.

- **A divider on each side.** "Open DeepSeek Harness", a separator, the two engine rows, a separator,
  "Quit DeepSeek Harness" — and the first separator is skipped when the extension is not loaded, so
  an uninstalled plugin leaves no doubled rule.

- **The archive patch is self-healing.** `lib/tray-patch.mjs` locates `resources/app.asar`, replaces
  the `lib/types/tray.js` region and the tray construction site with equal-length copies, rewrites the
  header SHA-256 so an integrity-checking install still validates, and keeps the untouched `main.js`
  at `$DSH_HOME/gpt-sovits/tray-main.js.orig`. It runs five seconds after the plugin starts, is
  idempotent, and patches again after a DSH upgrade restores the stock file.

- **A focused diagnostic.** Probe and action failures are appended to
  `$DSH_HOME/gpt-sovits/tray-diag.log` — origin only, never the access token. The menu stays quiet; an
  unreachable Host shows grey rather than guessing "stopped".

### Notes

- The patched menu appears on the **next** DSH launch: the running main process keeps the copy it
  parsed at startup. The plugin says so in its log after patching.
- Windows desktop app only. On the web profile the patch reports `no-app` and changes nothing;
  on other platforms it reports `skipped`.
- Uninstalling the plugin restores the stock three-item menu by itself: the patched code finds no
  extension module and falls back.

### Fixed

- **The Host URL is not an origin.** It is `<origin>/?token=…`; concatenating a route onto it landed
  on the app shell and the health probe parsed HTML as JSON, so the status row sat on "检测中…"
  forever. Only `origin` is used now.

## [0.3.3] — 2026-10-21

A startup memory check: DSH is opened, free memory is read once, and only then is the engine allowed
to start. The gate withholds the engine, never the plugin.

### Added

- **The check.** Once per DSH launch, before anything is mounted, free physical memory is compared
  against a line (4.0 GB by default). Below it the engine is simply not started: the boot path and
  the 60-second keep-alive both return `note: 'memory-gate'` without probing or launching. The plugin
  itself loads normally, so the settings page, the engine console and the model list stay available
  and the reason is readable where it can be acted on.

- **A manual start is the escape hatch.** The status card shows the decision as a line — "low memory
  — engine not started · 3.0 GB < 4.0 GB" — next to a "Start engine" button. A manual request is
  allowed even when the gate holds, and it retires the gate for the rest of the launch so the
  keep-alive does not fight it.

- **Two settings**, in the playback area of the settings page: whether to check at all, and the
  threshold in GB (512 MB to 32 GB). They live in `settings.json` rather than browser storage because
  the host reads them before the plugin mounts anything, when no browser exists yet.

- **The decision is reported.** `action=status` carries `memoryGate` (`enabled`, `thresholdMb`,
  `freeMb`, `gated`, `reason`, `checkedAt`, `bypassed`), the same object is written to
  `memory-gate.json`, and one line goes to `memory-gate.log` per launch.

### Changed

- **The earlier self-disable design is gone.** 0.3.3 was first written to switch the plugin's own
  Loader row off (`disabled: true` in the profile patch) through the plugin manager. Measured on a
  real machine, that failed whenever the manager was not ready yet (log: `the entry cannot be
  disabled; running anyway`), and a successful disable took the settings page with it, so changing
  the threshold meant re-enabling the plugin first. Withholding the engine reaches the same goal
  without either problem.

### Notes

- **Every failure lets the engine start.** A disabled gate or a refused memory reading must not
  withhold it; that would be worse than the pressure this guards against.
- **Equality passes.** The rule is "free is below the line", so a machine sitting exactly on 4.0 GB
  keeps working.
- **The threshold applies on the next launch.** The check is a once-per-launch decision, not a live
  guard; the settings page says so.

### Tests

62 offline checks. The gate check lifts `memoryVerdict` and executes it: above the line starts, below
holds, equality starts, a disabled gate never holds, an unreadable or non-numeric reading starts, and
the default is 4.0 GB. It also asserts the wiring as source facts — the boot path stands down before
probing, only automatic callers are gated, a manual start sets `bypassed`, the refusal names the gate,
and the host never calls `setPluginEnabled` (the gate withholds the engine, not the plugin).

## [0.3.2] — 2026-10-04

Four reliability fixes, all of them found by reading a diagnostic log rather than by guessing. They
share one shape: something the design said was bounded was not, or a contract was written down and
never implemented.

### Fixed

- **A deliberate cancellation was reported as a playback failure.** `stop()` aborts a loading clip on
  purpose by clearing `audio.src`, and `audio.onerror` rejected unconditionally — so a cancelled clip
  looked like a broken one. Measured: 36 of 53 `audio playback failed` reports followed a `turn-reset`
  within two seconds, one of them 17 ms after the click. A failed load is now checked against the
  generation first, and resolves quietly when the player was the one who asked for it to stop.

- **The retry the host promised was never written.** `handleAudio` answers `clip-missing` for an
  evicted clip and its comment states that the client re-requests it; the client contained zero
  occurrences of `clip-missing`. Clips have been memory-only since 0.3.0, so a URL really does die with
  the host or with eviction. A lost clip is now re-synthesized once, and `clipErrorName(url)` asks the
  host to name a load failure instead of guessing from a numeric `MediaError`.

- **One turn was reset eight times.** Every mounted driver copy sees the turn number advance relative
  to its own last render, so all of them ran `stop()` and `CLAIMED.clear()` for the same turn — 1,005
  of them in one log. The duplication was not harmless: each copy's `stop()` aborted the clip a sibling
  had just started, which is where most of the reports above came from. The claim now lives at module
  scope (a remount resets a `useRef`) and is taken **before** the work, so a copy that loses the race
  never reaches the player. A fresh mount adopts an existing claim; a conversation switch drops it,
  because `turnOrder` is a workspace-wide count.

- **A clip that never settles deadlocked the queue.** `drain()` awaits `playClip`, and `draining` is
  only cleared in `finally`, so a promise that never settled stopped the queue until the page was
  reloaded. A loose 180-second watchdog guarantees settlement, armed only after `play()` resolves so a
  cancelled clip leaves no timer behind.

### Changed

- **The diagnostics were bounded.** Every report was pushed into a module-level array that production
  code never read (~1 MB per session), `{once:true}` never matched the id-bearing names
  (`see-<messageId>`, `gate-<messageId>`), and `diag.log` had no size check at all. The array is gone,
  every id-bearing name is reduced to its family before deduplicating, `diag.log` rolls over to
  `diag.log.1` past 2 MB, and `trimCache` gained a 512-entry ceiling. Measured: 200 simulated reports
  with distinct ids now grow the set and the POST count by 2 each.

- **Documentation was split.** The root [README.md](./README.md) is now project name, introduction,
  core features, quick start and licence; the former full READMEs moved to
  [docs/README.zh.md](./docs/README.zh.md) and [docs/README.en.md](./docs/README.en.md), which keep
  every section they had and gained appendix 19 describing this release.

### Removed

- A duplicated doc comment ("One sentence per request while streaming…") and `drain(words)`'s dead
  parameter, which was declared and threaded through the recursive call but never read.

### Tests

61 offline checks (up from 58). The three new ones cover the diagnostics ceilings in memory and on
disk, a cancellation resolving quietly with a lost clip re-requested exactly once, and the turn claim
being module-level, adopted by a remount and dropped by a restart.

---

## [0.3.1] — 2026-10-04

### Fixed

- **Switching conversation now actually stops the voice.** Reported as "it still
  reads the previous conversation after I switch". 0.3.0 looked correct and did
  nothing, because the previous session id was kept in the driver component's
  `useRef` — and a session-scoped slot is rendered under a **per-session React
  key** (`sessionGenerationKeyOf` in `@deepseek-ai/dsh-client-ui-renderer`), so a
  switch unmounts the subtree and mounts a fresh copy whose refs are all `null`
  again. Every mount re-entered the "first mount, nothing to report" branch, and
  the restart never ran. The log settled it: 50 `driver-mounted`, zero
  `conversation-changed`, while the module-level player kept speaking for a
  component that no longer existed.

  The previous value now lives at **module scope** (`LAST_DRIVER_SESSION`), the
  only storage that survives the remount, and the new session is claimed before
  the restart so N mounted copies do not each report the same switch.

- **An unmounted driver releases its audio.** The player is module-level, so it
  outlives the component. `driver` unmount now calls `stop()` *and* pauses the
  element, drops its `src` and clears the reference — a paused element that is
  still referenced keeps holding the output. This is the second, independent
  guard: even if the shell ever stops remounting on a switch, the teardown
  silences playback on its own.

### Changed

- The four dead switch detectors are gone for good (`selectSessionKey` over five
  guessed store fields, `navigation.current` turn continuity, the node-set
  digest, the page URL) together with the DOM `MutationObserver` fallback. None
  of them could see a switch; the slot catalog's `sessionId` standard prop could
  all along.

- Two offline self-checks were rewritten and two more added, all inside the
  existing session-switch check, so the total stays at **58**. One rejects a
  component-local previous-session value from coming back; the other renders a
  real driver, runs the cleanup it registered, and requires the audio element to
  be released. Two more drive the fix end to end: a switch **across a remount**
  (same module state, fresh refs) must empty the queue and advance the epoch, and
  the first mount must not restart anything. The self-check harness can now
  reproduce a remount (fresh ref cells) and collect effect cleanups, which is
  what those need.

### Documentation

The release first went out with only the Chinese README updated, so the English one still described
the detector this version deletes — it named `selectSessionKey` and a `MutationObserver` fallback,
neither of which exists any more. The two are level again, and the other two slips are corrected:

- **`README.en.md` brought to parity with `README.md`**: the version row and a `v0.3.1` entry in the
  version table; the feature line for a conversation switch, which still claimed the identity was
  "tracked separately, with a transcript-shape fallback"; and section 15 rewritten to match the
  Chinese text — the signal is the standard `sessionId` prop, the previous value has to live at
  module scope because a switch unmounts and remounts the session-scoped subtree under a per-session
  React key, the new session is claimed before the restart so the several copies of a list slot do
  not each report it, and an unmounting driver releases its audio element because a
  paused-but-referenced one keeps holding the output.
- **This entry's date**, 2026-10-04, the day it was actually released.
- **The Chinese README's version row**, which had been left at v0.3.0 while its own version table
  already listed v0.3.1.

Both READMEs carry 18 matching appendix sections again. No code changed for any of it.

---

## [0.3.0] — 2026-10-03

Six items, all reported from listening to the output. The theme is that the
*rhythm* of speech was being decided by the engine rather than by the plugin:
a sentence's own punctuation is the only thing that should say how long the pause
after it is.

### Added

- **Per-sentence expression.** Speed, `temperature`, `top-k` and `top-p` are now
  sent with every request, so a reading session can change pace or tone partway
  through instead of committing at synthesis time. Adjustment is per-sentence by
  design: a change applies from the next sentence, and nothing already spoken is
  redone. Volume stays a playback property — it costs nothing to change and never
  invalidates a synthesis.
  - **Generation quality is deliberately excluded.** `sample_steps` and
    `super_sampling` describe how much work the engine does, not how the voice
    sounds; letting them differ per sentence would change fidelity halfway
    through one answer.
  - Measured on the real engine: `speed_factor = 1.3` shortened the same sentence
    from 189484 B to 145964 B, and `temperature` at 0.3 and 1.5 produced different
    lengths again — all four controls reach the engine.
- **Pauses measured from the sentence's own punctuation**, with the engine's
  trailing silence trimmed away: a full stop pauses, a comma barely does, a
  paragraph break clearly longer, an ellipsis longest.
- **The on-disk clip cache is reclaimed** on the first boot after upgrading, since
  audio no longer touches the disk.

### Changed

- **Audio never touches the disk again.** Every clip used to be written to
  `$DSH_HOME/gpt-sovits/audio/` and served as a static file — one small write per
  sentence, for data played once and never read again. Clips now live in memory and
  are served straight from the host, capped by both count and total bytes so a run
  of long summaries cannot grow without bound.
- **The engine is told to add no silence of its own** (`fragment_interval: 0`, was
  the engine's default 0.3 s). That default was the real source of the long,
  uneven gaps: a packed block handed over with `cut5` was still split inside the
  engine, and every internal boundary added 0.3 s of its own.
- **Sentence splitting no longer depends on the full stop alone.** Chinese has more
  sentence terminators and they arrive in runs:
  - `。！？；…` and their ASCII forms all end a sentence, as do runs of them
    (`！？`, `……`) — splitting on those with a lookbehind produced
    `他沉默了三秒…` plus a lone `…`, which the engine then spoke separately.
  - A closing quote or bracket ends the sentence with the mark inside it:
    `他说：“走吧。”` is one sentence, not one and a half.
  - **A paragraph break is a hard boundary** and gets the longest pause. The
    cleaning chain used to collapse every run of newlines into one, so a paragraph
    was indistinguishable from a soft line wrap and the reader ran one thought into
    the next.
  - Merging short sentences is now deliberately rare. It caused "sentences that
    should not be joined get joined", because merged text reaches the engine as one
    request and the boundary between them is then outside the plugin's control.
    Only a true fragment (≤10 characters) with no strong pause pending is merged.

### Fixed

- **Tables were read as minus signs.** Reported. A reply reaches this pipeline as raw
  markdown, so a table arrived as pipes and dashes and the engine reads both aloud:
  `| --- | --- |` became a run of "竖线 减号 减号 减号". Neither character is content — one is
  a cell boundary, the other is how the format draws a line. The separator row is now dropped
  entirely and the cells are joined with a comma, which the sentence splitter then treats as a
  weak pause, so a row reads as a list of values.
- **A referenced symbol was not spoken at all.** Reported. ``把 `;` 也作为切分符号`` lost the
  semicolon: the engine drops a bare `;`, so the sentence was about a symbol it never said.
  A symbol inside backticks is now spoken **by name** — 分号, 逗号, 句号, 左方括号 — while
  punctuation *used* as punctuation keeps behaving as one. A code identifier is untouched:
  `\`split\`` stays "split", because naming every character of a word would be nonsense.
  - The name is masked and restored at the end, like a URL. That is not cosmetic: substituting
    plain Chinese early would make a referenced `。` read as the word 句号 *and then act as a
    sentence terminator*, splitting the sentence in the wrong place.
- **The slash rule destroyed every rate and speed unit.** Reported: the generic rule reads
  every slash as "或", which is right for `是/否` and wrong for a unit, where the slash means
  "per". `120km/h` came out as `120km或h`, `3000r/min` as `3000r或min`, `100MB/s` as
  `100MB或s` — the unit was gone and the sentence was nonsense.
  - Fixed with a **unit table**, not cleverer pattern matching: the set of units is
    open-ended, and a reader can extend a table while a regex encoding the same knowledge
    would be unreadable. Compound units are rewritten **before** the slash rule.
  - **Bare abbreviations are expanded too**, because a stray Latin abbreviation reaches the
    engine as spelling: `2.4GHz` was read "2点4 G H z". Now 吉赫兹, 毫秒, 吉字节, and so on.
    This runs *after* the file-extension rule, so `a.b.js` is still an extension, and it
    requires a digit in front, so the `min` in "minimum" and the `s` in "things" are left
    alone.
  - Spacing inside a unit is accepted (`100 km / h`), and the quantity is consumed with the
    unit — matching the unit alone re-emitted the number and read "120 120千米每小时".
- **Switching workspace or session left the previous conversation being read**, and
  every further switch appended to the same queue, so the queue grew without bound.
  The turn counter cannot see this — another conversation is not a turn of this one
  — so the conversation identity is tracked separately, with a transcript-shape
  fallback for a build whose store exposes no session key.
- **Sentences were joined that should have stayed apart** (see *Changed*).
- **A sentence beginning with punctuation produced an empty first utterance**, which
  the engine logged as `实际输入的目标文本: 。你好…` and synthesized as a stray pause.

---

## [0.2.0] — 2026-10-03

Everything below was measured on a real machine and driven by reported symptoms,
not guessed at. Each entry names the symptom that caused it, because several of
these bugs looked like "everything is fine, it just does not speak".

### Added

- **Startup greeting.** A real synthesis of 「你好，欢迎回来」 that plays once per
  DSH session. It serves two purposes: it proves the whole chain works (plugin →
  engine → weights → reference clip), and it pays the cold start — GPT-SoVITS
  loads weights, BERT and CNHuBERT on the first `/tts`, so the user's first real
  sentence is already fast. Configurable and switchable (`greetOnStart`,
  `greetText`).
- **Engine console inside the settings page.** The engine's stdout/stderr, the
  supervisor's decisions and the transcript of what was generated, with 1.5 s /
  0.5 s / manual refresh. This is the content of the API console window, without
  a window that steals focus and kills the engine when closed.
- **Live status panel**, powered by a new `?action=status` route: engine
  reachability, whether the engine is generating, greeting state, active voice
  and reference-clip presence, loaded weights, and the last syntheses with timing.
- **Per-request split control.** The client chooses `cut0` or `cut5` per request;
  an unspecified request defaults to `cut0`, because an unexpected split is what
  produced truncation in the first place.
- **Symbol-to-speech rewriting**: `cmd.exe` → 「cmd点exe」, `3-10` → 「3到10」,
  `v2.7.0` → 「v2点7点0」, `36.5` → 「36点5」, `127.0.0.1` → 「127点0点0点1」,
  `是/否` → 「是或否」, `3/4` → 「4分之3」, `C:\Users` → 「C:杠Users」. Dates such
  as `2024-10-03` are preserved rather than read as a range.
- **Prefetch pipeline** (`PREFETCH_AHEAD = 2`): clips are synthesized while the
  current one plays, which is the only parallelism available — `api_v2.py` is a
  GIL-bound Python process and one synthesis cannot be parallelized internally.
- **Engine lifecycle bound to DSH**, via a Python supervisor that runs without a
  console window. The engine starts and stops with DSH, and an orphan left by a
  crash is reaped on the next boot.

### Changed

- **Auto-read queues instead of preempting.** Streaming text is now spoken one
  sentence at a time, in order, with each sentence queued exactly once as the
  reply grows.
- **Streaming and the final summary use different strategies.** Streaming text
  goes one sentence per request with `cut0` so audio starts as early as possible;
  a settled summary is packed into blocks with `cut5` so the engine cuts inside a
  block rather than paying one request per sentence. Measured: the same four
  sentences take one request and 1.6 s packed, versus four requests and roughly
  3.4 s one at a time.
- **The engine is no longer assumed to outlive DSH.** The reverse is now true, so
  the scheduled task and Startup-folder shortcut were removed: they kept
  resurrecting the engine and fought the new lifecycle.

### Fixed

- **Audio cut off mid-sentence, or a sentence never spoken.** Two splitters were
  disagreeing: the client packed sentences into a ~110-character buffer while the
  engine re-split each request with `cut5`. Measured in the log, `speak` was
  followed four milliseconds later by `play-failed` on the previous message —
  four utterances out of five were being cut off.
- **Engine console mojibake** (reported). Python on Windows encodes stdout/stderr
  with the console code page (cp936 here) while the panel decoded UTF-8, so every
  Chinese line was garbled — including the socket errors and the target text,
  which is exactly what a reader needs. The supervisor now sets
  `PYTHONIOENCODING=utf-8`, and the reader re-decodes a log left by an older
  supervisor instead of displaying it wrong.
- **The greeting never played.** Three separate causes, each fixed: a fixed 1.5 s
  delay fired ~19 s before the engine had bound its port; a failure left the
  in-flight latch set, so the state stayed `synthesizing` forever with no retry;
  and wrapping `speak` in `withEngine` deadlocked the serial engine queue, which
  reported `busy` for over 60 s with no progress.
- **A transient boot failure silenced the greeting for the whole session.**
- **`greeting.state` reported `idle` while the greeting was synthesizing.**
- **Leaving the settings page stopped playback.** The panel's unmount handler
  called `player.stop()` unconditionally, which is how the greeting kept
  disappearing when the settings page was opened and closed.
- **Audio playing under "engine idle" status**, because the greeting synthesized
  outside the engine queue.
- **The greeting no longer competes with real work**: it is produced only when
  the engine is idle and stands down the moment the engine becomes busy, checked
  every 100 ms from local state so the check costs nothing.
- **Console window flicker on every cold start** (reported). The batch launcher
  used `ping` as its delay and `ping.exe` is a console program, so a cold start
  flashed 30–45 windows. The supervisor is one windowless process and its
  readiness wait is a socket connect.
- **A log-destroying bug in the supervisor**: `tasklist` text matching reported a
  live process as dead, so the supervisor exited immediately after starting the
  engine and left it unmanaged. Replaced with `OpenProcess` + `GetExitCodeProcess`.
  Likewise `netstat` parsing returned an empty set for a live listener, breaking
  adoption of an already-running engine; replaced with `GetExtendedTcpTable`.
- **Engine liveness was decided through a system proxy.** A proxy registered in
  the Windows registry answered `urlopen('http://127.0.0.1:9880/control')` with
  404 while nothing was listening on the port. Both the supervisor and the plugin
  now bypass proxies for loopback.
- **A growing reply replayed its opening sentences**, because the de-duplication
  mark treated a streamed reply as already spoken after its first fragment.
- **Toolchain fixes**: `catch` blocks that let a failed greeting render as a
  broken plugin; a `waitForEngine` call placed before its own declaration inside a
  temporal dead zone; and a `drain()` that referenced a loop-scoped binding from
  its `finally` block.

### Known limitations

- The Windows drive-letter scan for auto-discovery is read-only but touches every
  drive root; setting the checkout directory avoids it entirely.
- `3/4` is always read as a fraction. A genuine ratio cannot be told apart from a
  fraction, so write it out in the source text when the other reading is wanted.
- A different OS, DSH version or GPU is plausible but untested.

---

## [0.1.0] — 2026-10-02

First version. Per-reply read-aloud button, auto-read toggle, voice presets and a
settings page, driving a local GPT-SoVITS `api_v2.py`.
