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

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.5-flash-lite',
      contents: historial,
      config: {
        systemInstruction:
          "Actúa como el Máster de una partida de rol interactiva.\n\n" +
          "REGLAS DE FORMATO Y EXTENSIÓN:\n" +
          "1. NARRACIÓN EXACTA DE 2 PÁRRAFOS: Escribe la historia dividida exactamente en 2 párrafos de unas 3 a 4 líneas cada uno:\n" +
          "   - Párrafo 1: Consecuencia inmediata de la acción y ambientación del entorno.\n" +
          "   - Párrafo 2: Conflicto, avance del evento y el dilema en el que queda el personaje.\n" +
          "2. No agregues preguntas finales (como '¿Qué decides?') ni opciones dentro de la historia.\n" +
          "3. No quiero que sea sexista, que hable de los dos géneros, a menos que sea intencional.\n" +
          "4. Al terminar los 2 párrafos, añade una línea con este separador exacto:\n" +
          "---OPCIONES---\n" +
          "5. En las siguientes 3 líneas, escribe exactamente 3 opciones numeradas (1., 2. y 3.), breves e interesantes.\n\n" +
          "IMPORTANTE: Respeta siempre el separador '---OPCIONES---'.",
      },
    });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of responseStream) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });

  } catch (error: any) {
    console.error("❌ ERROR EN STREAMING:", error);
    return NextResponse.json(
      { error: error?.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}