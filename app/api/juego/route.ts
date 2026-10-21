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
      systemInstruction:
        "Actúa como el Máster de una partida de rol interactiva.\n\n" +
        "REGLAS DE FORMATO Y ESTILO:\n" +
        "1. NARRACIÓN BREVE Y ÁGIL: Escribe como máximo 1 o 2 párrafos cortos (máximo 80-100 palabras en total). Ve directo a la acción y a las consecuencias inmediatas, sin descripciones excesivamente largas.\n" +
        "2. Al terminar el relato, añade una línea con este separador exacto:\n" +
        "---OPCIONES---\n" +
        "3. Escribe exactamente 3 opciones de acción numeradas (1., 2. y 3.), breves y directas.\n\n" +
        "IMPORTANTE: No omitas nunca la línea '---OPCIONES---'.",
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