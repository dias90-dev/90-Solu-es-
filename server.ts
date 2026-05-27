import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for base64 audio
app.use(express.json({ limit: '10mb' }));

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tempo: { type: Type.NUMBER },
    genre: { type: Type.STRING },
    tracks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          instrument: { type: Type.STRING, enum: ["melody", "bass", "drums", "viola", "violino", "marimba", "voz", "kora", "mbira", "guitar", "guitar_solo"] },
          notes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                note: { type: Type.STRING },
                duration: { type: Type.STRING },
                drum: { type: Type.STRING, enum: ["kick", "snare", "hihat", "openhat", "batuque", "sacarias", "djembe"] },
                solfeggio: { type: Type.STRING },
                lyric: { type: Type.STRING }
              },
              required: ["time"]
            }
          }
        },
        required: ["instrument", "notes"]
      }
    }
  },
  required: ["tempo", "genre", "tracks"]
};

// API routes
app.post("/api/music/generate", async (req, res) => {
  try {
    const { prompt, genre, additionalContext } = req.body;
    const hasLyrics = prompt.includes("LETRA:");
    
    const response = await getAiClient().models.generateContent({
      model: "gemini-1.5-pro",
      contents: `You are an expert AI music producer and composer. 
      Create an 8-bar musical track based on this prompt: "${prompt}" and genre: "${genre}".
      ${additionalContext || ""}
      
      ${hasLyrics ? "IMPORTANT: Use the provided lyrics in the 'LETRA' section for the 'voz' instrument tracks. Distribute the lyrics across the 8 bars naturally." : ""}
      
      Return a JSON object with:
      - tempo: number (e.g., 120)
      - genre: string
      - tracks: array of objects, each with 'instrument' (one of: 'melody', 'bass', 'drums', 'viola', 'violino', 'marimba', 'voz', 'kora', 'mbira', 'guitar', 'guitar_solo') and 'notes'.
      
      For melodic instruments (melody, bass, viola, violino, marimba, voz, kora, mbira, guitar, guitar_solo), 'notes' is an array of objects with:
      - time: string in "bars:beats:sixteenths" format (e.g., "0:0:0", "0:1:2", up to "7:3:3")
      - note: string (e.g., "C4", "E4", "G2")
      - duration: string (e.g., "8n", "16n", "4n")
      - solfeggio: optionally add the Tonic Sol-fa syllable (e.g., "Do", "Re", "Mi").
      - lyric: optionally add lyrics for the 'voz' instrument.
      
      For 'drums', 'notes' is an array of objects with:
      - time: string (e.g., "0:0:0")
      - drum: string ('kick', 'snare', 'hihat', 'openhat', 'batuque', 'sacarias', 'djembe')
      
      Make the composition musically coherent, in a specific key, with a good rhythm.
      For 'guitar_solo', use fast, expressive phrasing with bends and varied durations.
      Ensure the track is exactly 8 bars long (time goes from "0:0:0" to "7:3:3").
      Structure the 8 bars dynamically:
      - Bars 0-1: Intro (sparse, maybe just melody or hi-hats).
      - Bars 2-3: Main Beat (full drums, bass, melody).
      - Bars 4-5: Variation (change the drum pattern, add open hats, vary the melody).
      - Bars 6-7: Outro/Build-down (removing elements, ending on a strong note).
      Be creative! Use syncopation, interesting chord progressions (arpeggiated for melody), and a solid drum groove.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });
    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/music/transcribe", async (req, res) => {
  try {
    const { base64Audio, mimeType, additionalContext } = req.body;
    const response = await getAiClient().models.generateContent({
      model: "gemini-1.5-pro",
      contents: [
        { inlineData: { data: base64Audio, mimeType: mimeType } },
        { text: `Transcreva a melodia principal deste áudio.
${additionalContext || ""}
Crie um arranjo onde a trilha 'melody' seja a transcrição exata da voz/instrumento cantado ou tocado.
Inclua as notas musicais (ex: C4, D#4), duração (ex: '8n', '4n') e adicione OBRIGATORIAMENTE o campo 'solfeggio' para cada nota da melodia, contendo a sílaba Tônica Solfa correspondente (Dó, Ré, Mi, Fá, Sol, Lá, Si).
Sincronize o tempo no formato 'compasso:batida:semicolcheia' (ex: '0:0:0', '0:1:2'). 
Descubra o tempo (BPM) correto da música e use compasso 4/4.
Além da melodia transcrita, adicione uma bateria básica ('drums') e baixo ('bass') que acompanhem o ritmo da melodia transcrita.
Mantenha a música com pelo menos 4 a 8 compassos.` }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });
    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/music/solfa", async (req, res) => {
  try {
    const { solfaText, genre, additionalContext } = req.body;
    const response = await getAiClient().models.generateContent({
      model: "gemini-1.5-pro",
      contents: `Você é um maestro e arranjador musical especialista em corais e música africana.
O usuário forneceu a seguinte pauta em Tonic Sol-fa (solfejo):
"${solfaText}"

Seu objetivo é criar um arranjo musical completo de 4 a 8 compassos baseado nessa pauta para o estilo: "${genre}".
${additionalContext || ""}
Especialmente por se tratar de um "Gospel Coral Angolano", construa ricas harmonias a 4 vozes (Soprano, Contralto, Tenor, Baixo). 
- As vozes mais agudas (Soprano/Contralto) vão para a trilha 'melody' tocando notas simultâneas (acordes).
- As vozes graves (Tenor/Baixo) vão para a trilha 'bass'.
- IMPORTANTE: Para "Coro de Homens", use oitavas bem graves no geral (Tenor 1, Tenor 2, Barítono, Baixo). Para "Coro de Mulheres", use oitavas altas. Para "Mistos", use a extensão completa.
- Coloque a sílaba da Tônica Solfa no campo 'solfeggio' de cada nota principal.
- Crie um ritmo de bateria autêntico em 'drums' se apropriado para o gênero.
- A trilha deve seguir a progressão melódica do solfejo fornecido, preenchendo os tempos corretamente no compasso (compasso:batida:semicolcheia).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });
    res.json(JSON.parse(response.text!));
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
