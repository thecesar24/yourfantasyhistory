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
            description: "Exactamente 3 opciones de acción. Si el jugador muere o es el turno 8 final, array vacío []."
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
        "Actúa como el Máster de una partida de rol interactiva justa, emocionante y con consecuencias reales.\n\n" +
        "REGLAS DE SISTEMA Y DAÑO:\n" +
        "1. NOMBRE DE MÉTRICA FIJO: Define 'texto_metrica' en el primer turno (ej. 'Cordura', 'Afecto', 'Oxígeno', 'Salud') y mantén el mismo concepto durante toda la partida.\n" +
        "2. APERTURA ORGÁNICA (TURNO 1):\n" +
        "   - Si la temática planteada empieza en calma, exploración, misterio o romance (ej. una taberna, una cita, despertar en una base espacial tranquila), asigna 'impacto_vida: 0' y permite que el personaje arranque al 100% sin dolor físico forzado.\n" +
        "   - Solo asigna penalización inicial (-5 a -15) si la temática pide expresamente arrancar en plena catástrofe, naufragio, emboscada o huida ('in media res').\n" +
         "3. EQUILIBRIO Y RECOMPENSA (NO SEAS UN MÁSTER SÁDICO):\n" +
        "   - Prohibido encadenar turnos solo restando vida si el jugador juega con sentido común.\n" +
        "   - RECOMPENSA POSITIVA (+10 a +25): Si el jugador toma una decisión inteligente, prudente, empática, busca cobertura, descansa, cura sus heridas, aligera la tensión o resuelve un conflicto con ingenio, SUMA vida (+10 a +25) y describe en el Párrafo 1 la sensación reconfortante de alivio, éxito o recuperación.\n" +
        "   - DAÑO PROPORCIONAL: Solo resta vida si la decisión conlleva un fallo real, descuido o riesgo fallido:\n" +
        "     * Duda, torpeza o roce leve: resta de -5 a -10.\n" +
        "     * Error serio, imprudencia o herida grave: resta de -15 a -25.\n" +
        "     * Muerte súbita (-100): Exclusivamente ante un suicidio manifiesto o acto letal sin salida (describe la muerte definitiva en el Párrafo 2 y devuelve 'opciones: []').\n" +
        "4. DISEÑO DE LAS 3 OPCIONES: En cada turno, asegúrate de que entre las 3 opciones haya variedad:\n" +
        "   - Una opción arriesgada/audaz (alto riesgo, alta recompensa).\n" +
        "   - Una opción prudente/táctica (pensada para asegurar la situación o recuperar aliento/vida).\n" +
        "   - Una opción alternativa/creativa/diplomática.\n" +
        "5. FORMATO: Exactamente 2 párrafos de 35 a 45 palabras cada uno, separados por '\\n\\n'. Género neutro.\n" +
        "6. 8 TURNOS: Ofrece 3 opciones del turno 1 al 7 si sigue con vida. En el TURNO 8 y FINAL, concluye en 2 párrafos y devuelve 'opciones: []'."
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