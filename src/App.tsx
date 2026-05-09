import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Square, Loader2, Music, Wand2, Settings2, Volume2, Sliders, Upload, Undo, Redo, Download, Grid, Save, FolderOpen, FileAudio, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { toneEngine, GeneratedSong, exportWav } from './lib/tone-engine';
import { generateMusicData, transcribeAudioToSong, generateFromSolfa } from './lib/gemini';
import { cn } from './lib/utils';
import { Midi } from '@tonejs/midi';
import { auth, loginWithGoogle, logout, db } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

const GENRES = [
  // Mais tocados mundialmente
  "Pop",
  "Hip Hop",
  "R&B",
  "Reggaeton",
  "Afrobeats",
  "EDM",
  "House",
  "Trap",
  "Lo-Fi",
  "Ambient",
  // Gêneros de Angola e África
  "Kizomba",
  "Kuduro",
  "Amapiano",
  "Semba",
  "Rap Angolano",
  "Tarraxinha",
  "Afro House",
  // Gospel (Coral Angolano)
  "Gospel Coral Angolano (Misto)",
  "Gospel Coral Angolano (Coro de Homens)",
  "Gospel Coral Angolano (Coro de Mulheres)"
];

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [solfaText, setSolfaText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [song, setSong] = useState<GeneratedSong | null>(null);
  const [tempo, setTempo] = useState<number>(120);
  const [error, setError] = useState<string | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  
  const [reverbMix, setReverbMix] = useState(0.3);
  const [delayMix, setDelayMix] = useState(0.2);
  const [distMix, setDistMix] = useState(0);

  // History State for Undo/Redo
  interface AppState {
    prompt: string;
    genre: string;
    song: GeneratedSong | null;
    tempo: number;
    reverbMix: number;
    delayMix: number;
    distMix: number;
    customSamples: Record<string, string>;
  }
  const [history, setHistory] = useState<AppState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [customSamples, setCustomSamples] = useState<Record<string, string>>({});

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<{ credits: number, plan: string, lastResetWeek?: number } | null>(null);

  const [proInstruments, setProInstruments] = useState<string[]>([]);
  const [voiceSample, setVoiceSample] = useState<{ base64: string, mime: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);
          
          const currentWeek = Math.floor(Date.now() / (1000 * 60 * 60 * 24 * 7));
          
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email: currentUser.email,
              credits: 2,
              plan: 'free',
              lastResetWeek: currentWeek,
              createdAt: serverTimestamp()
            });
            setUserData({ credits: 2, plan: 'free', lastResetWeek: currentWeek });
          } else {
            const data = userSnap.data() as { credits: number, plan: string, lastResetWeek: number };
            if (data.plan === 'free' && data.lastResetWeek !== currentWeek) {
              await setDoc(userRef, { credits: 2, lastResetWeek: currentWeek }, { merge: true });
              setUserData({ ...data, credits: 2, lastResetWeek: currentWeek });
            } else {
              setUserData(data);
            }
          }
        } catch (err) {
          console.error("Error setting up user profile in db:", err);
        }
      } else {
        setUserData(null);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Initial state
    setHistory([{ prompt, genre, song, tempo, reverbMix, delayMix, distMix, customSamples }]);
    setHistoryIndex(0);
  }, []);

  const pushHistory = (newState: Partial<AppState>) => {
    setHistory(prev => {
      const curr = prev[historyIndex >= 0 ? historyIndex : 0];
      const next = { ...curr, ...newState };
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push(next);
      setHistoryIndex(newHist.length - 1);
      return newHist;
    });
  };

  const undo = () => {
    if (historyIndex > 0) {
      const state = history[historyIndex - 1];
      applyState(state);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const state = history[historyIndex + 1];
      applyState(state);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const applyState = (state: AppState) => {
    setPrompt(state.prompt);
    setGenre(state.genre);
    setReverbMix(state.reverbMix);
    setDelayMix(state.delayMix);
    setDistMix(state.distMix);
    setSong(state.song);
    setTempo(state.tempo || 120);
    setCustomSamples(state.customSamples);
    
    // Apply custom samples to toneEngine
    Object.entries(state.customSamples).forEach(([drum, url]) => {
      toneEngine.loadCustomSample(drum as any, url);
    });

    if (state.song) {
        toneEngine.loadSong(state.song);
        if (state.tempo) toneEngine.setTempo(state.tempo); // we will add this helper
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | undefined>(undefined);

  const drawVisualizer = () => {
    if (!canvasRef.current || !toneEngine.analyser) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const values = toneEngine.analyser.getValue();
    
    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#34d399"); // emerald-400
    gradient.addColorStop(1, "#06b6d4"); // cyan-500
    ctx.strokeStyle = gradient;
    
    for (let i = 0; i < values.length; i++) {
      const val = values[i] as number;
      const x = width * (i / (values.length - 1));
      const y = ((val + 1) / 2) * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    requestRef.current = requestAnimationFrame(drawVisualizer);
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(drawVisualizer);
    } else {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      // Draw flat line
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.beginPath();
          ctx.moveTo(0, canvasRef.current.height / 2);
          ctx.lineTo(canvasRef.current.width, canvasRef.current.height / 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#3f3f46";
          ctx.stroke();
        }
      }
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    if (toneEngine.reverb) toneEngine.reverb.wet.value = reverbMix;
  }, [reverbMix]);

  useEffect(() => {
    if (toneEngine.delay) toneEngine.delay.wet.value = delayMix;
  }, [delayMix]);

  useEffect(() => {
    if (toneEngine.distortion) toneEngine.distortion.wet.value = distMix;
  }, [distMix]);

  const handleSampleUpload = async (type: 'kick' | 'snare' | 'hihat' | 'openhat', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      await toneEngine.loadCustomSample(type, url);
      const newSamples = { ...customSamples, [type]: url };
      setCustomSamples(newSamples);
      pushHistory({ customSamples: newSamples });
    }
  };

  useEffect(() => {
    toneEngine.onBeat = (step) => {
      setCurrentStep(step);
    };
    return () => {
      toneEngine.onBeat = undefined;
    };
  }, []);

  const handleQuantize = () => {
    if (!song) return;
    const quantizedSong = {
      ...song,
      tracks: song.tracks.map(track => ({
        ...track,
        notes: track.notes.map(note => {
          const parts = note.time.split(':').map(Number);
          if (parts.length >= 2) {
            let bar = parts[0] || 0;
            let beat = parts[1] || 0;
            let sixteenth = parts[2] || 0;
            sixteenth = Math.round(sixteenth);
            if (sixteenth > 3) { sixteenth = 0; beat += 1; }
            if (beat > 3) { beat = 0; bar += 1; }
            return { ...note, time: `${bar}:${beat}:${sixteenth}` };
          }
          return note;
        })
      }))
    };
    setSong(quantizedSong);
    toneEngine.loadSong(quantizedSong);
    pushHistory({ song: quantizedSong });
  };

  const handleDownloadMidi = () => {
    if (!song) return;
    const midi = new Midi();
    midi.header.setTempo(song.tempo);
    
    song.tracks.forEach(track => {
      const midiTrack = midi.addTrack();
      midiTrack.name = track.instrument;
      
      track.notes.forEach(note => {
        const parts = note.time.split(':').map(Number);
        if (parts.length >= 2) {
          const bar = parts[0] || 0;
          const beat = parts[1] || 0;
          const sixteenth = parts[2] || 0;
          const ticks = (bar * 16 + beat * 4 + sixteenth) * (midi.header.ppq / 4);
          
          if (track.instrument === 'drums') {
            const drumPitches: Record<string, number> = { kick: 36, snare: 38, hihat: 42, openhat: 46 };
            midiTrack.addNote({
              midi: drumPitches[note.drum || 'kick'] || 36,
              ticks: ticks,
              durationTicks: midi.header.ppq / 4
            });
          } else {
            midiTrack.addNote({
              name: note.note || "C4",
              ticks: ticks,
              durationTicks: midi.header.ppq // 1 beat default
            });
          }
        }
      });
    });
    
    const blob = new Blob([midi.toArray()], { type: "audio/midi" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "90_batidas.mid";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadWav = async () => {
    if (!song) return;
    setIsExporting(true);
    try {
      const blob = await exportWav(song, { reverb: reverbMix, delay: delayMix, dist: distMix }, customSamples);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '90_batidas.wav';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Erro ao exportar WAV. Verifique o console para mais detalhes.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveToLocal = () => {
    if (!song) return;
    const dataToSave = {
      song,
      prompt,
      genre,
      reverbMix,
      delayMix,
      distMix,
      customSamples
    };
    localStorage.setItem('90batidas_saved_song', JSON.stringify(dataToSave));
    alert('Música salva no navegador com sucesso!');
  };

  const handleLoadFromLocal = () => {
    const saved = localStorage.getItem('90batidas_saved_song');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        setPrompt(data.prompt || '');
        setGenre(data.genre || GENRES[0]);
        setReverbMix(data.reverbMix || 0.3);
        setDelayMix(data.delayMix || 0.2);
        setDistMix(data.distMix || 0);
        setCustomSamples(data.customSamples || {});
        setSong(data.song);
        
        Object.entries(data.customSamples || {}).forEach(([drum, url]) => {
          toneEngine.loadCustomSample(drum as any, url as string);
        });
        
        if (data.song) {
          toneEngine.loadSong(data.song);
          
          const melodyTrack = data.song.tracks.find((t: any) => t.instrument === 'melody');
          if (melodyTrack) {
            setSolfaText(melodyTrack.notes.map((n: any) => n.solfeggio || n.note).join(' '));
          }
          
          pushHistory({ 
            song: data.song, 
            prompt: data.prompt, 
            genre: data.genre,
            reverbMix: data.reverbMix,
            delayMix: data.delayMix,
            distMix: data.distMix,
            customSamples: data.customSamples
          });
        }
      } catch (e) {
        console.error('Failed to load saved song', e);
        alert('Erro ao carregar a música salva.');
      }
    } else {
      alert('Nenhuma música salva encontrada.');
    }
  };

  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const debitCredit = async () => {
    if (!user || !userData) {
      setError("Você precisa estar logado para gerar música. Por favor, faça login clicando no botão acima.");
      return false;
    }
    if (userData.plan === 'pro') return true;
    if (userData.credits <= 0) {
      setShowUpgrade(true);
      return false;
    }
    try {
      const newCredits = userData.credits - 1;
      await setDoc(doc(db, 'users', user.uid), { credits: newCredits }, { merge: true });
      setUserData({ ...userData, credits: newCredits });
      return true;
    } catch (err: any) {
      console.error(err);
      setError("Erro ao verificar créditos. Tente novamente.");
      return false;
    }
  };

  const saveSongToFirebase = async (data: GeneratedSong, p: string, g: string) => {
    if (!user) return;
    try {
      const newSongRef = doc(db, 'songs', crypto.randomUUID());
      await setDoc(newSongRef, {
        ownerId: user.uid,
        title: g + ' - ' + new Date().toLocaleTimeString(),
        genre: g,
        tempo: data.tempo,
        prompt: p,
        songData: JSON.stringify(data),
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Error saving song:", e);
    }
  };

  const getProContext = () => {
    let ctx = "";
    if (proInstruments.length > 0) {
      ctx += `Por favor, inclua e arranje linhas para os seguintes instrumentos tradicionais adicionais: ${proInstruments.join(', ')}. Use-os para dar uma sonoridade local africana e arranjos ricos.\n`;
    }
    if (voiceSample) {
      ctx += `O usuário também ativou a "Sintetização de Voz" baseada em um sample gravado por ele. Use a trilha de instrumento 'voz' onde você criará notas que refletem os movimentos melódicos da voz. Se houver alguma letra implícita no audio ou se você quiser, use o campo 'lyric' para adicionar sílabas rítmicas.\n`;
    }
    return ctx;
  };

  const handleGenerate = async () => {
    if (!await debitCredit()) return;

    if (!prompt.trim()) {
      setError("Por favor, insira um prompt para gerar a música.");
      return;
    }
    
    setError(null);
    setIsGenerating(true);
    toneEngine.stop();
    setIsPlaying(false);
    setCurrentStep(0);

    try {
      await toneEngine.init();
      setIsEngineReady(true);
      
      const generatedData = await generateMusicData(prompt, genre, getProContext());
      setSong(generatedData);
      toneEngine.loadSong(generatedData);
      setTempo(generatedData.tempo);
      
      const melodyTrack = generatedData.tracks.find(t => t.instrument === 'melody');
      if (melodyTrack) {
        setSolfaText(melodyTrack.notes.map(n => n.solfeggio || n.note).join(' '));
      }

      pushHistory({ song: generatedData, prompt, genre, tempo: generatedData.tempo });
      await saveSongToFirebase(generatedData, prompt, genre);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao gerar música. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleTranscribeAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!await debitCredit()) return;

    const file = e.target.files?.[0];
    if (!file) return;
    
    setError(null);
    setIsGenerating(true);
    toneEngine.stop();
    setIsPlaying(false);
    setCurrentStep(0);
    
    try {
      await toneEngine.init();
      setIsEngineReady(true);
      
      const buffer = await file.arrayBuffer();
      let base64 = '';
      const bytes = new Uint8Array(buffer);
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        base64 += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      base64 = btoa(base64);
      
      const generatedData = await transcribeAudioToSong(base64, file.type, getProContext());
      setSong(generatedData);
      toneEngine.loadSong(generatedData);
      setTempo(generatedData.tempo);
      
      const melodyTrack = generatedData.tracks.find(t => t.instrument === 'melody');
      if (melodyTrack) {
        setSolfaText(melodyTrack.notes.map(n => n.solfeggio || n.note).join(' '));
      }

      pushHistory({ song: generatedData, tempo: generatedData.tempo });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao transcrever o áudio. Tente novamente.");
    } finally {
      setIsGenerating(false);
      e.target.value = '';
    }
  };

  const handleGenerateFromSolfa = async () => {
    if (!await debitCredit()) return;

    if (!solfaText.trim()) {
      setError("Por favor, digite ou gere uma Pauta Tonic Sol-fa primeiro.");
      return;
    }
    
    setError(null);
    setIsGenerating(true);
    toneEngine.stop();
    setIsPlaying(false);
    setCurrentStep(0);

    try {
      await toneEngine.init();
      setIsEngineReady(true);
      
      const generatedData = await generateFromSolfa(solfaText, genre, getProContext());
      setSong(generatedData);
      toneEngine.loadSong(generatedData);
      setTempo(generatedData.tempo);
      pushHistory({ song: generatedData, genre, tempo: generatedData.tempo });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falha ao gerar música a partir da pauta. Tente novamente.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleVoiceSampleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setVoiceSample({ base64, mime: file.type });
    };
    reader.readAsDataURL(file);
  };

  const toggleProInstrument = (inst: string) => {
    setProInstruments(prev => 
      prev.includes(inst) ? prev.filter(i => i !== inst) : [...prev, inst]
    );
  };

  const PRO_INSTRUMENTS_LIST = ['viola', 'violino', 'batuque', 'sacarias', 'marimba'];

  const handleTempoChange = (newTempo: number) => {
    setTempo(newTempo);
    if (song) {
      const updatedSong = { ...song, tempo: newTempo };
      setSong(updatedSong);
      toneEngine.loadSong(updatedSong); // reload uses the new tempo
      if (isPlaying) toneEngine.play();
    }
  };

  const togglePlay = async () => {
    if (!isEngineReady) {
      await toneEngine.init();
      setIsEngineReady(true);
    }
    
    if (isPlaying) {
      toneEngine.pause();
      setIsPlaying(false);
    } else {
      toneEngine.play();
      setIsPlaying(true);
    }
  };

  const stopPlayback = () => {
    toneEngine.stop();
    setIsPlaying(false);
    setCurrentStep(0);
  };

  const totalSteps = useMemo(() => {
    if (!song) return 16;
    let maxBar = 0;
    song.tracks.forEach(track => {
      track.notes.forEach(note => {
        const bar = parseInt(note.time.split(':')[0]);
        if (bar > maxBar) maxBar = bar;
      });
    });
    return (maxBar + 1) * 16;
  }, [song]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-[0_0_15px_rgba(52,211,153,0.5)]">
              <Music className="w-5 h-5 text-zinc-950" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500">
              90 Batidas
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2 text-zinc-400 hidden sm:flex">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Motor Gemini 3.1 Pro
            </span>
            {user && userData ? (
              <div className="flex items-center gap-3">
                {userData.plan === 'pro' ? (
                  <span className="px-2 py-1 bg-gradient-to-r from-amber-500 to-amber-300 text-amber-950 text-xs font-bold rounded-md shadow-sm">
                    PRO
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-xs font-medium">Créditos: {userData.credits}</span>
                    <button 
                      onClick={() => setShowUpgrade(true)}
                      className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-xs font-semibold rounded-md border border-zinc-700 transition"
                    >
                      UPGRADE
                    </button>
                  </div>
                )}
                <span className="text-zinc-300 font-medium truncate max-w-[120px]">{user.email}</span>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-lg transition-colors border border-zinc-700 hover:border-red-500/30"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                className="px-4 py-1.5 text-sm font-semibold bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors shadow-md"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Sidebar - Controls */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Wand2 className="w-5 h-5 text-emerald-400" />
              Estúdio de Prompt
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                  Vibe Musical / Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="ex: Uma batida rápida e energética com uma linha de baixo marcante e hi-hats sincopados..."
                  className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none transition-all placeholder:text-zinc-600"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                  Gênero
                </label>
                <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {GENRES.map(g => (
                    <button
                      key={g}
                      onClick={() => setGenre(g)}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-medium transition-all border flex-grow sm:flex-grow-0 text-center",
                        genre === g 
                          ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.2)]" 
                          : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {userData?.plan === 'pro' && (
                <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">
                      Instrumentos Tradicionais (PRÓ)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {PRO_INSTRUMENTS_LIST.map(inst => (
                        <button
                          key={inst}
                          onClick={() => toggleProInstrument(inst)}
                          className={cn(
                            "px-3 py-1 rounded-md text-xs font-medium border transition-colors capitalize",
                            proInstruments.includes(inst)
                              ? "bg-amber-500/20 border-amber-500/50 text-amber-400"
                              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                          )}
                        >
                          {inst}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-500 uppercase tracking-wider mb-2 flex justify-between">
                      <span>Clonagem de Voz (PRÓ)</span>
                      {voiceSample && <span className="text-emerald-400 text-xs">Ativado ✓</span>}
                    </label>
                    <label className="w-full py-2 px-3 bg-zinc-950 hover:bg-zinc-900 text-zinc-300 rounded-lg text-xs font-medium transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer border border-amber-500/30 hover:border-amber-500/50">
                      <span className="truncate">{voiceSample ? 'Trocar amostra de voz' : 'Upload de voz para sintetizar (.wav, .mp3)'}</span>
                      <input 
                        type="file" 
                        accept="audio/*" 
                        className="hidden" 
                        onChange={handleVoiceSampleUpload}
                      />
                    </label>
                  </div>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white rounded-xl font-semibold shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sintetizando...
                  </>
                ) : (
                  <>
                    <Music className="w-5 h-5" />
                    Gerar Faixa
                  </>
                )}
              </button>

              <button
                onClick={handleGenerate}
                disabled={isGenerating || !song}
                className="w-full py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-semibold transition-all shadow-lg border border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                <>
                    <Settings2 className="w-4 h-4 text-emerald-400" />
                    Rearranjar (Recriar batida)
                </>
              </button>

              <label className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-semibold shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer border border-zinc-700">
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Lendo Áudio...
                  </>
                ) : (
                  <>
                    <FileAudio className="w-5 h-5 text-fuchsia-400" />
                    Descobrir Notas/Solfejo (Áudio)
                  </>
                )}
                <input type="file" accept="audio/*,video/*" className="hidden" disabled={isGenerating} onChange={handleTranscribeAudio} />
              </label>

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}
            </div>
          </div>

          {/* Solfejo Studio */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm mt-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-fuchsia-400" />
              Pauta Em Tonic Sol-fa
            </h2>
            <div className="space-y-4">
              <textarea 
                 value={solfaText}
                 onChange={e => setSolfaText(e.target.value)}
                 className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-300 min-h-[100px] focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 resize-none font-mono placeholder:text-zinc-600"
                 placeholder="Digite ou carregue áudio para ver a pauta em Tonic Sol-fa (ex: d r m f s l t d')..."
              />

              <button
                onClick={handleGenerateFromSolfa}
                disabled={isGenerating || !solfaText.trim()}
                className="w-full py-3 px-4 bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:from-fuchsia-500 hover:to-purple-500 text-white rounded-xl font-semibold shadow-[0_0_20px_rgba(192,38,211,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sintetizando...
                  </>
                ) : (
                  <>
                    <Music className="w-5 h-5" />
                    Tocar / Gerar Arranjo desta Pauta
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Efeitos de Áudio */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm mt-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-emerald-400" />
              Efeitos em Tempo Real
            </h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Reverb</span>
                  <span>{Math.round(reverbMix * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={reverbMix} onChange={e => setReverbMix(parseFloat(e.target.value))} onMouseUp={() => pushHistory({ reverbMix })} onTouchEnd={() => pushHistory({ reverbMix })} className="w-full accent-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Delay</span>
                  <span>{Math.round(delayMix * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={delayMix} onChange={e => setDelayMix(parseFloat(e.target.value))} onMouseUp={() => pushHistory({ delayMix })} onTouchEnd={() => pushHistory({ delayMix })} className="w-full accent-emerald-500" />
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Distorção</span>
                  <span>{Math.round(distMix * 100)}%</span>
                </div>
                <input type="range" min="0" max="1" step="0.01" value={distMix} onChange={e => setDistMix(parseFloat(e.target.value))} onMouseUp={() => pushHistory({ distMix })} onTouchEnd={() => pushHistory({ distMix })} className="w-full accent-emerald-500" />
              </div>
            </div>
          </div>

          {/* Samples Customizados */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm mt-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Upload className="w-5 h-5 text-emerald-400" />
              Samples Customizados
            </h2>
            <div className="space-y-3">
              {(['kick', 'snare', 'hihat', 'openhat'] as const).map(drum => (
                <div key={drum} className="flex items-center justify-between bg-zinc-950 p-2 rounded-lg border border-zinc-800">
                  <span className="text-xs font-medium text-zinc-300 uppercase w-20">{drum}</span>
                  <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs py-1 px-3 rounded transition-colors">
                    Carregar
                    <input type="file" accept="audio/*" className="hidden" onChange={e => handleSampleUpload(drum, e)} />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Area - Visualizer & Transport */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Audio Visualizer */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 shadow-xl backdrop-blur-sm h-32 relative overflow-hidden flex items-center justify-center">
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={100} 
              className="w-full h-full opacity-80"
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-zinc-600 text-xs font-medium uppercase tracking-widest">Aguardando Áudio</span>
              </div>
            )}
          </div>

          {/* Transport Controls */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-4 flex items-center justify-between shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-4">
              <button
                onClick={togglePlay}
                disabled={!song || isGenerating}
                className="w-12 h-12 rounded-full bg-zinc-100 text-zinc-900 flex items-center justify-center hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              >
                {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-1" />}
              </button>
              <button
                onClick={stopPlayback}
                disabled={!song || isGenerating}
                className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center hover:bg-zinc-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Square className="w-4 h-4" />
              </button>
              
              <div className="h-8 w-px bg-zinc-800 mx-2 hidden sm:block" />
              
              <div className="flex flex-col min-w-[80px]">
                <span className="text-xs text-zinc-500 uppercase font-medium tracking-wider flex justify-between">
                  <span>Tempo</span>
                  <span className="text-emerald-400 font-mono">{tempo}</span>
                </span>
                <input
                  type="range"
                  min="60"
                  max="240"
                  value={tempo}
                  onChange={(e) => handleTempoChange(parseInt(e.target.value))}
                  disabled={!song}
                  className="w-24 mt-1 accent-emerald-500 cursor-pointer disabled:opacity-50"
                  onMouseUp={() => pushHistory({ tempo })}
                  onTouchEnd={() => pushHistory({ tempo })}
                />
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={undo} disabled={historyIndex <= 0} className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors" title="Desfazer">
                <Undo className="w-5 h-5" />
              </button>
              <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors" title="Refazer">
                <Redo className="w-5 h-5" />
              </button>
              <div className="h-6 w-px bg-zinc-800 mx-1" />
              <button onClick={handleQuantize} disabled={!song} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50" title="Quantizar (Ajustar ao Grid)">
                Quantizar
              </button>
              <div className="h-6 w-px bg-zinc-800 mx-1" />
              <button onClick={handleSaveToLocal} disabled={!song} className="p-2 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors" title="Salvar no Navegador">
                <Save className="w-5 h-5" />
              </button>
              <button onClick={handleLoadFromLocal} className="p-2 text-zinc-400 hover:text-white transition-colors" title="Carregar do Navegador">
                <FolderOpen className="w-5 h-5" />
              </button>
              <div className="h-6 w-px bg-zinc-800 mx-1" />
              <button onClick={handleDownloadMidi} disabled={!song || isExporting} className="p-2 text-emerald-400 hover:text-emerald-300 disabled:opacity-30 transition-colors flex items-center gap-1 text-xs font-semibold" title="Baixar MIDI">
                <Download className="w-4 h-4" /> MIDI
              </button>
              <button onClick={handleDownloadWav} disabled={!song || isExporting} className="p-2 text-emerald-400 hover:text-emerald-300 disabled:opacity-30 transition-colors flex items-center gap-1 text-xs font-semibold" title="Baixar WAV">
                {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileAudio className="w-4 h-4" />} WAV
              </button>
            </div>
          </div>

          {/* Sequencer / Visualizer */}
          <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm min-h-[400px] relative flex flex-col">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 shrink-0">
              <Settings2 className="w-5 h-5 text-cyan-400" />
              Visualizador de Sequência
            </h2>

            {!song ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                <Music className="w-12 h-12 mb-4 opacity-20" />
                <p>Gere uma faixa para ver a sequência</p>
              </div>
            ) : (
              <div className="flex-1 overflow-x-auto pb-4 custom-scrollbar">
                <div className="space-y-4 relative min-w-max" style={{ width: `${totalSteps * 1.5}rem` }}>
                  {/* Playhead */}
                  <motion.div 
                    className="absolute top-0 bottom-0 w-0.5 bg-white/50 z-10 shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    animate={{ left: `${(currentStep / totalSteps) * 100}%` }}
                    transition={{ type: "tween", ease: "linear", duration: 0.1 }}
                  />

                  {/* Tracks */}
                  {(['melody', 'bass', 'drums'] as const).map((instrument) => {
                    const track = song.tracks.find(t => t.instrument === instrument);
                    const colorClass = 
                      instrument === 'melody' ? 'bg-fuchsia-500' : 
                      instrument === 'bass' ? 'bg-cyan-500' : 'bg-emerald-500';
                    
                    return (
                      <div key={instrument} className="relative">
                        <div className="sticky left-0 flex items-center justify-between mb-2 bg-zinc-900/80 backdrop-blur-sm z-20 w-max pr-4">
                          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                            {instrument === 'melody' ? 'Melodia' : instrument === 'bass' ? 'Baixo' : 'Bateria'}
                          </span>
                        </div>
                        
                        {/* Grid */}
                        <div className="h-16 bg-zinc-950 border border-zinc-800/50 rounded-lg relative flex">
                          {Array.from({ length: totalSteps }).map((_, i) => {
                            const isBeat = i % 4 === 0;
                            const isBar = i % 16 === 0;
                            return (
                              <div key={i} className={cn(
                                "flex-1 border-r relative",
                                isBar ? "border-zinc-700/50" : isBeat ? "border-zinc-800/50" : "border-zinc-800/20",
                                "last:border-0"
                              )}>
                                {/* Render notes that fall on this step */}
                                {track?.notes.map((note, idx) => {
                                  // Parse time like "0:1:2" -> bar:beat:sixteenth
                                  const parts = note.time.split(':');
                                  if (parts.length >= 2) {
                                    const bar = parseInt(parts[0]);
                                    const beat = parseInt(parts[1]);
                                    const sixteenth = parts.length === 3 ? parseInt(parts[2]) : 0;
                                    const absoluteStep = (bar * 16) + (beat * 4) + sixteenth;
                                    
                                    if (absoluteStep === i) {
                                      return (
                                        <motion.div
                                          key={idx}
                                          initial={{ scale: 0.8, opacity: 0 }}
                                          animate={{ scale: 1, opacity: 1 }}
                                          className={cn(
                                            "absolute top-1 bottom-1 left-0.5 right-0.5 rounded-sm opacity-80",
                                            colorClass,
                                            currentStep === i && isPlaying ? "opacity-100 shadow-[0_0_15px_currentColor]" : ""
                                          )}
                                          title={note.solfeggio ? `${note.solfeggio} (${note.note})` : note.note || note.drum}
                                        >
                                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white/90 overflow-hidden truncate px-0.5">
                                            {note.solfeggio || note.note || note.drum}
                                          </span>
                                        </motion.div>
                                      );
                                    }
                                  }
                                  return null;
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="w-full bg-zinc-950 border-t border-zinc-900 py-6 text-center text-xs text-zinc-500">
        <div className="flex justify-center gap-6 mb-2">
          <button onClick={() => setShowTerms(true)} className="hover:text-emerald-400 transition-colors">Termos de Uso</button>
          <button onClick={() => setShowPrivacy(true)} className="hover:text-emerald-400 transition-colors">Política de Privacidade</button>
        </div>
        <p>&copy; 2026 90 Batidas Musical. Todos os direitos reservados.</p>
      </footer>

      {showTerms && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">Termos de Uso</h2>
            <div className="space-y-4 text-sm text-zinc-300">
              <p>Ao utilizar o 90 Batidas, você concorda que: </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>A geração de música e arranjos tem fins de entretenimento, educação e/ou experimentação musical (gratuitamente) e comerciais (no modo Pró).</li>
                <li>Você retém os direitos autorais de toda composição ou voz original que submeter à plataforma. No entanto, o motor de áudio sintético baseia-se em inteligência artificial e os samples gerados podem requerer interpretações legais dependendo da sua finalidade comercial.</li>
                <li>Qualquer abuso do sistema ou fraude de créditos implicará na suspensão imediata da sua conta.</li>
                <li>O serviço é fornecido "no estado em que se encontra" (as-is), sem garantias implicadas. O histórico de faixas criadas pode ser apagado se violar as nossas condições de uso.</li>
                <li>O modo Pró confere acesso a um sintetizador exclusivo baseado em seus arquivos vocais diretos, sem marca d'água de áudio.</li>
              </ul>
            </div>
            <button onClick={() => setShowTerms(false)} className="mt-6 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium">Fechar</button>
          </div>
        </div>
      )}

      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">Política de Privacidade</h2>
            <div className="space-y-4 text-sm text-zinc-300">
              <p>Sua privacidade é crítica e respeitada no 90 Batidas:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Dados que coletamos: Email, histórico de prompts musicais inseridos, e gravações temporárias necessárias para a geração e descoberta de notas por IA limitadas sob demanda.</li>
                <li>Bancos de dados: Utilizamos o Cloud Firestore Enterprise para segurança e armazenamento descentralizado e seguro das informações da sua conta. </li>
                <li>Nós NÃO utilizamos o áudio de usuários do plano Pró para treinar modelos abertos (publicly available models). Seus arquivos gerados no plano Pró permanecem protegidos sob uma infraestrutura cifrada.</li>
                <li>Você tem o direito inalienável ao esquecimento. A qualquer momento, você pode realizar a exclusão dos seus dados pela aba da conta (processo sob os moldes da LGPD / GDPR).</li>
              </ul>
            </div>
            <button onClick={() => setShowPrivacy(false)} className="mt-6 w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium">Fechar</button>
          </div>
        </div>
      )}

      {showUpgrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-amber-500/50 rounded-2xl p-6 max-w-sm w-full relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10 blur-xl">
              <Music className="w-32 h-32 text-amber-500" />
            </div>
            
            <h2 className="text-2xl font-bold text-amber-400 mb-2 drop-shadow-md">Plano PRÓ</h2>
            <p className="text-sm text-zinc-300 mb-6">
              Integração completa e ilimitada. Você alcançou o seu limite de créditos no plano grátis.
            </p>

            <ul className="space-y-3 mb-8">
              <li className="flex items-start gap-2 text-sm text-zinc-200">
                <div className="mt-0.5 min-w-4 text-emerald-400">✓</div>
                <span>Gravação da própria voz para sintetizar composições personalizadas que refletem sua afinação real</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-200">
                <div className="mt-0.5 min-w-4 text-emerald-400">✓</div>
                <span>Exportação com direitos comerciais totais</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-200">
                <div className="mt-0.5 min-w-4 text-emerald-400">✓</div>
                <span>Acesso ilimitado à AI generativa musical e arranjos corais angolanos avançados</span>
              </li>
            </ul>

            <button 
              onClick={() => {
                alert("Redirecionando para Stripe... (Em Breve)");
                setShowUpgrade(false);
              }}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(245,158,11,0.4)]"
            >
              Assinar Agora
            </button>
            <button onClick={() => setShowUpgrade(false)} className="mt-4 w-full text-xs text-zinc-500 hover:text-white transition-colors">
              Talvez depois
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

