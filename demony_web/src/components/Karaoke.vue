<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import songData from '../assets/songs/demonyTDD/lyrics.json'

interface LyricLine {
  time: number
  text: string
}

// --- Метаданные ---
const metadata = songData
const lyrics = ref<LyricLine[]>(metadata.lyrics)
const audio = ref<HTMLAudioElement | null>(null)
const audioFile = new URL(`../assets/songs/demonyTDD/${metadata.file.audio}`, import.meta.url).href
const coverFile = new URL(`../assets/songs/demonyTDD/${metadata.file.cover}`, import.meta.url).href
const coverOpacity = ref(1)

// --- Состояние ---
const currentTime = ref(0)
const isPlaying = ref(false)
const duration = ref(0)
const demonMode = ref(false)
const isFullscreen = ref(false)


function toggleFullscreen() {
  const elem = document.documentElement
  if (!document.fullscreenElement) {
    elem.requestFullscreen().then(() => (isFullscreen.value = true))
  } else {
    document.exitFullscreen().then(() => (isFullscreen.value = false))
  }
}

document.addEventListener('fullscreenchange', () => {
  isFullscreen.value = !!document.fullscreenElement
})

// canvas refs
const canvasRef = ref<HTMLCanvasElement | null>(null)
let canvasCtx: CanvasRenderingContext2D | null = null

// Web Audio API
let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let dataArray: Uint8Array | null = null
let bufferLength = 0
let rafId = 0
let lastDemonTime = -Infinity

const currentLineIndex = computed(() => {
  for (let i = lyrics.value.length - 1; i >= 0; i--) {
    if (currentTime.value >= lyrics.value[i].time) {
      return i
    }
  }
  return -1
})

const nextLineIndex = computed(() => {
  return currentLineIndex.value + 1 < lyrics.value.length ? currentLineIndex.value + 1 : -1
})

const formatTime = (input: any): string => {
  const seconds = Number(input) || 0
  const total = Math.round(seconds)
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}



const formattedCurrent = computed<string>(() => formatTime(currentTime.value))
const formattedDuration = computed<string>(() => formatTime(duration.value))

async function initAudioContext() {
  if (!audio.value) return
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }

  if (!analyser) {
    try {
      const src = audioCtx.createMediaElementSource(audio.value)
      analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      bufferLength = analyser.frequencyBinCount
      dataArray = new Uint8Array(bufferLength)
      src.connect(analyser)
      analyser.connect(audioCtx.destination)
    } catch (e) {
      // creating multiple media element sources for the same element throws - ignore
      console.warn('Audio source init warning', e)
    }
  }
}

function containsDemon(text: string) {
  return /демон/i.test(text)
}

const togglePlayPause = async () => {
  if (!audio.value) return
  if (!audioCtx) await initAudioContext()
  if (isPlaying.value) {
    audio.value.pause()
  } else {
    try { await audioCtx?.resume() } catch (e) { /* ignore */ }
    await audio.value.play()
  }
  isPlaying.value = !isPlaying.value
}

const seek = (event: Event) => {
  if (!audio.value) return
  const target = event.target as HTMLInputElement
  audio.value.currentTime = parseFloat(target.value)
}

const restart = async () => {
  if (!audio.value) return
  audio.value.currentTime = 0
  if (!isPlaying.value) {
    if (!audioCtx) await initAudioContext()
    try { await audioCtx?.resume() } catch (e) { /* ignore */ }
    audio.value.play()
    isPlaying.value = true
  }
}

// canvas helpers
function resizeCanvas() {
  if (!canvasRef.value) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvasRef.value.getBoundingClientRect()
  canvasRef.value.width = Math.max(1, rect.width * dpr)
  canvasRef.value.height = Math.max(1, rect.height * dpr)
  canvasRef.value.style.width = `${rect.width}px`
  canvasRef.value.style.height = `${rect.height}px`
  if (canvasCtx) canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function draw() {
  // === BACKGROUND (обложка с блюром и фильтрами) ===
  if (coverFile) {
    const img = new Image()
    img.src = coverFile

    img.onload = () => {
      const alphaTarget = demonMode.value || (currentTime.value - lastDemonTime < 1.3) ? 0 : 1
      coverOpacity.value += (alphaTarget - coverOpacity.value) * 0.1

      canvasCtx.save()
      canvasCtx.globalAlpha = coverOpacity.value
      canvasCtx.filter = 'blur(60px) saturate(150%) brightness(0.25) drop-shadow(0 0 40px #ff0011)'
      canvasCtx.drawImage(img, 0, 0, lw, lh)
      canvasCtx.restore()
    }
  }

  rafId = requestAnimationFrame(draw)
  if (!canvasRef.value || !canvasCtx) return

  const dpr = window.devicePixelRatio || 1
  const lw = canvasRef.value.width / dpr
  const lh = canvasRef.value.height / dpr
  canvasCtx.clearRect(0, 0, lw, lh)

  // === DEMON DETECTION ===
  const currentIndex = currentLineIndex.value
  const nextIndex = nextLineIndex.value
  if (currentIndex >= 0) {
    const cand = lyrics.value[currentIndex].text
    if (containsDemon(cand)) lastDemonTime = currentTime.value
  }
  const demonActive = demonMode.value || (currentTime.value - lastDemonTime < 1.3)

  // === VISUALIZER ===
  if (analyser && dataArray) {
    analyser.getByteFrequencyData(dataArray)
    const barCount = demonActive ? 90 : 60
    const slice = Math.max(1, Math.floor(bufferLength / barCount))
    const barWidth = lw / barCount

    for (let i = 0; i < barCount; i++) {
      let sum = 0
      for (let j = 0; j < slice; j++) sum += dataArray[Math.min(i * slice + j, bufferLength - 1)]
      const v = sum / slice
      const h = (v / 255) * (lh * (demonActive ? 0.5 : 0.3))
      const grad = canvasCtx.createLinearGradient(0, lh, 0, lh - h)
      grad.addColorStop(0, demonActive ? '#ff0044' : '#330000')
      grad.addColorStop(0.5, demonActive ? '#ff3388' : '#550000')
      grad.addColorStop(1, demonActive ? '#ff99bb' : '#770000')
      canvasCtx.fillStyle = grad
      const x = i * barWidth
      canvasCtx.fillRect(x, lh - h, barWidth - 1, h)
    }
  }

  // === TEXT DRAW ===
  const now = performance.now()
  if (!window._lineTrans)
    window._lineTrans = { index: -1, start: now, alpha: 0, scale: 0.9 }
  const lt = window._lineTrans

  if (currentIndex !== lt.index) {
    lt.index = currentIndex
    lt.start = now
    lt.alpha = 0
    lt.scale = 0.9
  }

  const progress = Math.min(1, (now - lt.start) / 600)
  lt.alpha = 0.8 + 0.2 * progress
  lt.scale = 0.9 + 0.1 * progress

  // helper inside draw
  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const words = text.split(' ')
    const lines: string[] = []
    let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line)
        line = word
      } else line = test
    }
    if (line) lines.push(line)
    return lines
  }

  // === CURRENT LINE ===
  const baseFont = Math.max(24, Math.min(60, Math.floor(lw / 18)))
  const line = currentIndex >= 0 ? lyrics.value[currentIndex].text : 'Приготовьтесь...'
  const nextText = nextIndex >= 0 ? lyrics.value[nextIndex].text : ''
  const isDemonLine = containsDemon(line) || demonActive

  const maxTextWidth = lw * 0.9
  const textY = lh * 0.45
  canvasCtx.textAlign = 'center'
  canvasCtx.textBaseline = 'middle'

  canvasCtx.save()
  canvasCtx.translate(lw / 2, textY)
  canvasCtx.scale(lt.scale, lt.scale)
  canvasCtx.globalAlpha = lt.alpha

  if (isDemonLine) {
    for (let k = 0; k < 3; k++) {
      const offsetX = (Math.random() - 0.5) * 10
      const offsetY = (Math.random() - 0.5) * 4
      canvasCtx.save()
      canvasCtx.translate(offsetX, offsetY)
      canvasCtx.font = `${baseFont + Math.random() * 6}px system-ui`
      if (k === 0) canvasCtx.fillStyle = 'rgba(255,0,80,0.8)'
      else if (k === 1) canvasCtx.fillStyle = 'rgba(80,0,200,0.8)'
      else canvasCtx.fillStyle = 'rgba(255,255,255,0.95)'
      const lines = wrapText(canvasCtx, line, maxTextWidth)
      const startY = -((lines.length - 1) * (baseFont * 0.9)) / 2
      for (let i = 0; i < lines.length; i++) {
        canvasCtx.fillText(lines[i], 0, startY + i * (baseFont * 0.9))
      }
      canvasCtx.restore()
    }
  } else {
    canvasCtx.fillStyle = 'rgba(255,255,255,0.95)'
    canvasCtx.font = `${baseFont}px system-ui`
    const lines = wrapText(canvasCtx, line, maxTextWidth)
    const startY = -((lines.length - 1) * (baseFont * 0.9)) / 2
    for (let i = 0; i < lines.length; i++) {
      canvasCtx.fillText(lines[i], 0, startY + i * (baseFont * 0.9))
    }
  }
  canvasCtx.restore()

  // === NEXT LINE PREVIEW ===
  if (nextText) {
    canvasCtx.save()
    canvasCtx.globalAlpha = 0.6
    canvasCtx.fillStyle = 'rgba(255,255,255,0.6)'
    canvasCtx.font = `${Math.max(16, baseFont * 0.6)}px system-ui`
    const lines = wrapText(canvasCtx, nextText, maxTextWidth)
    const nextY = lh * 0.68
    for (let i = 0; i < lines.length; i++) {
      canvasCtx.fillText(lines[i], lw / 2, nextY + i * (baseFont * 0.6))
    }
    canvasCtx.restore()
  }

  canvasCtx.filter = 'none'
}

onMounted(() => {
  audio.value = new Audio(audioFile)
  audio.value.preload = 'auto'

  audio.value.addEventListener('timeupdate', () => {
    if (audio.value) {
      currentTime.value = Number(audio.value.currentTime) || 0
    }
  })

  audio.value.addEventListener('loadedmetadata', () => {
    if (audio.value) {
      duration.value = Number(audio.value.duration) || 0
    }
  })

  setInterval(() => {
    console.log('TIME', currentTime.value, typeof currentTime.value)
  }, 1000)

  audio.value.addEventListener('ended', () => {
    isPlaying.value = false
  })

  // canvas init
  if (canvasRef.value) {
    canvasCtx = canvasRef.value.getContext('2d')
    resizeCanvas()
  }

  const onResize = () => resizeCanvas()
  window.addEventListener('resize', onResize)

  // keyboard shortcuts
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') { e.preventDefault(); togglePlayPause() }
    else if (e.key.toLowerCase() === 'r') restart()
    else if (e.key.toLowerCase() === 'd') demonMode.value = !demonMode.value
  }
  window.addEventListener('keydown', onKey)

  // start draw loop
  draw()

  ;(window as any)._karaokeCleanup = () => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', onResize)
  }
})

onUnmounted(() => {
  if (audio.value) { audio.value.pause(); audio.value = null }
  if (rafId) cancelAnimationFrame(rafId)
  if ((window as any)._karaokeCleanup) (window as any)._karaokeCleanup()
})
</script>

<template>
  <div class="karaoke-container">
    <div class="karaoke-header">
      <h1>{{ metadata.title }}</h1>
      <p class="song-title">{{ metadata.artist }}</p>
      <p class="song-meta">BPM: {{ metadata.bpm }} · Key: {{ metadata.key }} · {{ metadata.year }}</p>
    </div>


    <div class="karaoke-visual">
      <img :src="coverFile" class="cover-bg" />
      <canvas ref="canvasRef" class="karaoke-canvas"></canvas>
    </div>


    <div class="controls">
      <div class="time-info">
        <span>{{ formattedCurrent}}</span>
        <span>{{ formattedDuration }}</span>
      </div>

      <input
          type="range"
          :value="Number(currentTime.valueOf())"
          :max="Number(duration.valueOf()) || 0"
          step="0.1"
          @input="seek"
          class="progress-bar"
      />



      <div class="buttons">
        <button @click="restart" class="control-btn restart-btn" title="Restart">🔁</button>
        <button @click="togglePlayPause" class="control-btn play-btn" title="Play / Pause">
          <span v-if="!isPlaying">▶️</span>
          <span v-else>⏸</span>
        </button>
        <button @click="demonMode = !demonMode" class="control-btn demon-btn" :class="{ active: demonMode }" title="Demon Mode">🎭</button>
        <button @click="toggleFullscreen" class="control-btn fs-btn" title="Fullscreen">
          <span v-if="!isFullscreen">🖥</span>
          <span v-else>❌</span>
        </button>
      </div>


      <div style="margin-top:10px; text-align:center; opacity:0.8; font-size:0.9rem;">Tip: Space = play/pause · R = restart · D = Demon Mode</div>
    </div>
  </div>
</template>

<style scoped>
/* --- базовые ресеты --- */
:global(html, body) {
  margin: 0;
  padding: 0;
  overflow: hidden; /* 🚫 убирает скролл */
  background: #000; /* чистый чёрный фон без серых артефактов */
  height: 100%;
  width: 100%;
}

/* --- корневой контейнер --- */
.karaoke-container {
  position: fixed; /* фиксируем чтобы не двигалось */
  inset: 0; /* занимает весь экран */
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: radial-gradient(circle at center, #1a0006 0%, #000 85%);
  color: #fff;
  font-family: system-ui, sans-serif;
  user-select: none;
  overflow: hidden; /* не позволяем вылезать контенту */
}

.time-info {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 0.9rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
}

/* --- заголовок --- */
.karaoke-header {
  text-align: center;
  margin-bottom: 0.5rem;
}
.karaoke-header h1 {
  font-size: 2rem;
  letter-spacing: 1px;
  margin: 0;
}
.song-title {
  font-size: 1rem;
  opacity: 0.8;
  margin-top: 0.25rem;
}

.song-meta {
  opacity: 0.8;
  font-size: 0.95rem;
  letter-spacing: 0.5px;
  margin-top: 0.25rem;
}


/* --- визуальный блок (фон + холст) --- */
.karaoke-visual {
  position: relative;
  width: 90vw;
  max-width: 1000px;
  height: 50vh;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(255, 0, 60, 0.25);
  margin-bottom: 1rem;
  z-index: 1;
}

.cover-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* 🔧 сбалансированный фильтр: виден фон, но не мешает тексту */
  filter: blur(25px) brightness(0.45) saturate(130%) contrast(110%)
  drop-shadow(0 0 30px #ff0022cc);
  transform: scale(1.08);
  transition: opacity 0.8s ease, filter 0.5s ease;
  opacity: v-bind(coverOpacity);
  z-index: 0;
}


.karaoke-canvas {
  position: relative;
  z-index: 1; /* поверх фона */
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
}

/* --- блок управления --- */
.controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80%;
  max-width: 700px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1rem 1.5rem;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(5px);
  z-index: 2; /* чтобы не перекрывалось */
}

/* остальной код (time-info, progress-bar, buttons и т.д.) оставь как есть */

/* --- адаптив --- */
@media (max-width: 768px) {
  .karaoke-visual {
    width: 95vw;
    height: 35vh;
  }
  .controls {
    width: 90%;
    padding: 0.75rem 1rem;
  }
  .control-btn {
    font-size: 1rem;
  }
}


</style>


