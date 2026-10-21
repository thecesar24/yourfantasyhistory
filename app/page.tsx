'use client';
import { useState, useRef, useEffect } from 'react';

interface MensajeHistorial {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface PantallaActual {
  historia: string;
  opciones: string[];
}

export default function JuegoRolPage() {
  const [tematica, setTematica] = useState<string>('');
  const [enJuego, setEnJuego] = useState<boolean>(false);
  const [pantallaActual, setPantallaActual] = useState<PantallaActual | null>(null);
  const [historial, setHistorial] = useState<MensajeHistorial[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const historiaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al fondo del texto mientras se escribe la historia
  useEffect(() => {
    if (historiaRef.current) {
      historiaRef.current.scrollTop = historiaRef.current.scrollHeight;
    }
  }, [pantallaActual?.historia]);

  // Convierte **texto** en negrita (y *texto* en cursiva) manteniendo el streaming seguro
  const renderizarTextoConFormato = (texto: string) => {
    if (!texto) return null;

    // Divide por **negrita** o *cursiva*
    const partes = texto.split(/(\*\*.*?\*\*|\*[^*\n]+?\*)/g);

    return partes.map((parte, index) => {
      // Caso: **Negrita**
      if (parte.startsWith('**') && parte.endsWith('**') && parte.length >= 4) {
        return (
          <strong key={index} className="font-bold text-white tracking-wide">
            {parte.slice(2, -2)}
          </strong>
        );
      }
      // Caso: *Cursiva*
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

  // Parser tolerante: detecta ---OPCIONES--- o viñetas como * **Opción A:** si Gemini se desvía
  const parsearTextoEnTiempoReal = (textoCompleto: string): PantallaActual => {
    let parteHistoria = textoCompleto;
    let parteOpciones = '';

    const separadores = ['---OPCIONES---', '===OPCIONES===', '### OPCIONES', '### Opciones'];
    const separadorEncontrado = separadores.find(s => textoCompleto.includes(s));

    if (separadorEncontrado) {
      const partes = textoCompleto.split(separadorEncontrado);
      parteHistoria = partes[0];
      parteOpciones = partes.slice(1).join(separadorEncontrado);
    } else {
      // Si la IA no puso el separador pero empezó a listar "* **Opción" o "1."
      const indiceOpciones = textoCompleto.search(/\n(?:\s*[\*\-]\s*\*\*Opción|\s*[\*\-]\s*Opción|\s*\d+[\.\)]\s+)/i);
      if (indiceOpciones !== -1 && indiceOpciones > textoCompleto.length * 0.25) {
        parteHistoria = textoCompleto.substring(0, indiceOpciones);
        parteOpciones = textoCompleto.substring(indiceOpciones);
      }
    }

    // Extraer y limpiar cada opción para los botones
    const opciones = parteOpciones
      ? parteOpciones
          .split('\n')
          .map(linea => linea.trim())
          // Evitar preguntas finales como "¿Qué camino eliges?"
          .filter(linea => !linea.startsWith('¿') && !linea.startsWith('*¿'))
          .filter(linea => /^(\*|\-|\d+[\.\)])/.test(linea) || /^Opción\s+[A-Za-z0-9]/i.test(linea))
          .map(linea =>
            linea
              .replace(/^[\*\-]\s*/, '') // quitar viñeta * o -
              .replace(/^\d+[\.\)]\s*/, '') // quitar números 1. o 1)
              .replace(/^\*\*Opción\s+[A-Za-z0-9]+[:\.]?\*\*\s*/i, '') // quitar **Opción A:**
              .replace(/^Opción\s+[A-Za-z0-9]+[:\.]?\s*/i, '') // quitar Opción A:
              .replace(/^\*\*|\*\*$/g, '') // quitar negritas sueltas
              .trim()
          )
          .filter(linea => linea.length > 0)
          .slice(0, 3) // Garantizar máximo 3 botones
      : [];

    return {
      historia: parteHistoria.trim(),
      opciones
    };
  };

  const procesarTurno = async (nuevoHistorial: MensajeHistorial[]) => {
    setCargando(true);
    setPantallaActual(null);

    try {
      const response = await fetch('/api/juego', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historial: nuevoHistorial }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Error al comunicarse con la API');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textoAcumulado = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textoAcumulado += decoder.decode(value, { stream: true });
        setPantallaActual(parsearTextoEnTiempoReal(textoAcumulado));
      }

      setHistorial([
        ...nuevoHistorial,
        { role: 'model', parts: [{ text: textoAcumulado }] }
      ]);

    } catch (error) {
      console.error('Error:', error);
      alert('Se produjo una anomalía en la conexión. Inténtalo de nuevo.');
    } finally {
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
        parts: [{ text: `Comienza una aventura con la temática: "${tematica}". Escribe la introducción y luego coloca exactamente la línea '---OPCIONES---' seguida de 3 opciones numeradas.` }] 
      }
    ];
    
    setHistorial(mensajeInicial);
    procesarTurno(mensajeInicial);
  };

  const elegirOpcion = (opcionSeleccionada: string) => {
    const nuevoHistorial: MensajeHistorial[] = [
      ...historial,
      { role: 'user', parts: [{ text: `El jugador elige la acción: "${opcionSeleccionada}". Continúa la historia y coloca al final la línea '---OPCIONES---' con las siguientes 3 opciones.` }] }
    ];
    
    setHistorial(nuevoHistorial);
    procesarTurno(nuevoHistorial);
  };

  const reiniciarPartida = () => {
    setEnJuego(false);
    setPantallaActual(null);
    setHistorial([]);
    setTematica('');
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
                placeholder="Ej: Cyberpunk oscuro, Fantasía medieval con dragones, Terror espacial..."
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
          
          /* PANTALLA DE JUEGO */
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
                <div className="text-base md:text-lg leading-relaxed text-slate-300 font-serif whitespace-pre-wrap">
                  {renderizarTextoConFormato(pantallaActual?.historia || '')} {/* 👈 Cambiado aquí */}
                  {cargando && (!pantallaActual?.opciones.length) && (
                    <span className="inline-block w-2.5 h-5 ml-1 bg-cyan-400 animate-pulse align-middle" />
                  )}
                </div>
              )}
            </div>

            {/* Contenedor de Opciones */}
            <div className="grid grid-cols-1 gap-4">
              {cargando && (!pantallaActual?.opciones || pantallaActual.opciones.length === 0) ? (
                <div className="text-center text-fuchsia-500 animate-pulse uppercase tracking-widest text-sm font-bold font-mono py-2">
                  Procesando posibles caminos...
                </div>
              ) : (
                pantallaActual?.opciones.map((opcion, index) => (
                  <button
                    key={index}
                    onClick={() => elegirOpcion(opcion)}
                    disabled={cargando}
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
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}