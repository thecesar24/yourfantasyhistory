import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

// 1. Forzamos a Next.js a leer la clave del archivo .env.local manualmente
const apiKeyPrivada = process.env.GEMINI_API_KEY;

// 2. Inicializamos el SDK pasándole la clave directamente en su configuración
// ¡Así ya no dependemos de dónde la busque el SDK de forma automática!
const ai = new GoogleGenAI({ apiKey: apiKeyPrivada });

export async function POST(request: Request) {
  try {
    const { historial } = await request.json();

    if (!historial) {
      return NextResponse.json({ error: 'El historial es requerido' }, { status: 400 });
    }
    
    // Alerta de seguridad por si acaso:
    if (!apiKeyPrivada) {
      console.error("❌ ERROR CRÍTICO: Next.js sigue sin leer el archivo .env.local");
      return NextResponse.json({ error: 'Falta la API Key en el servidor' }, { status: 500 });
    }

    // El resto del código de ai.models.generateContent se queda EXACTAMENTE IGUAL...
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash', // 👈 ¡CAMBIA ESTA LÍNEA AQUÍ!
      contents: historial,
      systemInstruction: "Actúa como el Máster de una partida de rol interactiva. Tu objetivo es continuar la historia basándote en la temática inicial y en las decisiones posteriores que tome el jugador. Debes responder ÚNICAMENTE con un objeto JSON que tenga exactamente la estructura requerida de historia y opciones, sin texto introductorio ni bloques Markdown.",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            historia: { type: "STRING" },
            opciones: {
              type: "ARRAY",
              items: { type: "STRING" }
            }
          },
          required: ["historia", "opciones"]
        }
      }
    });

    const textoJSON = response.text;
    if (!textoJSON) return NextResponse.json({ error: 'Cuerpo vacío' }, { status: 500 });

    const juegoData = JSON.parse(textoJSON);
    return NextResponse.json(juegoData);

  } catch (error: any) {
      if (error.status === 503) {
      return NextResponse.json(
        { error: 'Los servidores de Google están saturados. Por favor, espera unos segundos y vuelve a pulsar el botón.' }, 
        { status: 503 } // 👈 Devolvemos un 503 limpio en lugar de un 500
      );
    }

    // Para cualquier otro error inesperado, dejamos el 500
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
