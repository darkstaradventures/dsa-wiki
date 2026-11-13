// Dark Star Adventurecast wiki additions (2026-11-13).
//
// 1. Graph view: the graph plugin keeps every label invisible until the reader scrolls on the
//    graph. We nudge it once after it loads so labels are visible straight away.
// 2. Sector map: any <div class="dsa-map-viewer"><img src="...svg"></div> becomes an inline
//    zoomable, pannable map (wheel / pinch / drag / buttons / keyboard / fullscreen).
//
// NOTE: the inline-script bundler strips the first occurrence of the word that starts with
// "ex" and ends in "port" from this file, so never write it here, even in a comment.

// ---------------------------------------------------------------------------------------------
// 1. Graph labels
// ---------------------------------------------------------------------------------------------

function showGraphLabels() {
  const canvases = document.querySelectorAll<HTMLCanvasElement>(
    ".graph-container canvas, .global-graph-container canvas",
  )
  canvases.forEach((canvas) => {
    if (canvas.dataset.dsaLabels) return
    canvas.dataset.dsaLabels = "1"
    // d3-zoom listens for wheel events on the canvas. A tiny zoom-in (0.14%) makes the plugin run
    // its label-opacity pass. Fired a few times because the zoom handler attaches after the data loads.
    const nudge = () => {
      const r = canvas.getBoundingClientRect()
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: -1,
          clientX: r.left + r.width / 2,
          clientY: r.top + r.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      )
    }
    for (const ms of [400, 1000, 2000, 4000]) window.setTimeout(nudge, ms)
  })
}

function watchGraphs() {
  showGraphLabels()
  if ((window as any).dsaGraphObserver) return
  let pending = 0
  const observer = new MutationObserver(() => {
    window.clearTimeout(pending)
    pending = window.setTimeout(showGraphLabels, 120)
  })
  observer.observe(document.body, { childList: true, subtree: true })
  ;(window as any).dsaGraphObserver = observer
}

// ---------------------------------------------------------------------------------------------
// 2. Zoomable, pannable map
// ---------------------------------------------------------------------------------------------

const MIN_ZOOM = 1
const MAX_ZOOM = 16

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  if (text) node.textContent = text
  return node
}

async function buildMapViewer(host: HTMLElement) {
  const img = host.querySelector("img")
  const url = host.dataset.src || img?.src
  if (!url) return

  let svg: SVGSVGElement
  try {
    const res = await fetch(url)
    const doc = new DOMParser().parseFromString(await res.text(), "image/svg+xml")
    if (doc.documentElement.nodeName.toLowerCase() !== "svg") return
    svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement
  } catch {
    return // leave the plain <img> in place
  }

  const vbAttr = (svg.getAttribute("viewBox") || "0 0 1000 1000").split(/[\s,]+/).map(Number)
  const W = vbAttr[2]
  const H = vbAttr[3]
  svg.removeAttribute("width")
  svg.removeAttribute("height")
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
  svg.setAttribute("role", "img")
  svg.setAttribute("aria-label", img?.alt || "Map")
  svg.classList.add("dsa-map-svg")

  const stage = el("div", {
    class: "dsa-map-stage",
    tabindex: "0",
    "aria-label": "Map. Use plus and minus to zoom, arrow keys to pan, zero to reset.",
  })
  stage.appendChild(svg)

  const controls = el("div", { class: "dsa-map-controls" })
  const mkBtn = (act: string, label: string, glyph: string) => {
    const b = el("button", { type: "button", "data-act": act, "aria-label": label, title: label }, glyph)
    controls.appendChild(b)
    return b
  }
  mkBtn("in", "Zoom in", "+")
  mkBtn("out", "Zoom out", "−")
  mkBtn("reset", "Reset view", "↺")
  const fullBtn = host.requestFullscreen ? mkBtn("full", "Full screen", "⛶") : null

  host.replaceChildren(stage, controls)
  host.classList.add("dsa-map-ready")

  // View state: centre of the visible area in map units, and zoom relative to "whole map fits".
  let cx = W / 2
  let cy = H / 2
  let zoom = 1

  const size = () => {
    const r = stage.getBoundingClientRect()
    return { w: Math.max(r.width, 1), h: Math.max(r.height, 1), left: r.left, top: r.top }
  }
  const fitScale = () => {
    const s = size()
    return Math.min(s.w / W, s.h / H) // pixels per map unit when the whole map fits
  }
  const clamp = () => {
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
    const s = size()
    const k = fitScale() * zoom
    const vw = s.w / k
    const vh = s.h / k
    cx = vw >= W ? W / 2 : Math.min(W - vw / 2, Math.max(vw / 2, cx))
    cy = vh >= H ? H / 2 : Math.min(H - vh / 2, Math.max(vh / 2, cy))
  }
  const apply = () => {
    clamp()
    const s = size()
    const k = fitScale() * zoom
    const vw = s.w / k
    const vh = s.h / k
    svg.setAttribute("viewBox", `${cx - vw / 2} ${cy - vh / 2} ${vw} ${vh}`)
    host.classList.toggle("is-zoomed", zoom > 1.001)
  }
  const zoomAt = (factor: number, clientX: number, clientY: number) => {
    const s = size()
    const k0 = fitScale() * zoom
    const fx = (clientX - s.left) / s.w - 0.5
    const fy = (clientY - s.top) / s.h - 0.5
    const ux = cx + (fx * s.w) / k0 // map point under the cursor
    const uy = cy + (fy * s.h) / k0
    zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor))
    const k1 = fitScale() * zoom
    cx = ux - (fx * s.w) / k1
    cy = uy - (fy * s.h) / k1
    apply()
  }
  const zoomCentre = (factor: number) => {
    const s = size()
    zoomAt(factor, s.left + s.w / 2, s.top + s.h / 2)
  }
  const panPixels = (dx: number, dy: number) => {
    const k = fitScale() * zoom
    cx -= dx / k
    cy -= dy / k
    apply()
  }
  const reset = () => {
    cx = W / 2
    cy = H / 2
    zoom = 1
    apply()
  }

  // Mouse wheel / trackpad pinch
  stage.addEventListener(
    "wheel",
    (e) => {
      // Fully zoomed out and scrolling down: let the page scroll instead of trapping it.
      if (zoom <= MIN_ZOOM + 0.001 && e.deltaY > 0) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : e.ctrlKey ? 0.01 : 0.0018
      zoomAt(Math.exp(-e.deltaY * unit), e.clientX, e.clientY)
    },
    { passive: false },
  )

  // Drag to pan, two fingers to pinch
  const pointers = new Map<number, { x: number; y: number }>()
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    host.classList.add("is-dragging")
  })
  stage.addEventListener("pointermove", (e) => {
    const prev = pointers.get(e.pointerId)
    if (!prev) return
    if (pointers.size === 1) {
      panPixels(e.clientX - prev.x, e.clientY - prev.y)
    } else if (pointers.size === 2) {
      const others = [...pointers.entries()].filter(([id]) => id !== e.pointerId)
      const o = others[0][1]
      const oldMid = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 }
      const newMid = { x: (e.clientX + o.x) / 2, y: (e.clientY + o.y) / 2 }
      const oldDist = Math.hypot(prev.x - o.x, prev.y - o.y)
      const newDist = Math.hypot(e.clientX - o.x, e.clientY - o.y)
      panPixels(newMid.x - oldMid.x, newMid.y - oldMid.y)
      if (oldDist > 0) zoomAt(newDist / oldDist, newMid.x, newMid.y)
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  })
  const endPointer = (e: PointerEvent) => {
    pointers.delete(e.pointerId)
    if (pointers.size === 0) host.classList.remove("is-dragging")
  }
  stage.addEventListener("pointerup", endPointer)
  stage.addEventListener("pointercancel", endPointer)
  stage.addEventListener("dblclick", (e) => zoomAt(2, e.clientX, e.clientY))

  // Keyboard
  stage.addEventListener("keydown", (e) => {
    const step = 60
    switch (e.key) {
      case "+":
      case "=":
        zoomCentre(1.5)
        break
      case "-":
      case "_":
        zoomCentre(1 / 1.5)
        break
      case "0":
        reset()
        break
      case "ArrowLeft":
        panPixels(step, 0)
        break
      case "ArrowRight":
        panPixels(-step, 0)
        break
      case "ArrowUp":
        panPixels(0, step)
        break
      case "ArrowDown":
        panPixels(0, -step)
        break
      default:
        return
    }
    e.preventDefault()
  })

  // Buttons
  controls.addEventListener("click", (e) => {
    const act = (e.target as HTMLElement).closest("button")?.dataset.act
    if (act === "in") zoomCentre(1.6)
    else if (act === "out") zoomCentre(1 / 1.6)
    else if (act === "reset") reset()
    else if (act === "full") {
      if (document.fullscreenElement === host) document.exitFullscreen()
      else host.requestFullscreen()
    }
  })
  controls.addEventListener("pointerdown", (e) => e.stopPropagation())
  controls.addEventListener("dblclick", (e) => e.stopPropagation())

  const onFullscreen = () => {
    if (fullBtn) fullBtn.textContent = document.fullscreenElement === host ? "✕" : "⛶"
    apply()
  }
  document.addEventListener("fullscreenchange", onFullscreen)

  // Keep the view valid when the column or window resizes
  const ro = new ResizeObserver(() => apply())
  ro.observe(stage)
  window.addCleanup(() => {
    ro.disconnect()
    document.removeEventListener("fullscreenchange", onFullscreen)
  })

  apply()
}

function setupMapViewers() {
  document.querySelectorAll<HTMLElement>(".dsa-map-viewer").forEach((host) => {
    if (host.dataset.dsaReady) return
    host.dataset.dsaReady = "1"
    buildMapViewer(host)
  })
}

function setupAll() {
  setupMapViewers()
  watchGraphs()
}

document.addEventListener("nav", setupAll)
document.addEventListener("render", setupAll)
