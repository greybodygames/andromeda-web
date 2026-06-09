import './style.css'

const identityAnchor = document.querySelector<HTMLElement>('[data-identity-anchor]')
const orbitCanvas = document.querySelector<HTMLCanvasElement>('[data-orbit-canvas]')
const starfieldCanvas = document.querySelector<HTMLCanvasElement>('[data-starfield-canvas]')
const connectorCanvas = document.querySelector<HTMLCanvasElement>('[data-technical-connectors]')
const annotationIndices = {
  about: document.querySelector<HTMLElement>('[data-connector-anchor="about"]'),
  work: document.querySelector<HTMLElement>('[data-connector-anchor="work"]'),
}
const copyrightAnchor = document.querySelector<HTMLElement>('[data-copyright-anchor]')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

type Star = {
  x: number
  y: number
  radius: number
  alpha: number
  depth: number
}

type OrbitRing = {
  inset: number
  alpha: number
  width: number
  dash?: number[]
}

type OrbitArc = {
  inset: number
  alpha: number
  width: number
  start: number
  length: number
  degreesPerSecond: number
  dash?: number[]
}

type OrbitPoint = {
  inset: number
  angle: number
  size: number
  alpha: number
  degreesPerSecond: number
}

const createSeededRandom = (seed: number) => {
  let value = seed

  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0

    let result = Math.imul(value ^ (value >>> 15), 1 | value)
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result

    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

const createStarfield = (count: number) => {
  const random = createSeededRandom(0x9e3779b9)

  return Array.from({ length: count }, (): Star => {
    const depth = 0.28 + random() * 0.9
    const brightness = random()

    return {
      x: random(),
      y: random(),
      radius: 0.45 + random() * random() * 1.45,
      alpha: 0.18 + brightness * brightness * 0.62,
      depth,
    }
  })
}

const stars = createStarfield(210)
let starfieldParallaxX = 0
let starfieldParallaxY = 0

const orbitRings: OrbitRing[] = [
  { inset: 0, alpha: 0.16, width: 1 },
  { inset: 8, alpha: 0.2, width: 1, dash: [7, 8] },
  { inset: 15, alpha: 0.28, width: 0.75 },
  { inset: 22, alpha: 0.34, width: 0.85 },
  { inset: 29, alpha: 0.42, width: 1.2 },
]

const orbitArcs: OrbitArc[] = [
  { inset: 4, alpha: 0.56, width: 1.15, start: 252, length: 168, degreesPerSecond: -5.5 },
  { inset: 12, alpha: 0.62, width: 1.15, start: 292, length: 156, degreesPerSecond: -7.25 },
  { inset: 19, alpha: 0.44, width: 1, start: 34, length: 136, degreesPerSecond: -4.25 },
  { inset: 26, alpha: 0.5, width: 1, start: 118, length: 146, degreesPerSecond: -8.5, dash: [5, 6] },
]

const orbitPoints: OrbitPoint[] = [
  { inset: 0, angle: 312, size: 7, alpha: 0.74, degreesPerSecond: 9.5 },
  { inset: 8, angle: 132, size: 7, alpha: 0.86, degreesPerSecond: 12.5 },
  { inset: 15, angle: 246, size: 8, alpha: 0.78, degreesPerSecond: 7.75 },
  { inset: 22, angle: 34, size: 6, alpha: 0.7, degreesPerSecond: 14 },
  { inset: 29, angle: 78, size: 7, alpha: 0.76, degreesPerSecond: 10.75 },
]

type DeviceOrientationPermissionState = 'granted' | 'denied' | 'prompt'

type DeviceOrientationEventConstructorWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<DeviceOrientationPermissionState>
}

type OrientationBaseline = {
  beta: number
  gamma: number
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180
const radiusFromInset = (size: number, inset: number) => (size * (1 - inset / 50)) / 2
const wrapCoordinate = (value: number, size: number) => ((value % size) + size) % size
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
const identityConnectorRadiusScale = 0.44
const connectorEndpointRadius = 4.5
const connectorRandom = createSeededRandom(0x6a09e667)
const elementCircle = (element: Element, containerRect: DOMRect) => {
  const rect = element.getBoundingClientRect()

  return {
    radius: Math.min(rect.width, rect.height) / 2,
    x: rect.left + rect.width / 2 - containerRect.left,
    y: rect.top + rect.height / 2 - containerRect.top,
  }
}

const pointOnCircleEdge = (from: ReturnType<typeof elementCircle>, to: { x: number; y: number }) => {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)

  if (distance === 0) {
    return from
  }

  return {
    x: from.x + (dx / distance) * from.radius,
    y: from.y + (dy / distance) * from.radius,
  }
}

const createIdentityConnectorPosition = () => {
  const angle = connectorRandom() * Math.PI * 2
  const radius = Math.sqrt(connectorRandom()) * 0.96

  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

const createIdentityConnectorState = (initialAngle: number) => {
  const position = {
    x: Math.cos(toRadians(initialAngle)) * 0.92,
    y: Math.sin(toRadians(initialAngle)) * 0.92,
  }

  return {
    current: { ...position },
    from: { ...position },
    target: createIdentityConnectorPosition(),
    moveStartedAt: 0,
    moveDuration: 700,
    nextMoveAt: 1000 + connectorRandom() * 1000,
  }
}

const connectorStates = {
  about: createIdentityConnectorState(30),
  copyright: createIdentityConnectorState(180),
  work: createIdentityConnectorState(-30),
}

const easeConnectorMotion = (value: number) => 1 - (1 - value) ** 3

const updateConnectorState = (state: (typeof connectorStates)[keyof typeof connectorStates], timestamp: number) => {
  if (timestamp >= state.nextMoveAt) {
    state.from = { ...state.current }
    state.target = createIdentityConnectorPosition()
    state.moveStartedAt = timestamp
    state.moveDuration = 420 + connectorRandom() * 360
    state.nextMoveAt = timestamp + state.moveDuration + 1000 + connectorRandom() * 1000
  }

  const progress = Math.min((timestamp - state.moveStartedAt) / state.moveDuration, 1)
  const easedProgress = easeConnectorMotion(progress)

  state.current.x = state.from.x + (state.target.x - state.from.x) * easedProgress
  state.current.y = state.from.y + (state.target.y - state.from.y) * easedProgress
}

const pointInCircle = (circle: ReturnType<typeof elementCircle>, position: { x: number; y: number }) => ({
  x: circle.x + position.x * circle.radius,
  y: circle.y + position.y * circle.radius,
})

const drawTechnicalConnectors = (timestamp = performance.now()) => {
  if (!connectorCanvas || !identityAnchor) {
    return
  }

  const rect = connectorCanvas.getBoundingClientRect()

  if (rect.width <= 0 || rect.height <= 0) {
    return
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const targetWidth = Math.round(rect.width * pixelRatio)
  const targetHeight = Math.round(rect.height * pixelRatio)

  if (connectorCanvas.width !== targetWidth || connectorCanvas.height !== targetHeight) {
    connectorCanvas.width = targetWidth
    connectorCanvas.height = targetHeight
  }

  const context = connectorCanvas.getContext('2d')

  if (!context) {
    return
  }

  const identityCircle = elementCircle(identityAnchor, rect)
  identityCircle.radius *= identityConnectorRadiusScale

  if (!reduceMotion.matches) {
    Object.values(connectorStates).forEach((state) => updateConnectorState(state, timestamp))
  }

  const connectors = [
    { anchor: annotationIndices.work, position: connectorStates.work.current },
    { anchor: annotationIndices.about, position: connectorStates.about.current },
    { anchor: copyrightAnchor, position: connectorStates.copyright.current },
  ]

  context.clearRect(0, 0, connectorCanvas.width, connectorCanvas.height)
  context.save()
  context.scale(pixelRatio, pixelRatio)
  context.lineWidth = 1
  context.strokeStyle = 'rgba(255, 255, 255, 0.46)'

  connectors.forEach(({ anchor, position }) => {
    if (!anchor) {
      return
    }

    const identityEdge = pointInCircle(identityCircle, position)
    const anchorCircle = elementCircle(anchor, rect)
    const anchorEdge = pointOnCircleEdge(anchorCircle, identityEdge)
    const connectorEnd = pointOnCircleEdge({ ...identityEdge, radius: connectorEndpointRadius }, anchorEdge)

    context.beginPath()
    context.moveTo(anchorEdge.x, anchorEdge.y)
    context.lineTo(connectorEnd.x, connectorEnd.y)
    context.stroke()

    context.beginPath()
    context.arc(identityEdge.x, identityEdge.y, connectorEndpointRadius, 0, Math.PI * 2)
    context.stroke()
  })

  context.restore()
}

let connectorAnimationFrame: number | null = null

const renderTechnicalConnectors = (timestamp: number) => {
  drawTechnicalConnectors(timestamp)

  if (!reduceMotion.matches) {
    connectorAnimationFrame = window.requestAnimationFrame(renderTechnicalConnectors)
  }
}

const startTechnicalConnectors = () => {
  if (connectorAnimationFrame !== null) {
    window.cancelAnimationFrame(connectorAnimationFrame)
    connectorAnimationFrame = null
  }

  drawTechnicalConnectors()

  if (!reduceMotion.matches) {
    connectorAnimationFrame = window.requestAnimationFrame(renderTechnicalConnectors)
  }
}

const drawStarfieldCanvas = () => {
  if (!starfieldCanvas) {
    return
  }

  const rect = starfieldCanvas.getBoundingClientRect()
  const width = rect.width
  const height = rect.height

  if (width <= 0 || height <= 0) {
    return
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const targetWidth = Math.round(width * pixelRatio)
  const targetHeight = Math.round(height * pixelRatio)

  if (starfieldCanvas.width !== targetWidth || starfieldCanvas.height !== targetHeight) {
    starfieldCanvas.width = targetWidth
    starfieldCanvas.height = targetHeight
  }

  const context = starfieldCanvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, starfieldCanvas.width, starfieldCanvas.height)
  context.save()
  context.scale(pixelRatio, pixelRatio)

  stars.forEach((star) => {
    const x = wrapCoordinate(star.x * width + starfieldParallaxX * star.depth, width)
    const y = wrapCoordinate(star.y * height + starfieldParallaxY * star.depth, height)

    context.beginPath()
    context.fillStyle = `rgba(255, 255, 255, ${star.alpha})`
    context.arc(x, y, star.radius, 0, Math.PI * 2)
    context.fill()
  })

  context.restore()
}

const drawOrbitCanvas = (elapsedSeconds = 0) => {
  if (!orbitCanvas) {
    return
  }

  const rect = orbitCanvas.getBoundingClientRect()
  const size = Math.min(rect.width, rect.height)

  if (size <= 0) {
    return
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const targetSize = Math.round(size * pixelRatio)

  if (orbitCanvas.width !== targetSize || orbitCanvas.height !== targetSize) {
    orbitCanvas.width = targetSize
    orbitCanvas.height = targetSize
  }

  const context = orbitCanvas.getContext('2d')

  if (!context) {
    return
  }

  context.clearRect(0, 0, orbitCanvas.width, orbitCanvas.height)
  context.save()
  context.scale(pixelRatio, pixelRatio)
  context.translate(size / 2, size / 2)
  context.lineCap = 'round'
  context.lineJoin = 'round'

  orbitRings.forEach((ring) => {
    context.beginPath()
    context.setLineDash(ring.dash ?? [])
    context.strokeStyle = `rgba(255, 255, 255, ${ring.alpha})`
    context.lineWidth = ring.width
    context.arc(0, 0, radiusFromInset(size, ring.inset), 0, Math.PI * 2)
    context.stroke()
  })

  orbitArcs.forEach((arc) => {
    const radius = radiusFromInset(size, arc.inset)
    const angleOffset = reduceMotion.matches ? 0 : elapsedSeconds * arc.degreesPerSecond
    const start = toRadians(arc.start + angleOffset)
    const end = toRadians(arc.start + arc.length + angleOffset)

    context.beginPath()
    context.setLineDash(arc.dash ?? [])
    context.strokeStyle = `rgba(255, 255, 255, ${arc.alpha})`
    context.lineWidth = arc.width
    context.arc(0, 0, radius, start, end)
    context.stroke()
  })

  context.setLineDash([])

  orbitPoints.forEach((point) => {
    const radius = radiusFromInset(size, point.inset)
    const angleOffset = reduceMotion.matches ? 0 : elapsedSeconds * point.degreesPerSecond
    const angle = toRadians(point.angle + angleOffset - 90)
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    const dotRadius = point.size / 2

    context.beginPath()
    context.fillStyle = `rgba(255, 255, 255, ${point.alpha})`
    context.arc(x, y, dotRadius, 0, Math.PI * 2)
    context.fill()
  })

  context.restore()
}

let orbitAnimationFrame: number | null = null
let orbitAnimationStartedAt = 0

const stopOrbitAnimation = () => {
  if (orbitAnimationFrame === null) {
    return
  }

  window.cancelAnimationFrame(orbitAnimationFrame)
  orbitAnimationFrame = null
}

const renderOrbitAnimation = (timestamp: number) => {
  drawOrbitCanvas((timestamp - orbitAnimationStartedAt) / 1000)

  if (!reduceMotion.matches) {
    orbitAnimationFrame = window.requestAnimationFrame(renderOrbitAnimation)
  }
}

const startOrbitAnimation = () => {
  stopOrbitAnimation()

  if (reduceMotion.matches) {
    drawOrbitCanvas()
    return
  }

  orbitAnimationStartedAt = performance.now()
  orbitAnimationFrame = window.requestAnimationFrame(renderOrbitAnimation)
}

window.addEventListener('resize', () => {
  drawOrbitCanvas()
  drawStarfieldCanvas()
  drawTechnicalConnectors()
})
window.addEventListener('load', () => {
  drawStarfieldCanvas()
  startOrbitAnimation()
  drawTechnicalConnectors()
})
document.fonts.ready.then(() => drawTechnicalConnectors())

if (starfieldCanvas) {
  const starfieldCanvasObserver = new ResizeObserver(drawStarfieldCanvas)
  starfieldCanvasObserver.observe(starfieldCanvas)
  drawStarfieldCanvas()
}

if (connectorCanvas) {
  const connectorCanvasObserver = new ResizeObserver(() => drawTechnicalConnectors())
  connectorCanvasObserver.observe(connectorCanvas)
  startTechnicalConnectors()
}

if (orbitCanvas) {
  const orbitCanvasObserver = new ResizeObserver(() => drawOrbitCanvas())
  orbitCanvasObserver.observe(orbitCanvas)
  startOrbitAnimation()
}

reduceMotion.addEventListener('change', () => {
  startOrbitAnimation()
  startTechnicalConnectors()
})

if (!reduceMotion.matches) {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
  const coarsePointer = window.matchMedia('(pointer: coarse)')
  let orientationBaseline: OrientationBaseline | null = null
  let orientationActive = false
  let orientationPermissionRequested = false

  const setParallaxTargets = (x: number, y: number) => {
    const normalizedX = clamp(x, -0.5, 0.5)
    const normalizedY = clamp(y, -0.5, 0.5)

    starfieldParallaxX = normalizedX * -28
    starfieldParallaxY = normalizedY * -18
    drawStarfieldCanvas()
  }

  const setPointerTargets = (event: PointerEvent) => {
    if (!finePointer.matches || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) {
      return
    }

    setParallaxTargets(event.clientX / window.innerWidth - 0.5, event.clientY / window.innerHeight - 0.5)
  }

  const resetTargets = () => {
    starfieldParallaxX = 0
    starfieldParallaxY = 0
    drawStarfieldCanvas()
  }

  const getScreenOrientationAngle = () =>
    screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0

  const getDeviceOrientationEvent = () =>
    window.DeviceOrientationEvent as DeviceOrientationEventConstructorWithPermission | undefined

  const setOrientationTargets = (event: DeviceOrientationEvent) => {
    if (!coarsePointer.matches || event.beta === null || event.gamma === null) {
      return
    }

    orientationBaseline ??= {
      beta: event.beta,
      gamma: event.gamma,
    }

    const deltaBeta = event.beta - orientationBaseline.beta
    const deltaGamma = event.gamma - orientationBaseline.gamma
    const screenAngle = ((getScreenOrientationAngle() % 360) + 360) % 360
    let tiltX = deltaGamma
    let tiltY = deltaBeta

    if (screenAngle === 90) {
      tiltX = deltaBeta
      tiltY = -deltaGamma
    } else if (screenAngle === 270) {
      tiltX = -deltaBeta
      tiltY = deltaGamma
    } else if (screenAngle === 180) {
      tiltX = -deltaGamma
      tiltY = -deltaBeta
    }

    const maxTilt = 32

    setParallaxTargets(tiltX / maxTilt, tiltY / maxTilt)
  }

  const startOrientationParallax = () => {
    if (orientationActive || !coarsePointer.matches || !getDeviceOrientationEvent()) {
      return
    }

    orientationBaseline = null
    orientationActive = true
    window.addEventListener('deviceorientation', setOrientationTargets, { passive: true })
  }

  const stopOrientationParallax = () => {
    if (!orientationActive) {
      return
    }

    window.removeEventListener('deviceorientation', setOrientationTargets)
    orientationActive = false
    orientationBaseline = null
  }

  const requestOrientationParallax = async () => {
    if (orientationPermissionRequested || orientationActive || !coarsePointer.matches) {
      return
    }

    orientationPermissionRequested = true

    const orientationEvent = getDeviceOrientationEvent()

    if (!orientationEvent) {
      return
    }

    if (typeof orientationEvent.requestPermission !== 'function') {
      startOrientationParallax()
      return
    }

    try {
      const permission = await orientationEvent.requestPermission()

      if (permission === 'granted') {
        startOrientationParallax()
      } else {
        resetTargets()
      }
    } catch {
      resetTargets()
    }
  }

  const requestOrientationParallaxFromGesture = () => {
    void requestOrientationParallax()
  }

  const resetOrientationBaseline = () => {
    orientationBaseline = null
  }

  if (finePointer.matches) {
    window.addEventListener('pointermove', setPointerTargets, { passive: true })
  }

  if (coarsePointer.matches) {
    const orientationEvent = getDeviceOrientationEvent()

    if (orientationEvent && typeof orientationEvent.requestPermission === 'function') {
      window.addEventListener('pointerdown', requestOrientationParallaxFromGesture, { once: true, passive: true })
      window.addEventListener('touchend', requestOrientationParallaxFromGesture, { once: true, passive: true })
    } else {
      startOrientationParallax()
    }
  }

  window.addEventListener('pointerleave', resetTargets)
  window.addEventListener('orientationchange', resetOrientationBaseline)
  screen.orientation?.addEventListener('change', resetOrientationBaseline)

  reduceMotion.addEventListener('change', () => {
    window.removeEventListener('pointermove', setPointerTargets)
    window.removeEventListener('pointerleave', resetTargets)
    window.removeEventListener('pointerdown', requestOrientationParallaxFromGesture)
    window.removeEventListener('touchend', requestOrientationParallaxFromGesture)
    window.removeEventListener('orientationchange', resetOrientationBaseline)
    screen.orientation?.removeEventListener('change', resetOrientationBaseline)
    stopOrientationParallax()
    resetTargets()
  })
}
