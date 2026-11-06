import { useEffect, useRef, useState, type ReactNode } from 'react'
import L from 'leaflet'
import routeGeoJson from './route.json'
import { PARADEROS_LINEA_1 } from './paraderos'

const BLUE = '#1F5FD6', NAVY = '#12285A', GREEN = '#16A34A'
type Screen = 'login' | 'inicio' | 'seguimiento' | 'voz' | 'rutas' | 'perfil' | 'turno' | 'turno_activo'

const LINES = [
  { id: 1, name: 'Línea 1', co: 'Empresa Los Andes', min: 4, color: '#1F5FD6', desc: 'Empresa Los Andes · Las Américas · Av. Manuel Seoane · Miraflores' },
  { id: 2, name: 'Línea 2', co: 'Transportes Apurímac', min: 7, color: '#16A34A', desc: 'Transportes Apurímac · Av. Manuel Seoane · Arenas · Santa Rosa' },
  { id: 4, name: 'Línea 4', co: 'Empresa Los Andes', min: 11, color: '#7C3AED', desc: 'Empresa Los Andes · Av. Manuel Seoane · Santa Rosa · Arenas' },
]

const card = 'bg-white rounded-2xl shadow-[0_4px_16px_rgba(18,40,90,0.08)]'
const vozCfg = { voz: 'm' as 'm' | 'h', vol: 70 }

function decir(texto: string) {
  if (!('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(texto)
  u.lang = 'es-419'
  u.volume = vozCfg.vol / 100
  const voces = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith('es'))
  const reMujer = /(female|mujer|sabina|helena|laura|paulina|monica|mónica|elena|dalia|camila|salome)/i
  const reHombre = /(male|hombre|pablo|raul|raúl|jorge|diego|alvaro|álvaro|tomas|tomás|gonzalo|alonso)/i
  const elegida = voces.find((v) => (vozCfg.voz === 'm' ? reMujer : reHombre).test(v.name))
  if (elegida) u.voice = elegida
  u.pitch = vozCfg.voz === 'm' ? 1.15 : 0.8
    const synth = window.speechSynthesis
  synth.cancel()
  synth.resume()
  u.onend = () => synth.cancel()
  setTimeout(() => synth.speak(u), 250)
}

const Icon = ({ d, size = 22, stroke = 'currentColor', fill = 'none', sw = 2 }: { d: ReactNode; size?: number; stroke?: string; fill?: string; sw?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const Bus = ({ size = 22, color = 'currentColor' }: { size?: number; color?: string }) => (
  <Icon size={size} stroke={color} d={<><rect x="4" y="3" width="16" height="14" rx="3" /><path d="M4 11h16M8 21v-4M16 21v-4" /><circle cx="8" cy="14" r=".6" /><circle cx="16" cy="14" r=".6" /></>} />
)
const Horn = ({ size = 48, color = '#12285A' }: { size?: number; color?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill={color} />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
)
const Chevron = ({ color = '#94A3B8' }) => <Icon size={20} stroke={color} d={<path d="M9 6l6 6-6 6" />} />
const Back = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="Volver" className="w-11 h-11 rounded-full bg-white shadow-[0_4px_16px_rgba(18,40,90,0.12)] flex items-center justify-center" style={{ color: NAVY }}>
    <Icon d={<path d="M15 6l-6 6 6 6" />} />
  </button>
)
const FACTOR_DEMO = 15 // qué tan rápido se mueve la combi en pantalla
const VELOCIDAD_REAL_MS = 20000 / 3600 // 20 km/h: se usa para calcular los minutos
const VELOCIDAD_MS = VELOCIDAD_REAL_MS * FACTOR_DEMO // solo para animar la combi

const COLORES_LINEA: Record<number, string> = {
  1: '#2563EB', // azul
  2: '#16A34A', // verde
  4: '#7C3AED', // morado
}

function LeafletMap({ lineaId = null, onSeleccionParadero }: { lineaId?: number | null; onSeleccionParadero?: (nombre: string, minutosSubida: number | null, minutosBajada: number | null) => void }) {  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: true, zoomSnap: 0.25 })
    L.control.zoom({ position: 'topright' }).addTo(map)
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    }).addTo(map)

    const doc = routeGeoJson as unknown as {
      features: Array<{
        properties: { combi: number }
        geometry: { type: string; coordinates: [number, number][] }
      }>
    }

    // Solo las líneas que toca mostrar (todas, o la elegida)
    const features = doc.features.filter(
      (f) => f.geometry.type === 'LineString' && (lineaId === null || f.properties.combi === lineaId)
    )

    const distanciaMetros = (a: [number, number], b: [number, number]) => {
      const R = 6371000
      const toRad = (d: number) => (d * Math.PI) / 180
      const dLat = toRad(b[0] - a[0])
      const dLng = toRad(b[1] - a[1])
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2
      return 2 * R * Math.asin(Math.sqrt(h))
    }

    // ---- Rutas + combis animadas ----
    // ---- Rutas + combis animadas (ida = sube, vuelta = baja) ----
    const boundsList: L.LatLngBounds[] = []
    const estados: Record<number, { coords: [number, number][]; tramo: number; progreso: number; marker: L.Marker }> = {}
    const estadosVuelta: Record<number, { coords: [number, number][]; tramo: number; progreso: number; marker: L.Marker }> = {}

    features.forEach((feat, i) => {
      const id = feat.properties.combi
      const color = COLORES_LINEA[id] ?? '#2563EB'
      const coords: [number, number][] = feat.geometry.coordinates.map(([lng, lat]) => [lat, lng])
      const coordsVuelta = [...coords].reverse()

      const polyline = L.polyline(coords, { color, weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(map)
      boundsList.push(polyline.getBounds())

      const combiIcon = L.divIcon({
        className: 'combi-icon',
        html: `<div style="width:26px;height:26px;background:${color};border:3px solid #ffffff;border-radius:50%;box-shadow:0 2px 8px rgba(18,40,90,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:#FACC15;border-radius:2px;"></div></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })
      const combiIconVuelta = L.divIcon({
        className: 'combi-icon-vuelta',
        html: `<div style="width:26px;height:26px;background:#ffffff;border:4px solid ${color};border-radius:50%;box-shadow:0 2px 8px rgba(18,40,90,0.4);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:${color};border-radius:2px;"></div></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      })

      const tramoInicial = Math.floor((coords.length / 4) * i) % (coords.length - 1)
      const marker = L.marker(coords[tramoInicial], { icon: combiIcon, zIndexOffset: 1000 }).addTo(map)
      estados[id] = { coords, tramo: tramoInicial, progreso: 0, marker }

      const tramoInicialVuelta = Math.floor((coordsVuelta.length / 4) * (i + 1)) % (coordsVuelta.length - 1)
      const markerVuelta = L.marker(coordsVuelta[tramoInicialVuelta], { icon: combiIconVuelta, zIndexOffset: 1000 }).addTo(map)
      estadosVuelta[id] = { coords: coordsVuelta, tramo: tramoInicialVuelta, progreso: 0, marker: markerVuelta }
    })

        let ultimo = performance.now()
    let rafId = 0
    const animar = (ahora: number) => {
      const dt = Math.min((ahora - ultimo) / 1000, 0.5)
      ultimo = ahora
      ;[...Object.values(estados), ...Object.values(estadosVuelta)].forEach((e) => {
        const n = e.coords.length
        let avance = VELOCIDAD_MS * dt
        let guardia = 0
        while (avance > 0 && guardia++ < 50) {
          const a = e.coords[e.tramo]
          const b = e.coords[(e.tramo + 1) % n]
          const largo = distanciaMetros(a, b)
          const resta = largo * (1 - e.progreso)
          if (largo === 0 || avance >= resta) {
            avance -= resta
            e.tramo = (e.tramo + 1) % n
            e.progreso = 0
          } else {
            e.progreso += avance / largo
            avance = 0
          }
        }
        const a = e.coords[e.tramo]
        const b = e.coords[(e.tramo + 1) % n]
        e.marker.setLatLng([a[0] + (b[0] - a[0]) * e.progreso, a[1] + (b[1] - a[1]) * e.progreso])
      })
      rafId = requestAnimationFrame(animar)
    }
    rafId = requestAnimationFrame(animar)
    // ---- Paraderos (solo existen para la Línea 1) ----
        // ---- Paraderos (cada 200 m sobre cada ruta) ----

    const generarParaderos = (coords: [number, number][], cada = 200) => {
      const puntos: { lat: number; lng: number }[] = [{ lat: coords[0][0], lng: coords[0][1] }]
      let faltante = cada
      for (let i = 0; i < coords.length - 1; i++) {
        const a = coords[i], b = coords[i + 1]
        const d = distanciaMetros(a, b)
        let desde = 0
        while (d - desde >= faltante) {
          desde += faltante
          const t = desde / d
          puntos.push({ lat: a[0] + (b[0] - a[0]) * t, lng: a[1] + (b[1] - a[1]) * t })
          faltante = cada
        }
        faltante -= d - desde
      }
      return puntos
    }

    const minutosDesde = (e: { coords: [number, number][]; tramo: number; progreso: number }, punto: [number, number]) => {
      const ruta = e.coords
      const n = ruta.length
      let objetivo = 0, mejor = Infinity
      ruta.forEach((p, i) => {
        const d = distanciaMetros(punto, p)
        if (d < mejor) { mejor = d; objetivo = i }
      })
      const actual: [number, number] = [
        ruta[e.tramo][0] + (ruta[(e.tramo + 1) % n][0] - ruta[e.tramo][0]) * e.progreso,
        ruta[e.tramo][1] + (ruta[(e.tramo + 1) % n][1] - ruta[e.tramo][1]) * e.progreso,
      ]
      let i = (e.tramo + 1) % n
      let dist = distanciaMetros(actual, ruta[i])
      while (i !== objetivo) {
        const next = (i + 1) % n
        dist += distanciaMetros(ruta[i], ruta[next])
        i = next
      }
      return Math.ceil(dist / VELOCIDAD_REAL_MS / 60)
    }

    const minutosHastaParadero = (id: number, punto: [number, number]) => {
      const bajada = estados[id] ? minutosDesde(estados[id], punto) : null
      const subida = estadosVuelta[id] ? minutosDesde(estadosVuelta[id], punto) : null
      return { subida, bajada }
    }
    const iconoParadero = (color: string) =>
      L.divIcon({
        className: 'paradero-icon',
        html: `<div style="width:14px;height:14px;background:#ffffff;border:2.5px solid ${color};border-radius:50%;box-shadow:0 1px 4px rgba(18,40,90,0.22);cursor:pointer;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      })
    const paraderoIconCerca = L.divIcon({
      className: 'paradero-icon-cerca',
      html: '<div style="width:18px;height:18px;background:#FACC15;border:3px solid #1F5FD6;border-radius:50%;box-shadow:0 0 0 6px rgba(250,204,21,0.35);cursor:pointer;"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    })

    type ParaderoMk = { marker: L.Marker; id: number; nombre: string; lat: number; lng: number; icon: L.DivIcon }
    const paraderoMarkers: ParaderoMk[] = []
    let paraderoSeleccionado: ParaderoMk | null = null

    // Solo se dibujan paraderos cuando hay una línea elegida (en Inicio se vería muy cargado)
    if (lineaId !== null) {
      Object.entries(estados).forEach(([idStr, e]) => {
        const id = Number(idStr)
        const icon = iconoParadero(COLORES_LINEA[id] ?? '#2563EB')
        const lista: { nombre: string; lat: number; lng: number }[] =
          id === 1
            ? PARADEROS_LINEA_1
            : generarParaderos(e.coords).map((p, i) => ({ nombre: `Paradero ${i + 1}`, lat: p.lat, lng: p.lng }))

        lista.forEach((p) => {
          const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)
          const item: ParaderoMk = { marker, id, nombre: p.nombre, lat: p.lat, lng: p.lng, icon }
          marker.on('click', () => {
            paraderoSeleccionado = item
            const { subida, bajada } = minutosHastaParadero(id, [item.lat, item.lng])
            onSeleccionParadero?.(item.nombre, subida, bajada)
          })
          paraderoMarkers.push(item)
        })
      })
    }

    const liveUpdateId = setInterval(() => {
      const s = paraderoSeleccionado
      if (s) {
        const { subida, bajada } = minutosHastaParadero(s.id, [s.lat, s.lng])
        onSeleccionParadero?.(s.nombre, subida, bajada)
      }
    }, 1000)

    // ---- Ubicación del usuario + botón "ubícame" ----
    let userMarker: L.Marker | null = null
    let watchId: number | null = null

    const LocateControl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        const btn = L.DomUtil.create('button', '')
        btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F5FD6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5" fill="#1F5FD6"/><line x1="12" y1="1" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="23"/><line x1="1" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="23" y2="12"/></svg>'
        btn.style.cssText = 'width:34px;height:34px;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;margin-top:8px;'
        L.DomEvent.disableClickPropagation(btn)
        btn.onclick = () => {
          if (userMarker) map.flyTo(userMarker.getLatLng(), 17, { duration: 0.8 })
        }
        return btn
      },
    })
    new LocateControl().addTo(map)

    if (navigator.geolocation) {
      const userIcon = L.divIcon({
        className: 'user-icon',
        html: '<div style="width:16px;height:16px;background:#2563EB;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 0 6px rgba(37,99,235,0.25);"></div>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      })
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const userPos: [number, number] = [pos.coords.latitude, pos.coords.longitude]
          if (!userMarker) userMarker = L.marker(userPos, { icon: userIcon, zIndexOffset: 900 }).addTo(map)
          else userMarker.setLatLng(userPos)
          paraderoMarkers.forEach((pm) => {
            pm.marker.setIcon(distanciaMetros(userPos, [pm.lat, pm.lng]) <= 200 ? paraderoIconCerca : pm.icon)
          })
        },
        (err) => console.error('Error de geolocalización:', err.message),
        { enableHighAccuracy: true, maximumAge: 5000 }
      )
    }

    // ---- Encuadre del mapa ----
       // ---- Encuadre del mapa ----
    const fit = () => {
      if (boundsList.length > 0) {
        const all = boundsList.reduce((acc, b) => acc.extend(b), boundsList[0])
        map.fitBounds(all, { paddingTopLeft: [24, 85], paddingBottomRight: [24, 210] })
      } else {
        map.setView([-13.6339, -72.8814], 14)
      }
    }
    
    fit()
    const timer = setTimeout(() => { map.invalidateSize(); fit() }, 120)

    return () => {
      clearTimeout(timer)
      clearInterval(liveUpdateId)
      cancelAnimationFrame(rafId)
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      map.remove()
    }
  }, [lineaId])

  return <div ref={containerRef} className="absolute inset-0 w-full h-full z-0 bg-[#EEF2F6]" />
}
const tabs: { id: Screen; label: string; icon: ReactNode }[] = [
  { id: 'inicio', label: 'Inicio', icon: <path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z" /> },
  { id: 'rutas', label: 'Rutas', icon: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h7a3 3 0 000-6H9a3 3 0 010-6h7" /></> },
  { id: 'perfil', label: 'Perfil', icon: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></> },
]

const Field = ({ label, type = 'text' }: { label: string; type?: string }) => (
  <label className="block">
    <span className="text-[13px] font-medium text-slate-500">{label}</span>
    <input type={type} className="mt-1.5 w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-[15px] outline-none focus:border-[#1F5FD6]" style={{ color: NAVY }} />
  </label>
)

function Login({ go }: { go: (s: Screen) => void }) {
  const [t, setT] = useState<'p' | 'c'>('p')
  return (
    <div className="h-full overflow-y-auto px-6 pt-16 pb-8">
      <div className="flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center shadow-[0_8px_20px_rgba(31,95,214,0.3)]" style={{ background: BLUE }}><Bus size={42} color="#FACC15" /></div>
        <h1 className="mt-5 text-[28px] font-extrabold" style={{ color: NAVY }}>Combi Abancay</h1>
        <p className="mt-1 text-[15px] text-slate-500">Tu próxima combi, a tiempo</p>
      </div>
      <div className="mt-8 flex p-1 rounded-xl bg-slate-200/70">
        {(['p', 'c'] as const).map((k) => (
          <button key={k} onClick={() => setT(k)} className={`flex-1 h-10 rounded-lg text-sm font-semibold transition ${t === k ? 'bg-white shadow-sm' : 'text-slate-500'}`} style={t === k ? { color: NAVY } : undefined}>
            {k === 'p' ? 'Pasajero' : 'Conductor'}
          </button>
        ))}
      </div>
      <div className="mt-6 space-y-4">
        {t === 'p' ? <><Field label="Correo o celular" /><Field label="Contraseña" type="password" /></> : <><Field label="Usuario o DNI" /><Field label="Contraseña" type="password" /></>}
      </div>
      {t === 'p' ? (
        <>
          <button onClick={() => go('inicio')} className="mt-6 w-full h-12 rounded-xl text-white font-semibold" style={{ background: BLUE }}>Ingresar</button>
          <button className="mt-4 w-full text-sm font-semibold" style={{ color: BLUE }}>Crear cuenta</button>
          <button onClick={() => go('inicio')} className="mt-3 w-full h-12 rounded-xl bg-white border border-slate-200 font-semibold" style={{ color: NAVY }}>Continuar sin cuenta</button>
        </>
      ) : (
        <button onClick={() => go('turno')} className="mt-6 w-full h-12 rounded-xl text-white font-semibold" style={{ background: GREEN }}>Ingresar como conductor</button>
      )}
    </div>
  )
}
function LeyendaLineas() {
  return (
    <div className={`${card} absolute left-4 right-4 bottom-24 px-4 py-3 flex items-center justify-around z-20`}>
      {LINES.map((l) => (
        <div key={l.id} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: l.color }} />
          <span className="text-[13px] font-semibold" style={{ color: NAVY }}>{l.name}</span>
        </div>
      ))}
    </div>
  )
}
function Inicio({ go, onLinea }: { go: (s: Screen) => void; onLinea: (id: number) => void }) {
  return (
    <div className="absolute inset-0">
      <LeafletMap />
      <LeyendaLineas />
    </div>
  )
}

function Seguimiento({ go, lineaId }: { go: (s: Screen) => void; lineaId: number | null }) {
  const linea = LINES.find((x) => x.id === lineaId) ?? LINES[0]
  const [sinSenal, setSinSenal] = useState(false)
       const [paraderoSel, setParaderoSel] = useState<{ nombre: string; minutosSubida: number | null; minutosBajada: number | null; t: number } | null>(null)
  const [avisoOn, setAvisoOn] = useState(false)
  const [showHint, setShowHint] = useState(true)
  const [sentido, setSentido] = useState<'subida' | 'bajada'>('subida')
  const sentidoRef = useRef(sentido)
  sentidoRef.current = sentido
  useEffect(() => {
    // Chrome pausa solo la síntesis tras un rato; esto la despierta
    const keep = setInterval(() => window.speechSynthesis?.resume(), 5000)
    return () => clearInterval(keep)
  }, [])
  const [ventana, setVentana] = useState<string | null>(null)
  const selRef = useRef(paraderoSel)
  const prevRef = useRef<{ nombre: string; minutosSubida: number | null; minutosBajada: number | null } | null>(null)
  selRef.current = paraderoSel
    useEffect(() => {
    if (!showHint) return
    const t = setTimeout(() => setShowHint(false), 6000)
    return () => clearTimeout(t)
  }, [showHint])

  useEffect(() => { if (paraderoSel) setShowHint(false) }, [paraderoSel])
  

    const hablar = () => {
    const s = selRef.current
    if (!s) return
    const minutos = sentidoRef.current === 'subida' ? s.minutosSubida : s.minutosBajada
    if (minutos === null) return
    const llegando = minutos <= 1
    const texto = llegando
      ? 'Tu combi está por llegar'
      : `Tu combi llega en ${minutos} minutos`
    setVentana(texto)
    setTimeout(() => setVentana(null), 5000)
    decir(texto)
    if (llegando) setTimeout(() => setAvisoOn(false), 3000)
  }

  useEffect(() => {
    if (!avisoOn) return
    hablar()
  const id = setInterval(hablar, 120000 / FACTOR_DEMO)
    return () => { clearInterval(id); window.speechSynthesis?.cancel() }
  }, [avisoOn])
  return (
    <div className="absolute inset-0">
      <LeafletMap lineaId={lineaId} onSeleccionParadero={(nombre, minutosSubida, minutosBajada) => {
        const prev = prevRef.current
        const actual = sentidoRef.current === 'subida' ? minutosSubida : minutosBajada
        const anterior = prev ? (sentidoRef.current === 'subida' ? prev.minutosSubida : prev.minutosBajada) : null
        if (prev && prev.nombre === nombre && anterior !== null && actual !== null && actual > anterior + 1) {
          setAvisoOn(false)
          setVentana('Tu combi ya pasó por este paradero')
          setTimeout(() => setVentana(null), 5000)
        }
        prevRef.current = { nombre, minutosSubida, minutosBajada }
        setParaderoSel({ nombre, minutosSubida, minutosBajada, t: Date.now() })
      }} />
      <div className="absolute top-14 left-4 z-20"><Back onClick={() => go('inicio')} /></div>
            {showHint && (
        <div
          onClick={() => setShowHint(false)}
          className={`${card} absolute top-28 left-1/2 -translate-x-1/2 px-4 py-3 max-w-[260px] text-center z-40 shadow-xl`}
        >
          <p className="text-[13px] font-semibold" style={{ color: NAVY }}>
            👆 Toca el punto amarillo más cercano a ti para ver cuándo llega tu combi
          </p>
        </div>
      )}
            {ventana && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className={`${card} px-5 py-4 max-w-[260px] text-center shadow-2xl animate-alarm-enter`}>
            <p className="text-[12px] font-semibold text-slate-400">🔊 Aviso por voz</p>
            <p className="mt-1 text-[15px] font-bold" style={{ color: NAVY }}>{ventana}</p>
          </div>
        </div>
      )}
      <div className={`${card} absolute left-4 right-4 bottom-24 p-5 z-20`}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold" style={{ color: NAVY }}>{linea.name} · {linea.co}</p>
          <div className="flex p-0.5 rounded-lg bg-slate-100">
            {([['subida', 'Subida'], ['bajada', 'Bajada']] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setSentido(k)}
                className={`px-2.5 h-7 rounded-md text-[12px] font-semibold transition ${sentido === k ? 'bg-white shadow-sm' : 'text-slate-500'}`}
                style={sentido === k ? { color: BLUE } : undefined}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[13px] text-slate-500 mt-0.5">
          Tu paradero: {paraderoSel ? paraderoSel.nombre : 'Toca un paradero en el mapa'}
        </p>
        <div className="flex items-end justify-between mt-3">
          <p className="text-[34px] leading-none font-extrabold" style={{ color: BLUE }}>
            {paraderoSel && (sentido === 'subida' ? paraderoSel.minutosSubida : paraderoSel.minutosBajada) !== null
              ? `Llega en ${sentido === 'subida' ? paraderoSel.minutosSubida : paraderoSel.minutosBajada} min`
              : '—'}
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2 mt-1.5">
          <p className="text-xs text-slate-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: sinSenal ? '#94A3B8' : GREEN }} />
            {sinSenal ? 'Actualizado hace 1 min' : 'Actualizado hace 5 s'}
          </p>
          {sinSenal && (
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
              Ubicación estimada · última señal hace 1 min
            </span>
          )}
        </div>
          <button
            onClick={() => paraderoSel && setAvisoOn(!avisoOn)}
            disabled={!paraderoSel}
            className="mt-4 w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ background: avisoOn ? GREEN : BLUE }}>
            <Icon size={20} d={<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10v4" />} />
              {avisoOn ? 'Aviso activado ✓' : 'Avisarme por voz'}
        </button>
        <button onClick={() => setSinSenal(!sinSenal)} className="mt-3 w-full text-sm font-semibold" style={{ color: BLUE }}>
          {sinSenal ? 'Ver señal normal en tiempo real' : 'Ver ejemplo sin señal'}
        </button>
      </div>
    </div>
  )
}

function Voz({ go }: { go: (s: Screen) => void }) {
  const [vol, setVol] = useState(70)
  const [voice, setVoice] = useState<'m' | 'h'>('m')
  const [alarmOpen, setAlarmOpen] = useState(false)
  const [feedback, setFeedback] = useState('La combi está cerca de tu paradero')

  const handleEntendido = () => {
    setAlarmOpen(false)
    setFeedback('La combi está cerca de tu paradero')
  }

  const handleRecordarme = () => {
    setAlarmOpen(false)
    setFeedback('Te avisaremos de nuevo en 1 min')
  }

  return (
    <div className="relative h-full flex flex-col px-5 pt-14 pb-8">
      <div><Back onClick={() => go('seguimiento')} /></div>
      <div className="flex flex-col items-center text-center mt-6">
        <div className="w-28 h-28 rounded-full flex items-center justify-center" style={{ background: '#DCE8FB' }}>
          <Icon size={48} stroke={BLUE} sw={2.4} d={<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10v4" />} />
        </div>
        <h1 className="mt-5 text-2xl font-extrabold" style={{ color: NAVY }}>Aviso activado</h1>
        <p className="mt-1 text-[15px] text-slate-500">Te avisaremos cuando la combi esté cerca</p>
      </div>
      <div className={`${card} mt-8 p-5`}>
        <div className="flex justify-between text-sm font-semibold" style={{ color: NAVY }}><span>Volumen</span><span style={{ color: BLUE }}>{vol}%</span></div>
        <input type="range" min={0} max={100} value={vol} onChange={(e) => setVol(+e.target.value)} className="w-full mt-3" style={{ accentColor: BLUE }} />
      </div>
      <div className={`${card} mt-4 p-5`}>
        <p className="text-sm font-semibold mb-3" style={{ color: NAVY }}>Voz</p>
        <div className="flex gap-3">
          {([['m', 'Mujer'], ['h', 'Hombre']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setVoice(k)} className={`flex-1 h-11 rounded-xl font-semibold text-sm border ${voice === k ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-600'}`} style={voice === k ? { background: BLUE } : undefined}>{l}</button>
          ))}
        </div>
      </div>
      <div className="mt-auto space-y-3">
        <p className="text-center text-sm font-semibold" style={{ color: GREEN }}>{feedback}</p>
        <button onClick={() => setAlarmOpen(true)} className="w-full h-12 rounded-xl text-white font-semibold" style={{ background: BLUE }}>Simular aviso</button>
        <button onClick={() => go('seguimiento')} className="w-full h-12 rounded-xl bg-white border-2 border-red-500 text-red-500 font-semibold">Desactivar aviso</button>
      </div>

      {alarmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="absolute inset-0 z-50 flex flex-col justify-between px-6 pt-16 pb-10 overflow-hidden animate-alarm-enter"
          style={{ background: '#12285A' }}
        >
          {/* Mapa difuminado detrás al 20% de opacidad */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
            <img
              src="/abancay-map.png"
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover filter blur-[6px] opacity-20 scale-125"
            />
          </div>

          <div className="relative z-10" />

          {/* Centro: Círculo amarillo con temblor, anillos concéntricos en bucle y textos */}
          <div className="relative z-10 flex flex-col items-center text-center my-auto">
            <div className="relative w-48 h-48 flex items-center justify-center mb-6">
              <div className="absolute w-28 h-28 rounded-full border-2 border-[#FBBF24]/75 animate-alarm-ring-1 pointer-events-none" />
              <div className="absolute w-28 h-28 rounded-full border-2 border-[#FBBF24]/50 animate-alarm-ring-2 pointer-events-none" />
              <div className="absolute w-28 h-28 rounded-full border-2 border-[#FBBF24]/30 animate-alarm-ring-3 pointer-events-none" />
              <div
                className="relative w-28 h-28 rounded-full flex items-center justify-center shadow-[0_0_36px_rgba(251,191,36,0.6)] animate-alarm-shake"
                style={{ background: '#FBBF24' }}
              >
                <Horn size={48} color={NAVY} />
              </div>
            </div>

            <h2 className="text-[26px] font-extrabold text-white tracking-tight leading-tight">
              ¡Tu combi está llegando!
            </h2>
            <p className="mt-2 text-[15px] text-white/80 font-normal">
              Línea 1 · A pocas cuadras de Las Américas
            </p>
            <p className="mt-3 text-sm text-white/60 font-medium">
              Llega en 1 min
            </p>
          </div>

          {/* Botones inferiores */}
          <div className="relative z-10 space-y-3">
            <button
              onClick={handleEntendido}
              className="w-full h-14 rounded-2xl bg-white font-bold text-[17px] shadow-lg transition active:scale-[0.99]"
              style={{ color: BLUE }}
            >
              Entendido
            </button>
            <button
              onClick={handleRecordarme}
              className="w-full h-14 rounded-2xl bg-transparent border-2 border-white text-white font-semibold text-[16px] transition active:scale-[0.99]"
            >
              Recordarme en 1 min
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Rutas({ go, onVer }: { go: (s: Screen) => void; onVer: (id: number) => void }) {
  const [sel, setSel] = useState<number | null>(null)
  const items = [...LINES.map((l) => ({ ...l })), { id: 0, name: 'Otras líneas', co: '', min: 0, color: '#94A3B8', desc: 'Servicios urbanos de ejemplo' }]
  return (
    <div className="h-full flex flex-col">
      <div className="px-5 pt-14 pb-4">
        <h1 className="text-[26px] font-extrabold" style={{ color: NAVY }}>Rutas y paraderos</h1>
        <p className="text-[15px] text-slate-500 mt-1">Elige una línea para ver su recorrido</p>
      </div>
      <div className="flex-1 overflow-y-auto px-5 space-y-3 pb-40">
        {items.map((l) => (
          <button key={l.id} onClick={() => setSel(l.id)} className={`${card} w-full text-left p-4 flex gap-3 items-center border-2`} style={{ borderColor: sel === l.id ? l.color : 'transparent' }}>
            <span className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: l.color + '1F' }}><Bus color={l.color} /></span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-[16px]" style={{ color: NAVY }}>{l.name}</span>
              <span className="block text-[13px] text-slate-500 leading-snug mt-0.5">{l.desc}</span>
              <span className="inline-block mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFE8D6', color: '#C2410C' }}>Demostrativa</span>
            </span>
          </button>
        ))}
      </div>
      {sel !== null && (
        <div className="absolute left-5 right-5 bottom-24">
          <button onClick={() => sel !== null && sel !== 0 && onVer(sel)} className="w-full h-12 rounded-xl text-white font-semibold shadow-[0_8px_20px_rgba(31,95,214,0.35)]" style={{ background: BLUE }}>Ver combi activa</button>
        </div>
      )}
    </div>
  )
}

function Perfil({ go }: { go: (s: Screen) => void }) {
  const [abierto, setAbierto] = useState(false)
  const [voz, setVoz] = useState(vozCfg.voz)
  const [vol, setVol] = useState(vozCfg.vol)
  return (
    <div className="h-full flex flex-col px-5 pt-14 pb-28">
      <h1 className="text-[26px] font-extrabold" style={{ color: NAVY }}>Perfil</h1>
      <div className={`${card} mt-5 p-4 flex items-center gap-4`}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: '#DCE8FB' }}>
          <Icon size={28} stroke={BLUE} d={<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>} />
        </div>
        <div><p className="font-bold" style={{ color: NAVY }}>Pasajero</p><p className="text-sm text-slate-500">Abancay, Apurímac</p></div>
      </div>

      <div className={`${card} mt-4 overflow-hidden`}>
        <button onClick={() => setAbierto(!abierto)} className="w-full p-4 flex items-center gap-3 text-left">
          <Icon stroke={BLUE} d={<path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10v4" />} />
          <span className="flex-1 font-semibold text-[15px]" style={{ color: NAVY }}>Aviso por voz</span>
          <span className="text-sm font-semibold" style={{ color: GREEN }}>{voz === 'm' ? 'Mujer' : 'Hombre'} · {vol}%</span>
          <Chevron />
        </button>
        {abierto && (
          <div className="px-4 pb-4 space-y-4 border-t border-slate-100 pt-4">
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: NAVY }}>Voz</p>
              <div className="flex gap-3">
                {([['m', 'Mujer'], ['h', 'Hombre']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => { setVoz(k); vozCfg.voz = k }} className={`flex-1 h-11 rounded-xl font-semibold text-sm border ${voz === k ? 'text-white border-transparent' : 'bg-white border-slate-200 text-slate-600'}`} style={voz === k ? { background: BLUE } : undefined}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm font-semibold" style={{ color: NAVY }}><span>Volumen</span><span style={{ color: BLUE }}>{vol}%</span></div>
              <input type="range" min={0} max={100} value={vol} onChange={(e) => { setVol(+e.target.value); vozCfg.vol = +e.target.value }} className="w-full mt-2" style={{ accentColor: BLUE }} />
            </div>
            <button onClick={() => decir('Tu combi llega en 5 minutos')} className="w-full h-11 rounded-xl border border-slate-200 font-semibold text-sm" style={{ color: BLUE }}>Probar voz</button>
          </div>
        )}
      </div>

      <button onClick={() => go('login')} className="mt-auto w-full h-12 rounded-xl bg-white border-2 border-red-500 text-red-500 font-semibold">Cerrar sesión</button>
    </div>
  )
}
function Turno({ go }: { go: (s: Screen) => void }) {
  const Sel = ({ k, v }: { k: string; v: string }) => (
    <button className={`${card} w-full p-4 flex items-center text-left`}>
      <span className="flex-1"><span className="block text-xs text-slate-500">{k}</span><span className="block font-semibold mt-0.5" style={{ color: NAVY }}>{v}</span></span>
      <Chevron />
    </button>
  )
  return (
    <div className="h-full flex flex-col px-5 pt-14 pb-8 animate-screen">
      <div className="flex items-center gap-4"><Back onClick={() => go('login')} /><h1 className="text-[22px] font-extrabold" style={{ color: NAVY }}>Iniciar turno</h1></div>
      <div className="mt-6 space-y-3">
        <Sel k="Línea" v="Línea 1 · Empresa Los Andes" />
        <Sel k="Unidad" v="Combi V2A-418" />
        <div className={`${card} p-4 space-y-3`}>
          {[['GPS', 'Activo'], ['Internet', 'Conectado']].map(([a, b]) => (
            <div key={a} className="flex items-center justify-between">
              <span className="font-semibold text-[15px]" style={{ color: NAVY }}>{a}</span>
              <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: GREEN }}><span className="w-2 h-2 rounded-full" style={{ background: GREEN }} />{b}</span>
            </div>
          ))}
        </div>
      </div>
      <button onClick={() => go('turno_activo')} className="mt-auto w-full h-14 rounded-2xl text-white font-bold text-lg" style={{ background: GREEN }}>Iniciar turno</button>
    </div>
  )
}

function TurnoActivo({ go }: { go: (s: Screen) => void }) {
  const [signalState, setSignalState] = useState<'fuerte' | 'sin_senal' | 'reconectado'>('fuerte')
  const [showConfirm, setShowConfirm] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])
  

  const triggerSimulation = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    // Estado 2: Sin señal (3 segundos)
    setSignalState('sin_senal')
    timerRef.current = setTimeout(() => {
      // Estado 3: Reconectado (3 segundos)
      setSignalState('reconectado')
      timerRef.current = setTimeout(() => {
        // Estado 4: Vuelve al estado 1 (Señal fuerte)
        setSignalState('fuerte')
        timerRef.current = null
      }, 3000)
    }, 3000)
  }

  const isOrange = signalState === 'sin_senal'

  return (
    <div className="relative h-full flex flex-col px-5 pt-14 pb-8 animate-screen">
      <div><Back onClick={() => go('turno')} /></div>

      <div className="flex flex-col items-center text-center mt-4 transition-all duration-300">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-md"
          style={{
            background: isOrange ? '#FEF3C7' : '#DCFCE7',
            borderColor: isOrange ? '#F59E0B' : 'transparent',
            borderWidth: isOrange ? 3 : 0,
          }}
        >
          <svg width={46} height={46} viewBox="0 0 24 24" fill="none" stroke={isOrange ? '#F59E0B' : GREEN} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300">
            <circle cx="12" cy="12" r="8" />
            <circle cx="12" cy="12" r="3" fill={isOrange ? '#F59E0B' : GREEN} />
            <line x1="12" y1="2" x2="12" y2="4" />
            <line x1="12" y1="20" x2="12" y2="22" />
            <line x1="2" y1="12" x2="4" y2="12" />
            <line x1="20" y1="12" x2="22" y2="12" />
          </svg>
        </div>
        <h1
          className="mt-4 text-2xl font-extrabold transition-colors duration-300"
          style={{ color: isOrange ? '#F59E0B' : GREEN }}
        >
          {signalState === 'fuerte' && 'Ubicación enviándose'}
          {signalState === 'sin_senal' && 'Reconectando automáticamente...'}
          {signalState === 'reconectado' && 'Señal recuperada'}
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 transition-all duration-300">
          {signalState === 'fuerte' && 'Inicio de turno: 07:30 a. m.'}
          {signalState === 'sin_senal' && 'Tu ubicación se sigue guardando. No necesitas hacer nada.'}
          {signalState === 'reconectado' && 'Sincronizando ubicaciones guardadas...'}
        </p>
      </div>

      {/* Tarjeta amarilla suave en estado Sin señal */}
      {isOrange && (
        <div className="mt-4 p-3.5 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-medium text-center transition-all duration-300 animate-alarm-enter">
          Si la señal tarda mucho, la app sigue guardando tu recorrido.
        </div>
      )}

      {/* Indicador de señal */}
      <div className={`${card} mt-4 p-4 flex items-center justify-between transition-all duration-300`}>
        <div className="flex items-center gap-3">
          <div className="flex items-end gap-1 h-6">
            <span className="w-1.5 h-2 rounded-sm transition-colors duration-300" style={{ background: isOrange ? '#F59E0B' : GREEN }} />
            <span className="w-1.5 h-3.5 rounded-sm transition-colors duration-300" style={{ background: isOrange ? '#CBD5E1' : GREEN }} />
            <span className="w-1.5 h-5 rounded-sm transition-colors duration-300" style={{ background: isOrange ? '#CBD5E1' : GREEN }} />
            <span className="w-1.5 h-6.5 rounded-sm transition-colors duration-300" style={{ background: isOrange ? '#CBD5E1' : GREEN }} />
          </div>
          <span className="font-semibold text-[15px]" style={{ color: isOrange ? '#64748B' : NAVY }}>
            {isOrange ? 'Sin señal' : 'Señal fuerte'}
          </span>
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full transition-colors duration-300"
          style={{
            background: isOrange ? '#FEF3C7' : '#DCFCE7',
            color: isOrange ? '#D97706' : GREEN,
          }}
        >
          {isOrange ? 'Reconectando' : '4G LTE'}
        </span>
      </div>

      {/* Tarjeta pequeña con último envío y batería */}
      <div className={`${card} mt-3 px-4 py-3 flex items-center justify-between text-xs`}>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="w-2 h-2 rounded-full transition-colors duration-300" style={{ background: isOrange ? '#F59E0B' : GREEN }} />
          <span>Último envío: <strong className="font-semibold" style={{ color: NAVY }}>hace 3 s</strong></span>
        </div>
        <div className="flex items-center gap-1.5 font-semibold text-slate-600">
          <Icon size={14} stroke="#64748B" d={<><rect x="2" y="7" width="16" height="10" rx="2" /><line x1="20" y1="11" x2="20" y2="13" /><line x1="6" y1="11" x2="12" y2="11" /></>} />
          <span>Batería: 82 %</span>
        </div>
      </div>

      {/* Enlace para simular fallo de señal */}
      <div className="mt-4 text-center">
        <button
          onClick={triggerSimulation}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 underline underline-offset-4"
        >
          Simular fallo de señal
        </button>
      </div>

      {/* Texto gris pequeño */}
      <p className="mt-2 text-center text-xs text-slate-400">
        Puedes apagar la pantalla. El turno sigue activo.
      </p>

      <button
        onClick={() => setShowConfirm(true)}
        className="mt-auto w-full h-14 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold text-lg shadow-md transition active:scale-[0.99]"
      >
        Finalizar turno
      </button>

      {showConfirm && (
        <div className="absolute inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-6 animate-alarm-enter">
          <div className={`${card} w-full max-w-[320px] p-6 text-center shadow-2xl`}>
            <h3 className="text-[20px] font-bold" style={{ color: NAVY }}>
              ¿Finalizar tu turno?
            </h3>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 h-12 rounded-xl bg-white border border-slate-300 text-slate-700 font-semibold text-[15px] transition active:scale-[0.99]"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false)
                  go('turno')
                }}
                className="flex-1 h-12 rounded-xl bg-red-600 text-white font-bold text-[15px] transition active:scale-[0.99]"
              >
                Sí, finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [s, go] = useState<Screen>('login')
  const [lineaSel, setLineaSel] = useState<number | null>(null)
  const verLinea = (id: number) => { setLineaSel(id); go('seguimiento') }
  
  const showTabs = ['inicio', 'rutas', 'perfil', 'seguimiento', 'voz'].includes(s)
  const active = s === 'seguimiento' || s === 'voz' ? null : s
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="relative w-[390px] h-[844px] max-w-full overflow-hidden rounded-[44px] shadow-2xl" style={{ background: '#F8FAFC' }}>
        {s === 'login' && <Login go={go} />}
        {s === 'inicio' && <Inicio go={go} onLinea={verLinea} />}
        {s === 'seguimiento' && <Seguimiento go={go} lineaId={lineaSel} />}
        {s === 'voz' && <Voz go={go} />}
        {s === 'rutas' && <Rutas go={go} onVer={verLinea} />}
        {s === 'perfil' && <Perfil go={go} />}
        {s === 'turno' && <Turno go={go} />}
        {s === 'turno_activo' && <TurnoActivo go={go} />}
        {showTabs && s !== 'voz' && (
          <nav className="absolute bottom-0 inset-x-0 h-[84px] bg-white border-t border-slate-100 flex pt-2.5 z-30">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => go(t.id)} className="flex-1 flex flex-col items-center gap-1 h-12" style={{ color: active === t.id ? BLUE : '#94A3B8' }}>
                <Icon d={t.icon} />
                <span className="text-[11px] font-semibold">{t.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
