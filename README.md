# 🧙‍♂️ Your Fantasy History — RPG AI Master

Una aplicación web **Fullstack** interactiva que actúa como un Máster de juego de rol autónomo. El proyecto genera narrativas dinámicas y opciones de toma de decisiones en tiempo real utilizando Inteligencia Artificial, sin necesidad de almacenar datos en una base de datos externa gracias a la gestión de estados en memoria.

## 🚀 Tecnologías Utilizadas

*   **Frontend:** React 19 (TypeScript) con Tailwind CSS para una interfaz inmersiva de estilo oscuro/cyberpunk.
*   **Backend & API REST:** Next.js (App Router) actuando como servidor seguro intermediario.
*   **Inteligencia Artificial:** SDK oficial de Google Gen AI (`@google/genai`) conectado al modelo **Gemini 3.8 Flash**.

## 📡 Arquitectura de la API REST y Flujo de Datos

El núcleo del aprendizaje de este proyecto se centra en la arquitectura de red y el consumo seguro de endpoints utilizando el protocolo HTTP:

Usa el código con precaución.
[Cliente: React] ──(Petición POST + Historial)──> [Servidor: Next.js API REST] ──(Inyección API Key Secure)──> [Google Gemini API]
▲                                                                                                          │
└──────────────────────────────(Devuelve Objeto JSON Estructurado)─────────────────────────────────────────┘

1.  **Seguridad en Backend:** Para evitar la exposición de la API Key privada (con formato de autenticación seguro `AQ.`) en el navegador del cliente, la interfaz de React nunca se comunica directamente con Google. En su lugar, realiza una petición interna `POST` a nuestro endpoint local `/api/juego`.
2.  **Persistencia del Contexto en Memoria (Serverless):** Al no disponer de base de datos, toda la memoria conversacional de la partida se acumula en un estado dinámico de React (`useState`) y se envía íntegra como un array estructurado de mensajes (`input`) en cada turno.
3.  **Esquema de Respuesta Estricto (JSON Schema):** Se configuró la API utilizando la propiedad `responseMimeType: "application/json"` junto a un objeto de validación estructurado (`responseSchema`) para forzar a la IA a devolver exclusivamente un objeto con las propiedades `historia` (string) y `opciones` (array de strings), asegurando que la interfaz nunca sufra fallos de renderizado.

## 🛠️ Desafíos Técnicos Superados (Aprendizaje de Infraestructura)

*   **Tolerancia a fallos de Red (Manejo del Error 503 / 500):** Se experimentaron e implementaron capturas en el bloque `catch` del servidor para mitigar los picos de alta demanda de la capa gratuita de Google, evitando el colapso del sistema y devolviendo códigos de estado HTTP limpios y descriptivos hacia el cliente.
*   **Mitigación de la Latencia en LLMs:** Se analizó el cuello de botella que supone la carga síncrona completa en peticiones REST cuando se trabaja con formatos estructurados (con picos de latencia de hasta 30 segundos debido a la baja prioridad de tráfico), comprendiendo la necesidad teórica de arquitecturas basadas en Streaming (Server-Sent Events) para entornos productivos reales.

## 🏃‍♂️ Instalación y Uso en Local

1. Clona el repositorio:
   ```bash
   git clone https://github.com
   ```
2. Instala las dependencias necesarias de Next.js y el SDK de Google:
   ```bash
   npm install
   ```
3. Crea un archivo `.env.local` en la raíz del proyecto y añade tu credencial de Google AI Studio:
   ```env
   GEMINI_API_KEY=Tu_Clave_Privada_Aqui
   ```
4. Arranca el servidor de desarrollo:
   ```bash
   npm run dev
   ```
5. Abre `http://localhost:3000` en tu navegador para iniciar la conexión.