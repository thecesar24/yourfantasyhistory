import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

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
      responseSchema: {
        type: "OBJECT",
        properties: {
          historia: { 
            type: "STRING", 
            description: "Narración de la escena dividida exactamente en 2 párrafos de unas 4 líneas cada uno." 
          },
          opciones: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "3 opciones posibles breves. Si es el final de la historia, debe ser un array vacío []."
          },
          impacto_vida: {
            type: "INTEGER",
            description: "Puntos que suma o resta esta situación (-35 a +15). Negativo si sufre daño o yerra, positivo si acierta, 0 si es neutro."
          },
          texto_metrica: {
            type: "STRING",
            description: "Nombre conceptual de la vida según la temática (ej: 'Paciencia de tu pareja', 'Cordura', 'Oxígeno', 'Salud')."
          }
        },
        required: ["historia", "opciones", "impacto_vida", "texto_metrica"]
      },
      systemInstruction:
        "Actúa como el Máster de una partida de rol interactiva con consecuencias reales.\n\n" +
        "REGLAS NARRATIVAS OBLIGATORIAS:\n" +
        "1. ESTRUCTURA DE EXACTAMENTE 2 PÁRRAFOS: Escribe el campo 'historia' con exactamente 2 párrafos de aproximadamente 4 líneas cada uno:\n" +
        "   - Párrafo 1: Consecuencia inmediata de la acción previa y ambientación sensorial del entorno.\n" +
        "   - Párrafo 2: Conflicto, avance del evento y el dilema o momento de tensión en el que queda el personaje.\n" +
        "2. GÉNERO NEUTRO E INCLUSIVO: Dirígete siempre a quien juega en segunda persona ('abres la puerta', 'observas', 'sientes'). Mantén un género neutro (usa fórmulas como 'te invade el cansancio' en vez de 'estás cansado/a', o 'en soledad' en vez de 'solo/a'), a menos que quien juegue especifique expresamente su género en la temática.\n" +
        "3. NO hagas preguntas reflexivas finales (como '¿Qué haces?') ni pongas opciones dentro del texto de la historia.\n" +
        "4. SISTEMA DE MÉTRICA DINÁMICA: Define en 'texto_metrica' qué mide la vida según la temática y mantén coherente ese concepto. Asigna en 'impacto_vida' un entero realista con las consecuencias de la acción.\n" +
        "5. CIERRE NARRATIVO: Si el mensaje indica que es el turno final, redacta el desenlace definitivo en 'historia' y devuelve 'opciones' como un array vacío []."
    };


    // 🛡️ LISTA DE MODELOS CON RESPALDO (FALLBACK)
    const modelos = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.6-flash-lite', 'gemini-3.7-flash', 'gemini-3.7-flash-lite', 'gemini-3.8-flash'];
    let response = null;
    let ultimoError = null;

    for (const model of modelos) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: historial,
          config,
        });
        if (response?.text) {
          break; // Éxito, salimos del bucle
        }
      } catch (err: any) {
        ultimoError = err;
        console.warn(`⚠️ Modelo ${model} no disponible (${err?.status || '503'}). Probando alternativa...`);
        if (err?.status !== 503 && err?.status !== 429) {
          throw err;
        }
      }
    }

    if (!response || !response.text) {
      throw ultimoError || new Error('Servidores de Google no disponibles.');
    }

    const juegoData = JSON.parse(response.text);
    return NextResponse.json(juegoData);

  } catch (error: any) {
    console.error("❌ ERROR FINAL EN /api/juego:", error);
    return NextResponse.json(
      { error: error?.message || 'Error interno del servidor' },
      { status: error?.status === 503 ? 503 : 500 }
    );
  }
}