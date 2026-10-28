import { NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// ⏱️ Guardián de tiempo: Si una llamada tarda más de "ms", la corta y pasa al siguiente modelo
const conTimeout = (promesa: Promise<any>, ms: number) => {
  return Promise.race([
    promesa,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout de ${ms / 1000}s excedido`)), ms)
    ),
  ]);
};

export async function POST(request: Request) {
  try {
    const apiKeyPrivada = process.env.GEMINI_API_KEY;

    if (!apiKeyPrivada) {
      return NextResponse.json({ error: 'Falta la API Key en el servidor' }, { status: 500 });
    }

    const { historial } = await request.json();

    if (!historial || !Array.isArray(historial)) {
      return NextResponse.json({ error: 'El historial es requerido' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: apiKeyPrivada });

    const baseConfig = {
      responseMimeType: "application/json",
      maxOutputTokens: 600,
      responseSchema: {
        type: "OBJECT",
        properties: {
          historia: { 
            type: "STRING", 
            description: "Narración de EXACTAMENTE dos párrafos breves separados por '\\n\\n'. En el primer párrafo describe la causa y consecuencia del daño o alivio." 
          },
          opciones: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Exactamente 3 opciones de acción distintas con tono y riesgo impredecibles. Si el jugador muere o es el turno 8 final, array vacío []."
          },
          impacto_vida: {
            type: "INTEGER",
            description: "Leve (-5 a -10), Grave (-15 a -35), Recuperación (+5 a +20). Usa -100 ÚNICAMENTE si la acción provoca la muerte instantánea e irreversible del personaje."
          },
          texto_metrica: {
            type: "STRING",
            description: "Nombre conceptual de la métrica adaptada a la temática."
          }
        },
        required: ["historia", "opciones", "impacto_vida", "texto_metrica"]
      },
      systemInstruction:
        "Actúa como el Máster de una partida de rol interactiva, inmersiva y desafiante de 10 turnos.\n\n" +
        "REGLAS DE SISTEMA Y MECÁNICAS:\n" +
        "1. NOMBRE DE MÉTRICA FIJO: Define 'texto_metrica' en el primer turno según la temática (ej. 'Cordura', 'Romance', 'Salud', 'Oxígeno', 'Paciencia', 'Reputación') y mantén exactamente el mismo concepto durante toda la partida.\n" +
        "2. CALIBRACIÓN DE HOSTILIDAD SEGÚN EL GÉNERO:\n" +
        "   - Entornos letales, catástrofes o terror: El entorno es hostil; sobrevivir exige esfuerzo y las curaciones son moderadas (+5 a +10).\n" +
        "   - Escenarios sociales, diplomáticos o cotidianos: Las consecuencias son relacionales o emocionales; el tacto y el ingenio se premian proporcionalmente.\n" +
        "3. CURVA DRAMÁTICA EN 10 TURNOS (ESTRUCTURA DE 3 ACTOS):\n" +
        "   - Turnos 1 a 4 (Acto I - Planteamiento): Presentación del entorno y primeros desafíos. Consecuencias equilibradas.\n" +
        "   - Turnos 5 a 7 (Acto II - Escalada y Complicación): La situación se intensifica notablemente. El conflicto principal se complica, los riesgos aumentan y las decisiones erróneas o imprudentes se castigan con más severidad (-15 a -30).\n" +
        "   - Turnos 8 y 9 (Acto III - Clímax): Momento cumbre de máxima tensión o peligro. El margen de error es mínimo; se requieren decisiones audaces o sacrificios para llegar al final pero SIGUES ofreciendo 3 opciones.\n" +
        "   - Turno 10 (Desenlace Definitivo): Narra la conclusión final definitiva de la aventura basada en el estado de salud y las acciones previas. Devuelve 'opciones: []'.\n" +
        "4. INCERTIDUMBRE Y DESORDEN DE LAS 3 OPCIONES:\n" +
        "   - Prohibido asociar roles a los botones (la opción segura NUNCA debe estar siempre en la misma posición).\n" +
        "   - No todos los turnos ofrecen una salida fácil; en momentos de crisis, las tres opciones pueden suponer riesgos distintos.\n" +
        "   - Muerte súbita (-100): Solo si el jugador toma una decisión flagrantemente suicida o letal dentro de las leyes de ese mundo. En ese caso, narra la muerte/fracaso definitivo en el Párrafo 2 y devuelve 'opciones: []'.\n" +
        "5. FORMATO NARRATIVO: Exactamente 2 párrafos de 35 a 45 palabras cada uno, separados por '\\n\\n'. Lenguaje neutro e inclusivo en segunda persona a menos que se indique género."
    };

    // 🛡️ LISTA DE MODELOS CON RESPALDO (FALLBACK)
    const modelosConfig = [
      {
        model: 'gemini-3.5-flash-lite', // Opción 1: Ultra rápido y máxima cuota diaria
        config: { ...baseConfig },
      },
      {
        model: 'gemini-3.8-flash', // Opción 2: Respaldo de alta inteligencia con Thinking LOW
        config: {
          ...baseConfig,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      },
    ];

    let ultimoError = null;
    let juegoData = null;

    for (const { model, config } of modelosConfig) {
      try {
        // 🛡️ Si un modelo no responde en 12 segundos, lo cancela y salta al siguiente
        const response: any = await conTimeout(
          ai.models.generateContent({
            model,
            contents: historial,
            config,
          }),
          22000 // 22 segundos máximo por intento
        );

        if (response?.text) {
          juegoData = JSON.parse(response.text);
          break; // Éxito completo
        }
      } catch (err: any) {
        ultimoError = err;
        console.warn(`⚠️ [${model}] fallo o timeout (${err?.message || err?.status}). Probando siguiente...`);
        continue;
      }
    }

    if (!juegoData) {
      throw ultimoError || new Error('No se pudo generar una respuesta válida de la IA.');
    }

    return NextResponse.json(juegoData);

  } catch (error: any) {
    console.error("❌ ERROR INTERNO /api/juego:", error);
    const esSaturacion = error?.status === 503 || error?.status === 429;
    
    return NextResponse.json(
      { 
        error: esSaturacion 
          ? 'Los servidores de la red neuronal están saturados temporalmente. Por favor, pulsa reintentar.'
          : 'Se ha producido una interferencia en la transmisión con el Máster. Pulsa reintentar.'
      },
      { status: esSaturacion ? 503 : 500 }
    );
  }
}