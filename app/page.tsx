'use client';
import { useState } from 'react';

// Definición de tipos para TypeScript
interface MensajeHistorial {
  role: 'user' | 'model';
  parts: { text: string }[];
}

interface PantallaActual {
  historia: string;
  opciones: string[];
}

export default function JuegoRolPage() {
  // Estados requeridos
  const [tematica, setTematica] = useState<string>('');
  const [enJuego, setEnJuego] = useState<boolean>(false);
  const [pantallaActual, setPantallaActual] = useState<PantallaActual | null>(null);
  const [historial, setHistorial] = useState<MensajeHistorial[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);

  // Función genérica para enviar el historial a la API
  const procesarTurno = async (nuevoHistorial: MensajeHistorial[]) => {
    setCargando(true);
    try {
      const response = await fetch('/api/juego', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ historial: nuevoHistorial }),
      });

      if (!response.ok) {
        throw new Error('Error al comunicarse con la API');
      }

      const data: PantallaActual = await response.json();
      
      setPantallaActual(data);
      
      // Guardamos la respuesta del modelo en el historial para mantener el contexto
      setHistorial([
        ...nuevoHistorial,
        { role: 'model', parts: [{ text: JSON.stringify(data) }] }
      ]);
    } catch (error) {
      console.error('Error:', error);
      alert('Se produjo una anomalía en la red neuronal. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  };

  // Iniciar el juego
  const empezarJuego = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tematica.trim()) return;

    setEnJuego(true);
    
    // Primer mensaje del usuario definiendo la temática
    const mensajeInicial: MensajeHistorial[] = [
      { 
        role: 'user', 
        parts: [{ text: `Comienza una nueva aventura de rol con la siguiente temática: ${tematica}. Dame la introducción y 3 opciones.` }] 
      }
    ];
    
    setHistorial(mensajeInicial);
    procesarTurno(mensajeInicial);
  };

  // Manejar el clic en una opción
  const elegirOpcion = (opcionSeleccionada: string) => {
    const nuevoHistorial: MensajeHistorial[] = [
      ...historial,
      { role: 'user', parts: [{ text: `El jugador elige la siguiente acción: ${opcionSeleccionada}` }] }
    ];
    
    setHistorial(nuevoHistorial);
    procesarTurno(nuevoHistorial);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-cyan-50 font-sans selection:bg-fuchsia-900 flex flex-col items-center justify-center p-4">
      <div className="max-w-3xl w-full">
        
        {/* CABECERA */}
        <h1 className="text-4xl md:text-6xl font-bold text-center mb-8 tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-cyan-400 drop-shadow-[0_0_10px_rgba(192,38,211,0.5)]">
          YOUR FANTASY HISTORY
        </h1>

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
              className="w-full bg-gradient-to-r from-fuchsia-700 to-purple-800 hover:from-fuchsia-600 hover:to-purple-700 text-white p-4 rounded-lg font-bold uppercase tracking-[0.2em] transition-all hover:shadow-[0_0_20px_rgba(192,38,211,0.4)] active:scale-[0.98]"
            >
              Iniciar Conexión
            </button>
          </form>
        ) : (
          
          /* PANTALLA DE JUEGO */
          <div className="flex flex-col gap-8">
            {/* Contenedor de la Historia */}
            <div className="bg-slate-900/80 border-l-4 border-cyan-500 p-6 md:p-8 rounded-r-xl shadow-[0_0_20px_rgba(6,182,212,0.1)] min-h-[200px]">
              {cargando && !pantallaActual ? (
                <div className="flex items-center justify-center h-full text-cyan-500 animate-pulse font-mono">
                  Generando entorno virtual...
                </div>
              ) : (
                <p className="text-lg md:text-xl leading-relaxed text-slate-300 font-serif">
                  {pantallaActual?.historia}
                </p>
              )}
            </div>

            {/* Contenedor de Opciones */}
            <div className="grid grid-cols-1 gap-4">
              {cargando ? (
                <div className="text-center text-fuchsia-500 animate-pulse uppercase tracking-widest text-sm font-bold">
                  Procesando decisión...
                </div>
              ) : (
                pantallaActual?.opciones.map((opcion, index) => (
                  <button
                    key={index}
                    onClick={() => elegirOpcion(opcion)}
                    disabled={cargando}
                    className="group relative text-left bg-slate-900 border border-slate-800 hover:border-fuchsia-500 p-4 rounded-lg transition-all overflow-hidden disabled:opacity-50"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-300 ease-out" />
                    <span className="relative z-10 flex gap-4 items-center">
                      <span className="text-fuchsia-500 font-mono font-bold text-sm">
                        0{index + 1}
                      </span>
                      <span className="text-cyan-50 group-hover:text-white transition-colors">
                        {opcion}
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