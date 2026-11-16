/**
 * dsh-gpt-sovits — desktop tray extension (Electron main-process half).
 *
 * The tray menu is built inside the Electron main process, so the switch shipped in the
 * settings page cannot be reached from the plugin's host process. `lib/tray-patch.mjs`
 * patches `DesktopTray` in `app.asar/lib/main.js` to load this module and to splice
 * `items()` into the menu template; this file owns the state probe and the two actions.
 *
 * It is imported from the main process, so `electron` resolves here and nowhere else.
 *
 * @module dsh-gpt-sovits/tray-ext
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { nativeImage } from 'electron'

const API = '/gpt-sovits/api'
/** A start can take tens of seconds; the action row says so instead of lying. */
const ACTION_TIMEOUT_MS = 90000
/** The engine takes a moment to release its port; give the stop that long before re-probing. */
const ACTION_SETTLE_MS = 1500

/*
 * Failures in here are invisible: the menu just keeps saying "检测中…" and there is no
 * console anyone reads. One small log line per failure is the difference between "it is
 * broken" and a diagnosis, so it goes next to the plugin's other state.
 */
const DIAG = join(process.env.DSH_HOME?.trim() || join(homedir(), '.dsh'), 'gpt-sovits', 'tray-diag.log')

function diag(line) {
  try {
    mkdirSync(dirname(DIAG), { recursive: true })
    appendFileSync(DIAG, `${new Date().toISOString()} ${line}\n`, 'utf8')
  } catch {
    /* a diagnostic must never be the reason the menu breaks */
  }
}

/*
 * 16x16 status dots. The native Windows menu cannot colour text, so the colour lives in a
 * `MenuItem.icon` and the label stays readable in any theme.
 */
const DOTS = {
  green:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABpElEQVR42qWTv2vTYRCHn7s3SZNIWgW7CIJ27SDiJkgVuvgHBDqIdFIUZ0E6F0G3IhWdtKP9C4SiFGcRh2ZQECHg0iEYMLH5ft/7OESLP8C25Nmfu+PuPgaAMAwBnNm4cy4luyuxQNYpAJJ9MWM7Zz34fP3R+98dQxiIC09vVnqNqfuW/JYla8YoQwQAuOO1hLIGyvH4xHDv3tsbT0owEvPtRAdrqPsqtepLMSyqKnIGGWDjbpKKCEJTqVW/OMhxuffx2wYdLLHZ0dzVkw/TTHOp/DosDBzD9+UxhuEIxV5ZVmYaZ4/3PxzrXXv+0k4/uz1fdX+HcEKO/SH+ixBugRFFxHmvSCteq1YJcaD8a5YQXqtWK9KKY7YYo1I/xz4cho8dW6yY+ez+tjlCiQjMfNaZEJdiF3fB+JEOiXCXFLuOtOW1iiHiCHqMHW15abYao6LAbXyig2XhRoyKojRb9e7y+g5lXkutehKU/y0iJChTq54o81p3eX3HeNFO0GZusP06TTcu5f53kPJf3yhEYJbSdJ3cH7751Fy4AptMHCabNM4/AHl+7bfMGCdwAAAAAElFTkSuQmCC',
  red:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABdklEQVR42qWTsWqUURSEZ865+3MRLEJYZZU8gYXI1iJCMIVa7kOkVgRJHQTRJo3voGW0WAmIWC9ikScIGnRJFZDL7r1nLNxACGgWduoz35lihgAggAQEAD8fPLzN5M8g3qvQDQBI4A9Qn1Xby+sfP3w776EAAsBkOEwb/ZsvEm3bjVdKNDQJAOAksjla6HdVvDmafn8+nEwqAPDtaOQjAMen5dN61909mc0QUgNpXMAFCFIY6etdh5PZ7Mvgar7/DouDo61Hr67l/GRayhxkOjNe1AJU+zn3fpXyemP8/imPtx7fovErAKuS/ct8HpLIABAK3bEq7WT3Xo3AZWb8jcwagezeq9KOkdwsrQmkYVmRVloTyc1kZL9Jl7++kKJJMLJvWFEW0tRJaVGkZSRATiqkqUk6yO6EFEu/lSK7U9KBJXK3tDZPZlgmhQAlM5TW5onctcF4/3AesbfWdQ6p/g9yVqS1rvN5xN5gvH+4epVXHtOqc/4DBV/2Ym3arOIAAAAASUVORK5CYII=',
  grey:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABuUlEQVR42qWTMWuUQRCG35nNRsl+31WmEUFSpxALi2hhhPyFgxQ2NgeBYBFBIqlSBEVR8RACV1rqLxAOQfwBYpGvtRAtvKiE3MW72915LXIHB4JeuAemGXhmZpcZAQCAAggB4Glz/4rC3Sdw0yxfBABV902A94b8+N7djU+TjpAUAGi1WnO9Ph6K6oZzuhBjhJnhtIDCe4+c7YRm++E8HjQajQQArqqWHVBJ5+fJu4UQ1vv93z6llAHIKECSKSUj7VwIxfVub7D69cvnV7u7lbiqesNrK6tPirJcPz4+iiJQEdGxPEJOc+Rg0E9FWVv6fvgrvHh+5608evZy2Tv/kTQ1MxWRSfEvSFJVTUQt5nhVFbLjvfdmhv/J41HMDN57r5AdFchajEOOxp4KEdEYhxTI2pyoLI5/+wyImUFUFhUzojR2VJUAeAaPqkoaO0qw7f28kJz6HSTN+3kh2FYD92KMUVVBklPIVFXEGKOBe7q9tXmQc2qGUDiACfhXERJgCqFwOafm9tbmgavXX7sbK6F9+OPoVlHWlobDoZDMo52QicYmIlqWNdfrdj9cvnThNlDXmY9JZj3nP9T2B4rKP4JhAAAAAElFTkSuQmCC',
}

let tray = null
let relabel = null
/** Current application host origin, learned from the patched `relabel()`. */
let hostUrl = ''
/** `null` = not probed (or the probe failed), otherwise whether the engine answered. */
let running = null
/** `true` = waiting for the engine to come up, `false` = waiting for it to stop. */
let pending = null
/** When the pending expectation gives up (a start can take a while). */
let pendingUntil = 0
let icons = null
/** One line only: a menu that sits on "检测中…" should say why once, not every click. */
let emptyHostLogged = false
/**
 * `true` = the plugin's route answered 404, so the two rows must not be drawn.
 *
 * A 404 is not "unknown": the Host is reachable and has no such route, which means the
 * plugin was unloaded or uninstalled while this tray kept running. A network failure is
 * different and stays "unknown" — the Host may simply be restarting.
 */
let gone = false

function icon(name) {
  if (icons === null) {
    icons = {
      green: nativeImage.createFromDataURL(DOTS.green),
      red: nativeImage.createFromDataURL(DOTS.red),
      grey: nativeImage.createFromDataURL(DOTS.grey),
    }
  }
  return icons[name]
}

/**
 * The two rows the patched tray menu inserts between "open" and the separator.
 *
 * Called on every `relabel()`, which is also how the current `hostUrl` reaches this module.
 *
 * @param messages desktop locale messages (unused; kept for the patched call shape)
 * @param currentHostUrl the Host origin the main process is forwarding to
 */
export function items(messages, currentHostUrl) {
  if (typeof currentHostUrl === 'string' && currentHostUrl !== '') hostUrl = currentHostUrl
  /*
   * The plugin is no longer serving its route (disabled or uninstalled while this tray
   * kept running). A permanent "检测中…" row for a switch that cannot answer is worse
   * than showing the stock three-item menu, so the two rows step aside entirely.
   */
  if (gone) return []
  const busy = pending !== null && Date.now() < pendingUntil
  const state = running === null ? 'unknown' : running ? 'up' : 'down'
  const statusLabel = state === 'unknown' ? 'GPT-SoVITS检测中…' : state === 'up' ? 'GPT-SoVITS已启用' : 'GPT-SoVITS已停用'
  const statusIcon = state === 'unknown' ? 'grey' : state === 'up' ? 'green' : 'red'
  const actionLabel = busy
    ? pending === true
      ? '启动中…'
      : '停止中…'
    : running
      ? '停止'
      : '启动'
  return [
    /*
     * Clicking it forces a probe. The native menu closes on any click, so the fresh state is
     * seen the next time the menu opens — that is the chosen trade-off over polling.
     */
    { label: statusLabel, icon: icon(statusIcon), click: () => { void refresh(true) } },
    { label: actionLabel, enabled: !busy && running !== null, click: () => { void toggle() } },
  ]
}

/**
 * Wire the menu to a live tray; called once from the patched `DesktopTray` constructor.
 *
 * No timer: the status row probes on click and every action re-probes once it has settled.
 * The single probe below is the initial reading.
 */
export function install(trayInstance, relabelFn) {
  tray = trayInstance
  relabel = relabelFn
  // A fresh install means the plugin is loaded again; one probe decides whether the
  // route really is back (a profile can reload the plugin without restarting the app).
  gone = false
  void refresh(true)
}

/**
 * The Host URL is not an origin: the desktop app hands out `<origin>/?token=…`, so string
 * concatenation would append the route after the query and land on the app shell (that is
 * the HTML that broke JSON parsing). Only the origin is ours.
 */
function apiUrl(action) {
  try {
    return `${new URL(hostUrl).origin}${API}?action=${action}`
  } catch {
    return ''
  }
}

/** Origin only: the app's own URL carries an access token that must not reach a log file. */
function hostLabel() {
  try {
    return new URL(hostUrl).origin
  } catch {
    return hostUrl === '' ? '(empty)' : '(unparsable)'
  }
}

async function probe() {
  try {
    const url = apiUrl('health')
    if (url === '') throw new Error(`host url is not usable: ${hostUrl || '(empty)'}`)
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (response.status === 404) {
      /*
       * The Host answered but has no such route: the plugin is gone from this profile.
       * Hiding the rows beats a permanent "检测中…" for a switch that cannot work; a
       * reinstalled plugin restores them through `install()`.
       */
      if (!gone) diag(`plugin route missing (404) at ${hostLabel()}; hiding the tray rows`)
      const changed = !gone
      gone = true
      running = null
      pending = null
      return changed
    }
    const payload = await response.json()
    if (payload === null || payload.ok !== true) throw new Error(`health answered ok=${payload?.ok}`)
    const next = payload.running === true
    const changed = gone || running !== next
    gone = false
    running = next
    if (pending !== null && next === pending) pending = null
    return changed
  } catch (error) {
    /*
     * No answer is not "stopped": the Host may still be booting, or the engine may be
     * wedged. Showing grey "检测中…" is honest; a red row would be a guess.
     */
    diag(`probe failed host=${hostLabel()} err=${error instanceof Error ? error.message : String(error)}`)
    const changed = running !== null
    running = null
    return changed
  }
}

async function refresh(force) {
  /*
   * Before the Host origin is known there is nothing to probe: nudge `relabel()` instead,
   * which passes the main process's current `hostUrl` back through `items()`. That relay is
   * synchronous, so the probe can run in the same call — without this the first menu would
   * sit on "检测中…" until the user clicked it.
   */
  if (hostUrl === '') {
    relabel?.()
    if (hostUrl === '') {
      if (!emptyHostLogged) {
        emptyHostLogged = true
        diag('host origin is empty: the patched tray did not pass one')
      }
      return
    }
  }
  const changed = await probe()
  if (changed || force) relabel?.()
}

async function toggle() {
  if (pending !== null && Date.now() < pendingUntil) return
  if (running === null) return
  const start = !running
  const url = apiUrl(start ? 'ensure-engine' : 'stop-engine')
  if (url === '') return
  pending = start
  pendingUntil = Date.now() + ACTION_TIMEOUT_MS
  relabel?.()
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) diag(`action ${start ? 'start' : 'stop'} HTTP ${response.status}`)
  } catch (error) {
    /* the probe after the settle window corrects the row either way */
    diag(`action failed err=${error instanceof Error ? error.message : String(error)}`)
  }
  setTimeout(() => { void refresh(true) }, ACTION_SETTLE_MS)
}
