import { GeneratedSong } from "./tone-engine";

export async function generateMusicData(
  prompt: string, 
  genre: string, 
  additionalContext: string = ""
): Promise<GeneratedSong> {
  const response = await fetch("/api/music/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, genre, additionalContext })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate music");
  }
  
  return await response.json();
}

export async function transcribeAudioToSong(
  base64Audio: string, 
  mimeType: string,
  additionalContext: string = ""
): Promise<GeneratedSong> {
  const response = await fetch("/api/music/transcribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64Audio, mimeType, additionalContext })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to transcribe audio");
  }
  
  return await response.json();
}

export async function generateFromSolfa(
  solfaText: string, 
  genre: string,
  additionalContext: string = ""
): Promise<GeneratedSong> {
  const response = await fetch("/api/music/solfa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ solfaText, genre, additionalContext })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate from solfa");
  }
  
  return await response.json();
}
