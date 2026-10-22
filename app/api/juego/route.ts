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

    const config = {
      responseMimeType: "application/json",
      maxOutputTokens: 1500, // 👈 Margen amplio para que NUNCA se corte el JSON
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MINIMAL, // 👈 Apaga el razonamiento lento en la serie 3 (evita los 25s de espera)
      },
      responseSchema: {
        type: "OBJECT",
        properties: {
          historia: { 
            type: "STRING", 
            description: "Narración de EXACTAMENTE dos párrafos breves separados por '\\n\\n'. Cada párrafo debe tener entre 35 y 45 palabras." 
          },
          opciones: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Exactamente 3 opciones de acción distintas. Si y solo si es el turno final 8, array vacío []."
          },
          impacto_vida: {
            type: "INTEGER",
            description: "Impacto numérico entre -30 y +15. Nunca uses 0 salvo irrelevancia total."
          },
          texto_metrica: {
            type: "STRING",
            description: "Nombre conceptual de la métrica."
          }
        },
        required: ["historia", "opciones", "impacto_vida", "texto_metrica"]
      },
      systemInstruction:
        "Actúa como el Máster de una partida de rol interactiva.\n\n" +
        "REGLAS:\n" +
        "1. EXACTAMENTE 2 PÁRRAFOS: Tu campo 'historia' DEBE contener exactamente 2 párrafos separados por '\\n\\n'. Cada párrafo de 35 a 45 palabras.\n" +
        "2. 8 TURNOS OBLIGATORIOS: Prohibido terminar la partida antes del Turno 8. Del turno 1 al 7 ofrece siempre exactamente 3 opciones.\n" +
        "3. MÉTRICA VIVA: Si comete un error, incomoda o yerra, resta entre -10 y -35. Si acierta o conecta, suma entre +5 y +15.\n" +
        "4. GÉNERO NEUTRO: Segunda persona neutra a menos que se indique género.\n" +
        "5. CIERRE: En el TURNO 8 y FINAL, concluye en 2 párrafos y devuelve 'opciones' como []."
    };

    // 🛡️ LISTA DE MODELOS CON RESPALDO (FALLBACK)
    const modelos = [
      'gemini-3.5-flash-lite', // ⚡ El más rápido de la plataforma (~350 tokens/s)
      'gemini-3.6-flash',      // ⚖️ Muy rápido, gran estabilidad
      'gemini-3.8-flash',      // 🧠 Máxima riqueza narrativa
      'gemini-flash-latest',   // 🔄 Respaldo dinámico oficial de Google
    ];

    let ultimoError = null;
    let juegoData = null;

    for (const model of modelos) {
      try {
        // 🛡️ Si un modelo no responde en 12 segundos, lo cancela y salta al siguiente
        const response: any = await conTimeout(
          ai.models.generateContent({
            model,
            contents: historial,
            config,
          }),
          12000 // 12 segundos máximo por intento
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