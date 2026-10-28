'use client';
import { useState, useRef, useEffect } from 'react';

interface MensajeHistorial {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface PantallaActual {
  historia: string;
  opciones: string[];
  impacto_vida: number;
  texto_metrica: string;
}

export default function JuegoRolPage() {
  const [tematica, setTematica] = useState<string>('');
  const [enJuego, setEnJuego] = useState<boolean>(false);
  const [pantallaActual, setPantallaActual] = useState<PantallaActual | null>(null);
  const [historial, setHistorial] = useState<MensajeHistorial[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [escribiendo, setEscribiendo] = useState<boolean>(false);
  const historiaRef = useRef<HTMLDivElement>(null);
  const [vida, setVida] = useState<number>(100);
  const [turnos, setTurnos] = useState<number>(0);
  const [textoMetrica, setTextoMetrica] = useState<string>('Salud');
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [ultimoHistorialFallido, setUltimoHistorialFallido] = useState<MensajeHistorial[] | null>(null);
  const [ultimoImpacto, setUltimoImpacto] = useState<number | null>(null);

  // Auto-scroll al fondo del texto mientras se escribe la historia
  useEffect(() => {
    if (historiaRef.current) {
      historiaRef.current.scrollTop = historiaRef.current.scrollHeight;
    }
  }, [pantallaActual?.historia]);

  useEffect(() => {
    const manejarTeclado = (e: KeyboardEvent) => {
      // 1. Ignorar si el usuario está escribiendo en un campo de texto
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // 2. Solo actuar si está en juego, no está cargando ni escribiendo, y hay opciones disponibles
      if (!enJuego || cargando || escribiendo || !pantallaActual?.opciones?.length || vida <= 0) {
        return;
      }

      // 3. Mapeo de teclas normales y del teclado numérico
      const mapaTeclas: { [key: string]: number } = {
        '1': 0,
        '2': 1,
        '3': 2,
        'Numpad1': 0,
        'Numpad2': 1,
        'Numpad3': 2,
      };

      const indiceOpcion = mapaTeclas[e.code] ?? mapaTeclas[e.key];

      // 4. Si la tecla corresponde a una opción existente, la ejecutamos
      if (indiceOpcion !== undefined && pantallaActual.opciones[indiceOpcion]) {
        elegirOpcion(pantallaActual.opciones[indiceOpcion]);
      }
    };

    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [enJuego, cargando, escribiendo, pantallaActual, vida, turnos, historial]);

  // Convierte **texto** en negrita (y *texto* en cursiva) de forma segura
  const renderizarTextoConFormato = (texto: string) => {
    if (!texto) return null;

    const partes = texto.split(/(\*\*.*?\*\*|\*[^*\n]+?\*)/g);

    return partes.map((parte, index) => {
      if (parte.startsWith('**') && parte.endsWith('**') && parte.length >= 4) {
        return (
          <strong key={index} className="font-bold text-white tracking-wide">
            {parte.slice(2, -2)}
          </strong>
        );
      }
      if (parte.startsWith('*') && parte.endsWith('*') && parte.length >= 2) {
        return (
          <em key={index} className="italic text-cyan-200">
            {parte.slice(1, -1)}
          </em>
        );
      }
      return parte;
    });
  };

  // Muestra la historia palabra por palabra de forma fluida (efecto streaming en vivo)
  const escribirTextoFluido = async (dataCompleta: PantallaActual) => {
    setEscribiendo(true);

    const palabras = (dataCompleta.historia || '').split(' ');
    let textoAcumulado = '';

    // Inicializamos el contenedor con texto vacío y sin opciones aún
    setPantallaActual({
      historia: '',
      opciones: [],
      impacto_vida: dataCompleta.impacto_vida,
      texto_metrica: dataCompleta.texto_metrica,
    });

    // Añadimos palabra por palabra con ritmo dinámico
    for (let i = 0; i < palabras.length; i++) {
      textoAcumulado += (i > 0 ? ' ' : '') + palabras[i];
      setPantallaActual(prev => (prev ? { ...prev, historia: textoAcumulado } : null));
      await new Promise(resolve => setTimeout(resolve, 12)); // ~12ms por palabra para lectura natural
    }

    // Al finalizar la historia: revelamos las opciones y aplicamos la vida y el turno
    setPantallaActual(dataCompleta);

    if (dataCompleta.texto_metrica && turnos === 0) {
      setTextoMetrica(dataCompleta.texto_metrica);
    }

    if (dataCompleta.impacto_vida !== undefined) {
      setUltimoImpacto(dataCompleta.impacto_vida);
    }

    setVida((vidaActual) => {
      const nuevaVida = vidaActual + (dataCompleta.impacto_vida || 0);
      return Math.max(0, Math.min(100, nuevaVida));
    });

    setTurnos((t) => t + 1);
    setEscribiendo(false);
  };

  const procesarTurno = async (nuevoHistorial: MensajeHistorial[]) => {
    setCargando(true);
    setErrorServidor(null);
    setPantallaActual(null);

    try {
      const response = await fetch('/api/juego', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historial: nuevoHistorial }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Servidores de IA saturados momentáneamente');
      }

      const data: PantallaActual = await response.json();

      // Guardamos en el historial para mantener la memoria intacta
      setHistorial([
        ...nuevoHistorial,
        { role: 'model', parts: [{ text: JSON.stringify(data) }] }
      ]);

      setUltimoHistorialFallido(null);
      setCargando(false);

      // Desencadenamos la escritura fluida de la historia
      await escribirTextoFluido(data);

    } catch (error: any) {
      console.error('Error de conexión:', error);

      // Filtro de seguridad: si el mensaje tiene formato JSON técnico, mostramos texto limpio
      let mensajeUsuario = 'La conexión con el Máster se ha interrumpido momentáneamente.';
      const mensajeOriginal = error?.message || '';

      if (mensajeOriginal && !mensajeOriginal.includes('{') && !mensajeOriginal.includes('v1beta')) {
        mensajeUsuario = mensajeOriginal;
      }

      setErrorServidor(mensajeUsuario);
      setUltimoHistorialFallido(nuevoHistorial);
      setCargando(false);
    }
  };

  const empezarJuego = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tematica.trim()) return;

    setEnJuego(true);
    const mensajeInicial: MensajeHistorial[] = [
      { 
        role: 'user', 
        parts: [{ 
          text: `Comienza una aventura con la temática: "${tematica}". Escribe exactamente 2 párrafos de unas 4 líneas cada uno. Utiliza un lenguaje inclusivo y neutro en segunda persona sin asumir el género de quien juega, define la métrica de vida y ofrece 3 opciones.` 
        }] 
      }
    ];
    
    setHistorial(mensajeInicial);
    procesarTurno(mensajeInicial);
  };

  const elegirOpcion = (opcionSeleccionada: string) => {
    const esTurnoFinal = turnos >= 9; // TURNO 10 es el ultimo

    let textoEleccion = `El jugador elige la acción: "${opcionSeleccionada}". Estado actual de ${textoMetrica}: ${vida}/100. Recuerda escribir exactamente 2 párrafos de unas 4 líneas y mantener un lenguaje neutro e inclusivo en segunda persona.`;

    if (esTurnoFinal) {
      textoEleccion += " INSTRUCCIÓN OBLIGATORIA DEL SISTEMA: Este es el TURNO 10 y FINAL. Narra la conclusión definitiva en 2 párrafos y devuelve la lista 'opciones' totalmente VACÍA [].";
    }

    const nuevoHistorial: MensajeHistorial[] = [
      ...historial,
      { role: 'user', parts: [{ text: textoEleccion }] }
    ];
    
    setHistorial(nuevoHistorial);
    procesarTurno(nuevoHistorial);
  };

  const reiniciarPartida = () => {
    setEnJuego(false);
    setPantallaActual(null);
    setHistorial([]);
    setTematica('');
    setVida(100);
    setTurnos(0);
    setTextoMetrica('Salud');
    setErrorServidor(null);
    setUltimoHistorialFallido(null);
    setUltimoImpacto(null);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-cyan-50 font-sans selection:bg-fuchsia-900 flex flex-col items-center justify-center p-4">
      <div className="max-w-3xl w-full">
        
        {/* CABECERA */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-center tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-cyan-400 drop-shadow-[0_0_10px_rgba(192,38,211,0.5)]">
            YOUR FANTASY HISTORY
          </h1>
          {enJuego && (
            <button
              onClick={reiniciarPartida}
              className="mt-3 text-xs uppercase tracking-widest text-slate-400 hover:text-cyan-400 border border-slate-800 hover:border-cyan-500/50 px-3 py-1.5 rounded transition-all cursor-pointer"
            >
              ← Terminar Partida / Nueva Temática
            </button>
          )}
        </div>

        {/* PANTALLA DE INICIO */}
        {!enJuego ? (
          <form 
            onSubmit={empezarJuego} 
            className="bg-slate-900/80 border border-fuchsia-900/50 p-8 rounded-xl backdrop-blur-sm shadow-[0_0_30px_rgba(192,38,211,0.15)] flex flex-col gap-6"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="tematica" className="text-cyan-400 uppercase tracking-widest text-sm font-semibold">
                Parámetros de Simulación (Temática)
              </label>
              <input
                id="tematica"
                type="text"
                placeholder="Ej: Cyberpunk oscuro, Fantasía medieval con dragones, Terror espacial, Cita en un restaurante..."
                value={tematica}
                onChange={(e) => setTematica(e.target.value)}
                className="bg-slate-950 border border-cyan-900 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 text-cyan-50 p-4 rounded-lg outline-none transition-all placeholder:text-slate-600"
                required
              />
            </div>
            
            <button
              type="submit"
              disabled={cargando}
              className="w-full bg-gradient-to-r from-fuchsia-700 to-purple-800 hover:from-fuchsia-600 hover:to-purple-700 text-white p-4 rounded-lg font-bold uppercase tracking-[0.2em] transition-all hover:shadow-[0_0_20px_rgba(192,38,211,0.4)] active:scale-[0.98] cursor-pointer disabled:opacity-50"
            >
              Iniciar Conexión
            </button>
          </form>
        ) : (
          <>
            {/* HUD DE JUEGO: BARRA DE VIDA Y CONTADOR DE TURNOS */}
            <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-4 justify-between items-center shadow-lg mb-8">
              {/* Métrica Dinámica y Barra */}
              <div className="w-full md:w-2/3">
                <div className="flex justify-between items-center text-xs uppercase tracking-widest font-mono mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-cyan-400 font-bold">{textoMetrica}</span>
                    {/* Badge del último cambio de salud */}
                    {ultimoImpacto !== null && ultimoImpacto !== 0 && !escribiendo && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        ultimoImpacto > 0 ? 'bg-emerald-950 text-emerald-400 border border-emerald-700/50' : 'bg-red-950 text-red-400 border border-red-700/50'
                      }`}>
                        {ultimoImpacto > 0 ? `+${ultimoImpacto}` : ultimoImpacto}
                      </span>
                    )}
                  </div>
                  <span className={vida <= 25 ? "text-red-400 font-bold animate-pulse" : "text-slate-300"}>
                    {vida} / 100
                  </span>
                </div>
                <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div 
                    className={`h-full transition-all duration-700 ease-out rounded-full ${
                      vida > 50 ? 'bg-gradient-to-r from-cyan-500 to-emerald-400' :
                      vida > 25 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                      'bg-gradient-to-r from-red-600 to-rose-500'
                    }`}
                    style={{ width: `${vida}%` }}
                  />
                </div>
              </div>
                  
              {/* Contador de Turnos */}
              <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-slate-400">
                <span>Progreso:</span>
                <span className="text-fuchsia-400 font-bold text-sm bg-slate-950 px-2.5 py-1 rounded border border-fuchsia-900/50">
                  Turno {turnos} / 10
                </span>
              </div>
            </div>
            
            {/* PANTALLA DE JUEGO */}
            <div className="flex flex-col gap-8">
              {/* Contenedor de la Historia */}
              <div 
                ref={historiaRef}
                className="bg-slate-900/80 border-l-4 border-cyan-500 p-6 md:p-8 rounded-r-xl shadow-[0_0_20px_rgba(6,182,212,0.1)] max-h-[280px] md:max-h-[340px] overflow-y-auto scroll-smooth"
              >
                {cargando && !pantallaActual?.historia ? (
                  <div className="flex items-center justify-center h-full text-cyan-500 animate-pulse font-mono py-8">
                    Sintonizando con el Máster...
                  </div>
                ) : (
                  <div className="text-base md:text-lg leading-relaxed text-slate-300 font-serif space-y-4">
                    {(pantallaActual?.historia || '').split(/\n\s*\n/).map((parrafo, idx, arr) => (
                      <p key={idx}>
                        {renderizarTextoConFormato(parrafo.trim())}
                        {/* Cursor parpadeante solo al final del último párrafo mientras escribe */}
                        {idx === arr.length - 1 && (cargando || escribiendo) && (
                          <span className="inline-block w-2.5 h-5 ml-1 bg-cyan-400 animate-pulse align-middle" />
                        )}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              {/* AVISO DE CONGESTIÓN TEMPORAL CON BOTÓN DE REINTENTO */}
              {errorServidor && (
                <div className="bg-amber-950/50 border border-amber-600/70 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-3 text-amber-200 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <span>{errorServidor}</span>
                  </div>
                  <button
                    onClick={() => ultimoHistorialFallido && procesarTurno(ultimoHistorialFallido)}
                    disabled={cargando}
                    className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-all text-xs cursor-pointer shrink-0"
                  >
                    {cargando ? 'Reintentando...' : 'Reintentar acción'}
                  </button>
                </div>
              )}

              {/* CONDICIONALES DE FIN DE JUEGO O CONTINUACIÓN */}

              {/* 1. DERROTA: La métrica llegó a 0 */}
              {!escribiendo && vida <= 0 ? (
                <div className="bg-red-950/40 border border-red-800/80 p-8 rounded-xl text-center flex flex-col items-center gap-4 animate-fade-in shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <h2 className="text-3xl font-bold tracking-widest text-red-500 font-mono">
                    SIMULACIÓN FALLIDA: GAME OVER
                  </h2>
                  <p className="text-slate-300 max-w-md">
                    Tu nivel de <span className="text-red-400 font-semibold">{textoMetrica}</span> se ha agotado por completo. Las consecuencias han sido fatales para la misión.
                  </p>
                  <button
                    onClick={reiniciarPartida}
                    className="bg-red-600 hover:bg-red-500 text-white font-bold uppercase tracking-widest px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_15px_rgba(239,68,68,0.5)] cursor-pointer mt-2"
                  >
                    Reintentar Simulación
                  </button>
                </div>
              ) : !escribiendo && pantallaActual && pantallaActual.opciones.length === 0 ? (

                /* 2. VICTORIA: Se alcanzó el final de la historia */
                <div className="bg-emerald-950/40 border border-emerald-800/80 p-8 rounded-xl text-center flex flex-col items-center gap-4 animate-fade-in shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                  <h2 className="text-3xl font-bold tracking-widest text-emerald-400 font-mono">
                    AVENTURA COMPLETADA
                  </h2>
                  <p className="text-slate-300 max-w-md">
                    Has alcanzado el desenlace de la historia habiendo mantenido tu <span className="text-emerald-400 font-semibold">{textoMetrica}</span> en un <span className="font-bold">{vida}%</span>.
                  </p>
                  <button
                    onClick={reiniciarPartida}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase tracking-widest px-6 py-3 rounded-lg transition-all hover:shadow-[0_0_15px_rgba(16,185,129,0.5)] cursor-pointer mt-2"
                  >
                    Jugar Otra Aventura
                  </button>
                </div>
              ) : (
              
                /* 3. PARTIDA EN CURSO: Mostrar opciones cuando termine de escribir */
                <div className="grid grid-cols-1 gap-4">
                  {cargando || escribiendo ? (
                    <div className="text-center text-fuchsia-500 animate-pulse uppercase tracking-widest text-sm font-bold font-mono py-2">
                      {cargando ? 'Calculando consecuencias...' : 'Sintonizando opciones...'}
                    </div>
                  ) : (
                    pantallaActual?.opciones.map((opcion, index) => (
                      <button
                        key={index}
                        onClick={() => elegirOpcion(opcion)}
                        disabled={cargando || escribiendo}
                        className="group relative text-left bg-slate-900 border border-slate-800 hover:border-fuchsia-500 p-4 rounded-lg transition-all overflow-hidden disabled:opacity-50 cursor-pointer"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 ease-out" />
                        <span className="relative z-10 flex gap-4 items-center">
                          <span className="text-fuchsia-500 font-mono font-bold text-sm">
                            0{index + 1}
                          </span>
                          <span className="text-cyan-50 group-hover:text-white transition-colors">
                            {renderizarTextoConFormato(opcion)}
                          </span>
                          {/* Indicador de tecla en PC */}
                          <kbd className="hidden md:inline-block font-mono text-[10px] text-slate-500 border border-slate-800 bg-slate-950 px-2 py-0.5 rounded group-hover:text-cyan-400 group-hover:border-cyan-500/50 transition-colors">
                            [{index + 1}]
                          </kbd>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </> 
        )}
      </div>
    </main>
  );
}