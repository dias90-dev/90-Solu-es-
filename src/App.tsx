import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Square, Loader2, Music, Wand2, Settings2, Volume2, Sliders, Upload, Undo, Redo, Download, Grid, Save, FolderOpen, FileAudio, BookOpen, X, Heart, HelpCircle, Mic, Sparkles, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toneEngine, GeneratedSong, exportWav } from './lib/tone-engine';
import { generateMusicData, transcribeAudioToSong, generateFromSolfa } from './lib/gemini';
import { cn } from './lib/utils';
import { StudioMode } from './components/StudioMode';
import { Midi } from '@tonejs/midi';
import { auth, loginWithGoogle, logout, db, loginAnonymously } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

function HelpTooltip({ content }: { content: string }) {
  const [show, setShow] = useState(false);
  return (
    <div 
      className="relative flex items-center inline-block ml-2"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      <HelpCircle className="w-3.5 h-3.5 text-zinc-500 hover:text-emerald-400 cursor-pointer transition-colors" />
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-200 shadow-xl pointer-events-none"
          >
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-800 border-b border-r border-zinc-700 rotate-45" />
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountModal({ isOpen, onClose, user, userData }: { isOpen: boolean, onClose: () => void, user: User | null, userData: { plan: string, credits: number } | null }) {
  if (!isOpen || !user || !userData) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-6">Minha Conta</h2>
          
          <div className="space-y-6">
            <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-800">
              <p className="text-sm text-zinc-400 mb-1">Email Registrado</p>
              <p className="text-zinc-200 font-medium">{user.email}</p>
            </div>

            <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-800 flex justify-between items-center">
              <div>
                <p className="text-sm text-zinc-400 mb-1">Plano Atual</p>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs font-bold rounded-md ${userData.plan === 'pro' ? 'bg-gradient-to-r from-amber-500 to-amber-300 text-amber-950 shadow-sm' : 'bg-zinc-700 text-zinc-300'}`}>
                    {userData.plan === 'pro' ? 'PRO' : 'FREE'}
                  </span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-zinc-400 mb-1">Créditos</p>
                <p className="text-2xl font-bold text-emerald-400">{userData.plan === 'pro' ? 'Ilimitado' : userData.credits}</p>
              </div>
            </div>

            {userData.plan !== 'pro' && (
              <div className="bg-amber-950/30 border border-amber-900/50 p-4 rounded-xl">
                <h3 className="text-amber-400 font-medium mb-2 text-sm flex items-center gap-2">
                  <Wand2 className="w-4 h-4" />
                  Quer gerar mais músicas?
                </h3>
                <p className="text-xs text-zinc-400 mb-4">Adquira o plano PRO para exportações ilimitadas, ferramentas de voz avançadas e muito mais.</p>
                <button 
                  onClick={() => {
                    const event = new CustomEvent('openUpgradeModal');
                    window.dispatchEvent(event);
                    onClose();
                  }}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-400 text-amber-950 font-bold text-sm rounded-lg hover:from-amber-400 hover:to-amber-300 transition-colors"
                >
                  Fazer Upgrade para PRO
                </button>
              </div>
            )}

            <div className="border-t border-zinc-800 pt-6">
              <h3 className="text-white font-medium mb-2 flex items-center gap-2">
                <Heart className="w-4 h-4 text-pink-500" />
                Apoie o Projeto
              </h3>
              <p className="text-xs text-zinc-400 mb-3">Seu apoio nos ajuda a manter a plataforma gratuita e desenvolver novos recursos IA.</p>
              <button 
                onClick={() => {
                  const event = new CustomEvent('openDonationModal');
                  window.dispatchEvent(event);
                  onClose();
                }}
                className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium text-sm rounded-lg transition-colors"
              >
                Fazer uma Doação
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ... Monetization Component
function MonetizationModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="p-6 md:p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center flex-shrink-0">
              <Heart className="w-6 h-6 text-zinc-900" fill="currentColor" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Apoie o Projeto</h2>
              <p className="text-zinc-400 text-sm">Ajude a manter a plataforma online e 100% gratuita</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-900/50 shadow-[0_0_15px_rgba(52,211,153,0.05)] relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-[50px] pointer-events-none" />
              <h3 className="font-semibold text-emerald-400 mb-2 flex items-center gap-2">
                🇦🇴 Angola (Multicaixa Express)
              </h3>
              <p className="text-zinc-300 text-sm font-mono bg-zinc-900/80 p-2 rounded selectable">IBAN: AO06.0040.0000.8932.1234.56</p>
              <p className="text-zinc-400 text-xs mt-2">Titular: African Composer Pro App</p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
              <h3 className="font-semibold text-emerald-300 mb-2 flex items-center gap-2">
                🇧🇷 Brasil (PIX)
              </h3>
              <p className="text-zinc-300 text-sm font-mono bg-zinc-900/80 p-2 rounded selectable">Chave PIX (E-mail): apoiar@africancomposer.com</p>
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800/50">
              <h3 className="font-semibold text-cyan-400 mb-2 flex items-center gap-2">
                💵 Internacional (USD / EUR / Cripto)
              </h3>
              <div className="flex gap-2">
                <a href="https://paypal.com" target="_blank" rel="noreferrer" className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-center py-2 rounded-lg text-sm text-zinc-300 transition-colors border border-zinc-800">
                  PayPal (USD/EUR)
                </a>
                <a href="https://buymeacoffee.com" target="_blank" rel="noreferrer" className="flex-1 bg-zinc-900 hover:bg-zinc-800 text-center py-2 rounded-lg text-sm text-amber-500 transition-colors border border-zinc-800">
                  Buy Me a Coffee
                </a>
              </div>
            </div>
            <p className="text-xs text-zinc-500 text-center mt-6">
              Para doações em 🥇 Ouro ou Criptomoedas, entre em contato através das nossas redes sociais.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  // Novos estilos solicitados expressamente
  "Criolo (Kizomba/Funaná/Coladeira)",
  "Pimba/Fado Português (Mais Tocados PT)",
  "Funk Brasileiro",
  "Samba Brasileiro",
  "Rap Adegão",
  // Gospel (Coral Angolano)
  "Gospel Coral Angolano (Misto)",
  "Gospel Coral Angolano (Coro de Homens)",
  "Gospel Coral Angolano (Coro de Mulheres)"
];

const CHORD_PROGRESSIONS = [
  { id: "none", name: "Dinamizar por IA (Livre)", progression: "Determinado dinamicamente pela IA", description: "Deixa a inteligência artificial escolher o melhor caminho harmônico." },
  { id: "i-iv-v-i", name: "Kizomba Clássica (i-iv-v-i)", progression: "Am - Dm - Em - Am", description: "Progressão menor tradicional, nostálgica e cadenciada, perfeita para Kizomba, Semba e Criolo." },
  { id: "i-VII-v-VI", name: "Zouk / Criolo Suave (i-VII-v-VI)", progression: "Am - G - Em - F", description: "Melódica e sensual, usada em Kizomba moderna, Coladeira e Tarraxinha." },
  { id: "I-V-vi-IV", name: "Afrobeats / Pop Moderno (I-V-vi-IV)", progression: "C - G - Am - F", description: "Grande, otimista, alegre e contagiante. Padrão universal para sucessos globais." },
  { id: "ii-V-I-VI", name: "Samba Bossa Nova (ii-V-I-VI)", progression: "Dm7 - G7 - Cmaj7 - A7", description: "Cadência jazzista e sofisticada com tensões harmônicas ricas do Samba e Bossa." },
  { id: "I-bVII-bVI-V", name: "Fado / Andaluz (I-bVII-bVI-V)", progression: "Am - G - F - E", description: "Progressão romântica-melancólica clássica do fado português e caboverdiano." },
  { id: "i-VI-III-VII", name: "Rap Adegão / Beat de Rua (i-VI-III-VII)", progression: "Am - F - C - G", description: "Acordes sombrios e épiços, perfeitos para linhas líricas marcantes do Rap Adegão de Lisboa." },
  { id: "I-IV-V-IV", name: "Funaná Criolo / Festa (I-IV-V-IV)", progression: "C - F - G - F", description: "Progressão maior rápida de festa típica do criolo de Cabo Verde." },
  { id: "Funk-Rep", name: "Repetição de Tônica (Funk Tamborzão)", progression: "Am (Um único acorde rítmico)", description: "Variação rítmica intensa sem troca harmônica para máxima batida e dança do Funk." }
];

const DRUM_PAD_LAYERS = [
  { id: 'kick', name: 'Bumbo / Kick 🥁', color: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] text-zinc-950 font-bold' },
  { id: 'snare', name: 'Caixa / Snare 🥁', color: 'bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)] text-zinc-950 font-bold' },
  { id: 'hihat', name: 'Hi-Hat 🔔', color: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)] text-zinc-950 font-bold' },
  { id: 'openhat', name: 'Hi-Hat Aberto 💽', color: 'bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)] text-zinc-950 font-bold' },
  { id: 'batuque', name: 'Batuque 🪘', color: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)] text-zinc-950 font-bold' },
  { id: 'djembe', name: 'Djembe 🪘', color: 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)] text-zinc-950 font-bold' }
];

const KUDURO_VARIETIES = [
  { name: "Lamento", description: "Melodias melancólicas e lamentos nostálgicos sobre a batida de Kuduro energética." },
  { name: "Clássico", description: "O ritmo original cru e robusto direto das pistas de Luanda nos anos 90." },
  { name: "Electrónico", description: "Sintetizadores robóticos progressivos rápidos e elementos techno-house." },
  { name: "Arrepiado", description: "Percussões rápidas e variações aceleradas intensas com bumbos pesados." },
  { name: "Amoroso", description: "Kuduro rítmico com cadência leve e mensagens românticas cativantes." }
];

export default function App() {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [selectedChordProgression, setSelectedChordProgression] = useState("none");
  const [kuduroVariety, setKuduroVariety] = useState("Lamento");
  const [solfaText, setSolfaText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [editorBar, setEditorBar] = useState(0);
  const [song, setSong] = useState<GeneratedSong | null>(null);
  const [tempo, setTempo] = useState<number>(120);
  const [error, setError] = useState<string | null>(null);
  const [isEngineReady, setIsEngineReady] = useState(false);
  
  const [reverbMix, setReverbMix] = useState(0.3);
  const [delayMix, setDelayMix] = useState(0.2);
  const [distMix, setDistMix] = useState(0);
  const [synthPreset, setSynthPresetState] = useState<string>('Padrão');

  interface CustomPreset {
    name: string;
    reverb: number;
    delay: number;
    dist: number;
    synth: string;
  }
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('90batidas_custom_presets');
    if (saved) {
      try { setCustomPresets(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  useEffect(() => {
    toneEngine.setSynthPreset(synthPreset);
  }, [synthPreset, isEngineReady]);

  useEffect(() => {
    // Recomendar automaticamente progressão de acordes autêntica para o gênero
    if (genre === "Criolo (Kizomba/Funaná/Coladeira)") {
      setSelectedChordProgression("i-VII-v-VI");
    } else if (genre === "Samba Brasileiro") {
      setSelectedChordProgression("ii-V-I-VI");
    } else if (genre === "Pimba/Fado Português (Mais Tocados PT)") {
      setSelectedChordProgression("I-bVII-bVI-V");
    } else if (genre === "Funk Brasileiro") {
      setSelectedChordProgression("Funk-Rep");
    } else if (genre === "Rap Adegão") {
      setSelectedChordProgression("i-VI-III-VII");
    } else if (genre === "Kizomba" || genre === "Semba") {
      setSelectedChordProgression("i-iv-v-i");
    }
  }, [genre]);

  // History State for Undo/Redo
  interface AppState {
    prompt: string;
    genre: string;
    song: GeneratedSong | null;
    tempo: number;
    reverbMix: number;
    delayMix: number;
    distMix: number;
    synthPreset: string;
    customSamples: Record<string, string>;
  }
  const [history, setHistory] = useState<AppState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [customSamples, setCustomSamples] = useState<Record<string, string>>({});

  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<{ credits: number, plan: string, lastResetWeek?: number } | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.error("Google login failed, falling back:", err);
      const isIframeErr = err && (
        err.code === "auth/network-request-failed" ||
        err.message?.includes("network-request-failed") ||
        err.message?.includes("Pending promise was never set") ||
        err.message?.includes("auth/popup-blocked")
      );
      if (isIframeErr) {
        setAuthError("Nota: O login Google foi bloqueado pelas políticas de iframe/cross-origin do navegador. Iniciando login automático como Convidado (Guest)!");
        setTimeout(async () => {
          try {
            await loginAnonymously();
            setAuthError(null);
          } catch (anonErr: any) {
            console.error("Anonymous fallback failed:", anonErr);
            setError("Não foi possível conectar como convidado: " + anonErr.message);
          }
        }, 1500);
      } else {
        setError("Erro de autenticação Google: " + err.message);
      }
    }
  };

  const handleGuestLogin = async () => {
    setAuthError(null);
    try {
      await loginAnonymously();
    } catch (err: any) {
      console.error("Guest login failed:", err);
      setError("Erro ao autenticar como convidado: " + err.message);
    }
  };

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
          const isGuest = currentUser.isAnonymous;
          const isAdmin = currentUser.email === 'dias90kk@gmail.com';
          const isProUser = isGuest || isAdmin;
          
          if (!userSnap.exists()) {
            const newPlan = isProUser ? 'pro' : 'free';
            await setDoc(userRef, {
              email: currentUser.email || 'anonymous-guest@example.com',
              credits: isProUser ? 100 : 2,
              plan: newPlan,
              lastResetWeek: currentWeek,
              createdAt: serverTimestamp()
            });
            setUserData({ credits: isProUser ? 100 : 2, plan: newPlan, lastResetWeek: currentWeek });
          } else {
            const data = userSnap.data() as { credits: number, plan: string, lastResetWeek: number };
            if (isProUser && data.plan !== 'pro') {
              await setDoc(userRef, { plan: 'pro', credits: 100 }, { merge: true });
              setUserData({ ...data, plan: 'pro', credits: 100 });
            } else if (data.plan === 'free' && data.lastResetWeek !== currentWeek) {
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
    setHistory([{ prompt, genre, song, tempo, reverbMix, delayMix, distMix, synthPreset, customSamples }]);
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
    setSynthPresetState(state.synthPreset || 'Padrão');
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
    ctx.lineWidth = 3;
    
    // Add moving gradient
    const time = Date.now() * 0.002;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, `hsl(${(time * 40) % 360}, 100%, 65%)`); 
    gradient.addColorStop(1, `hsl(${((time * 40) + 90) % 360}, 100%, 50%)`);
    ctx.strokeStyle = gradient;
    
    // Add cool shadow glow
    ctx.shadowBlur = 12 + Math.sin(time * 5) * 4;
    ctx.shadowColor = gradient as any;
    
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
    
    // reset shadow
    ctx.shadowBlur = 0;
    
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

  const toggleDrumStep = (drumType: string, colIndex: number) => {
    if (!song) return;

    // Trigger visual/audio feedback click
    toneEngine.triggerDrumPreview(drumType);

    const step = (editorBar * 16) + colIndex;
    const timeStr = `${editorBar}:${Math.floor(colIndex / 4)}:${colIndex % 4}`;

    let updatedTracks = [...song.tracks];
    let drumTrackIdx = updatedTracks.findIndex(t => t.instrument === 'drums');

    if (drumTrackIdx === -1) {
      updatedTracks.push({
        instrument: 'drums',
        notes: []
      });
      drumTrackIdx = updatedTracks.length - 1;
    }

    const drumTrack = updatedTracks[drumTrackIdx];
    const notes = [...drumTrack.notes];

    const existingIdx = notes.findIndex(n => {
      const parts = n.time.split(':');
      if (parts.length >= 2) {
        const b = parseInt(parts[0], 10);
        const bt = parseInt(parts[1], 10);
        const s = parts.length === 3 ? parseInt(parts[2], 10) : 0;
        const absStep = (b * 16) + (bt * 4) + s;
        return absStep === step && n.drum === drumType;
      }
      return false;
    });

    if (existingIdx !== -1) {
      notes.splice(existingIdx, 1);
    } else {
      notes.push({
        time: timeStr,
        drum: drumType as any,
        duration: '16n'
      });
    }

    updatedTracks[drumTrackIdx] = {
      ...drumTrack,
      notes: notes
    };

    const updatedSong = { ...song, tracks: updatedTracks };
    setSong(updatedSong);
    toneEngine.loadSong(updatedSong);
    if (isPlaying) {
      toneEngine.play();
    }
    pushHistory({ song: updatedSong });
  };

  const clearDrumTrack = () => {
    if (!song) return;
    let updatedTracks = [...song.tracks];
    const drumTrackIdx = updatedTracks.findIndex(t => t.instrument === 'drums');
    if (drumTrackIdx !== -1) {
      updatedTracks[drumTrackIdx] = {
        ...updatedTracks[drumTrackIdx],
        notes: []
      };
      const updatedSong = { ...song, tracks: updatedTracks };
      setSong(updatedSong);
      toneEngine.loadSong(updatedSong);
      if (isPlaying) toneEngine.play();
      pushHistory({ song: updatedSong });
    }
  };

  const applyDrumPreset = (presetName: 'kizomba' | 'funana' | 'funk' | 'samba' | 'rap') => {
    if (!song) return;

    let updatedTracks = [...song.tracks];
    let drumTrackIdx = updatedTracks.findIndex(t => t.instrument === 'drums');
    if (drumTrackIdx === -1) {
      updatedTracks.push({
        instrument: 'drums',
        notes: []
      });
      drumTrackIdx = updatedTracks.length - 1;
    }

    // Set notes based on preset
    const newNotes: any[] = [];
    const totalBars = Math.max(1, totalSteps / 16);

    for (let bar = 0; bar < totalBars; bar++) {
      const addNoteAt = (stepInBar: number, drumType: string) => {
        newNotes.push({
          time: `${bar}:${Math.floor(stepInBar / 4)}:${stepInBar % 4}`,
          drum: drumType as any,
          duration: '16n'
        });
      };

      if (presetName === 'kizomba') {
        const kicks = [0, 6, 8, 14];
        const snares = [3, 11];
        const hihats = [0, 2, 4, 6, 8, 10, 12, 14];
        const batuques = [2, 10];
        kicks.forEach(k => addNoteAt(k, 'kick'));
        snares.forEach(s => addNoteAt(s, 'snare'));
        hihats.forEach(h => addNoteAt(h, 'hihat'));
        batuques.forEach(b => addNoteAt(b, 'batuque'));
      } else if (presetName === 'funana') {
        const kicks = [0, 4, 8, 12];
        const snares = [2, 6, 10, 14];
        const hihats = [1, 3, 5, 7, 9, 11, 13, 15];
        kicks.forEach(k => addNoteAt(k, 'kick'));
        snares.forEach(s => addNoteAt(s, 'snare'));
        hihats.forEach(h => addNoteAt(h, 'hihat'));
      } else if (presetName === 'funk') {
        const kicks = [0, 8, 10, 12];
        const snares = [4, 6, 12, 14];
        const hihats = [0, 2, 4, 6, 8, 10, 12, 14];
        kicks.forEach(k => addNoteAt(k, 'kick'));
        snares.forEach(s => addNoteAt(s, 'snare'));
        hihats.forEach(h => addNoteAt(h, 'hihat'));
      } else if (presetName === 'samba') {
        const kicks = [0, 4, 8, 12];
        const snares = [2, 6, 10, 14];
        const hihats = [0, 2, 4, 6, 8, 10, 12, 14];
        const djembe = [1, 3, 5, 7, 9, 11, 13, 15];
        kicks.forEach(k => addNoteAt(k, 'kick'));
        snares.forEach(s => addNoteAt(s, 'snare'));
        hihats.forEach(h => addNoteAt(h, 'hihat'));
        djembe.forEach(d => addNoteAt(d, 'djembe'));
      } else if (presetName === 'rap') {
        const kicks = [0, 2, 8, 11];
        const snares = [4, 12];
        const hihats = [0, 2, 4, 6, 8, 10, 12, 14];
        kicks.forEach(k => addNoteAt(k, 'kick'));
        snares.forEach(s => addNoteAt(s, 'snare'));
        hihats.forEach(h => addNoteAt(h, 'hihat'));
      }
    }

    updatedTracks[drumTrackIdx] = {
      ...updatedTracks[drumTrackIdx],
      notes: newNotes
    };

    const updatedSong = { ...song, tracks: updatedTracks };
    setSong(updatedSong);
    toneEngine.loadSong(updatedSong);
    if (isPlaying) toneEngine.play();
    pushHistory({ song: updatedSong });
  };

  const handleCreateBlankSong = () => {
    const blankSong: GeneratedSong = {
      tempo: 120,
      genre: "Customizado",
      tracks: [
        {
          instrument: 'drums',
          notes: []
        }
      ]
    };
    setSong(blankSong);
    toneEngine.loadSong(blankSong);
    pushHistory({ song: blankSong });
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
  const [showAccountModal, setShowAccountModal] = useState(false);

  useEffect(() => {
    const handleOpenUpgrade = () => setShowUpgrade(true);
    const handleOpenDonation = () => setIsDonationModalOpen(true);
    
    window.addEventListener('openUpgradeModal', handleOpenUpgrade);
    window.addEventListener('openDonationModal', handleOpenDonation);
    
    return () => {
      window.removeEventListener('openUpgradeModal', handleOpenUpgrade);
      window.removeEventListener('openDonationModal', handleOpenDonation);
    };
  }, []);

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

    // Process Singer Profile choices
    const finalGender = vocalGender === 'aleatorio'
      ? ['masculino', 'feminino'][Math.floor(Math.random() * 2)]
      : vocalGender;

    const finalAccent = vocalAccent === 'aleatorio'
      ? ['angola', 'mozambique', 'portugal', 'brazil'][Math.floor(Math.random() * 4)]
      : vocalAccent;

    ctx += `\nPERFIL DO CANTOR (IMPORTANTE):
- Gênero de Voz Solista: ${finalGender === 'masculino' ? 'Voz Masculina (Tenor/Barítono)' : 'Voz Feminina (Soprano/Contralto)'}.
- Sotaque e Origem Linguística: Português de ${
      finalAccent === 'angola' ? 'Angola (Luanda, incluindo gírias locais como kamba, mboa, kuia, copo, bazuca, etc.)' :
      finalAccent === 'mozambique' ? 'Moçambique (Maputo, incluindo gírias como maningue nice, marrabenta, cantada fluida, ritmada)' :
      finalAccent === 'portugal' ? 'Portugal (sotaque europeu clássico, estilo fado melódico expressivo, termos como miúdo, giro)' :
      'Brasil (sotaque brasileiro, bossa, samba, pop contemporâneo, gírias como massa, guri, show, cadenciada)'
    }.
- O arranjo lírico da trilha 'voz' (campo 'lyric' das notas) DEVE seguir obrigatoriamente a prosódia, o ritmo clássico e as gírias do país de origem selecionado para dar máxima autenticidade. 
- Vantagem/Vibe Acústica: ${vocalVantage}. O andamento e as variações melódicas da voz devem refletir esta vantagem de produção acústica.\n`;

    // Process selected chord progression
    const chosenProg = CHORD_PROGRESSIONS.find(p => p.id === selectedChordProgression);
    if (chosenProg && chosenProg.id !== "none") {
      ctx += `\nPROGRESSÃO DE ACORDES OBRIGATÓRIA (MUITO IMPORTANTE):
- Utilize rigorosamente a progressão de acordes correspondente a: ${chosenProg.name} (${chosenProg.progression}).
- Descrição da Cadência Harmônica: ${chosenProg.description}.
- A trilha de melodia ('melody'), o baixo ('bass'), e outras linhas harmônicas/trilhas de instrumentos DEVEM basear as suas notas na escala e acordes desta progressão ao longo dos 8 compassos (estilo loop/progressão de 2 ou 4 compassos repetidos).
- Certifique-se de que a cadência soe fluida, bonita, expressiva e perfeitamente sintonizada.\n`;
    }

    return ctx;
  };

  const [activeTab, setActiveTab] = useState<'create' | 'explore' | 'library'>('create');
  const [useCustomLyrics, setUseCustomLyrics] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [vibe, setVibe] = useState("");
  const [isStudioMode, setIsStudioMode] = useState(false);

  // Prompt validation states
  const [promptValidationError, setPromptValidationError] = useState<string | null>(null);
  const [showValidationPromptConfirm, setShowValidationPromptConfirm] = useState<boolean>(false);

  // Singer profile states
  const [vocalGender, setVocalGender] = useState<'masculino' | 'feminino' | 'aleatorio'>('aleatorio');
  const [vocalAccent, setVocalAccent] = useState<'angola' | 'mozambique' | 'portugal' | 'brazil' | 'aleatorio'>('aleatorio');
  const [vocalVantage, setVocalVantage] = useState<string>("Saturação Quente Analógica");

  const ADVANTAGES = [
    "Saturação Quente Analógica",
    "Auto-Tune Cristalino",
    "Eco de Fita Réplica (+25% Delay)",
    "Reverberação de Catedral Ativa",
    "Chorus Duplo e Stereo Widening",
    "Brilho de Microfone Valvulado Vintage (+12dB Brilho)",
    "Vibrato Quente e Dinâmico",
    "Double-Tracking de Coro (+1 Voz Auxiliar)",
    "Compressão de Estádio (Presença Máxima)"
  ];

  const handleRandomizeVocalProfile = () => {
    const genders: ('masculino' | 'feminino')[] = ['masculino', 'feminino'];
    const accents: ('angola' | 'mozambique' | 'portugal' | 'brazil')[] = ['angola', 'mozambique', 'portugal', 'brazil'];
    
    const randomGender = genders[Math.floor(Math.random() * genders.length)];
    const randomAccent = accents[Math.floor(Math.random() * accents.length)];
    const randomVantage = ADVANTAGES[Math.floor(Math.random() * ADVANTAGES.length)];

    setVocalGender(randomGender);
    setVocalAccent(randomAccent);
    setVocalVantage(randomVantage);
    toneEngine.setVocalProfile(randomGender, randomAccent, randomVantage);
  };

  useEffect(() => {
    toneEngine.setVocalProfile(vocalGender, vocalAccent, vocalVantage);
  }, [vocalGender, vocalAccent, vocalVantage]);

  const VIBES = ["Religioso", "Calm", "Energetic", "Happy", "Sad", "Dark", "Epic", "Lo-fi", "Romantic"];

  const handleRecordingMixing = async (blob: Blob, processingStyle: 'Dry' | 'Warm' | 'Echo' = 'Dry') => {
    if (!song) return;
    setIsGenerating(true);
    setError(null);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = reader.result as string;
          resolve(base64.split(',')[1]);
        };
      });
      reader.readAsDataURL(blob);
      const base64Audio = await base64Promise;

      // Update the vocal processing style in ToneEngine
      toneEngine.setVocalProcessingStyle(processingStyle);

      let transcriptionContext = "Transcreva esta voz para um novo track de instrumento 'voz'. Tente manter o tempo e ritmo da música atual.";
      if (processingStyle === 'Warm') {
        transcriptionContext += " O estilo é Warm: adicione harmônicas quentes e uma linha vocal bem encorpada.";
      } else if (processingStyle === 'Echo') {
        transcriptionContext += " O estilo é Echo: deixe espaço para eco, espaçando as notas e criando repetições.";
      }

      const transcribedSong = await transcribeAudioToSong(base64Audio, "audio/webm", transcriptionContext);
      
      // Merge tracks
      const vozTrack = transcribedSong.tracks.find(t => t.instrument === 'voz');
      if (vozTrack) {
        const updatedTracks = [...song.tracks.filter(t => t.instrument !== 'voz'), vozTrack];
        const newSong = { ...song, tracks: updatedTracks };
        setSong(newSong);
        toneEngine.loadSong(newSong);
        alert("Sua voz foi processada e integrada à música!");
      } else {
        alert("A IA não conseguiu identificar uma linha melódica clara na gravação.");
      }
    } catch (err: any) {
      console.error(err);
      setError("Falha ao processar STUDIO RECORDING: " + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const validatePromptText = (text: string): { valid: boolean; reason: 'short' | 'generic' | null } => {
    const trimmed = text.trim();
    if (!trimmed) return { valid: true, reason: null }; 
    
    if (trimmed.length < 15) {
      return { valid: false, reason: 'short' };
    }
    
    const genericWords = [
      "musica", "música", "som", "batida", "teste", "gerar", "song", "music", "make", "create", "beat", 
      "kizomba", "kuduro", "afrobeats", "rap", "gospel", "coral", "cantor", "voz", "instrumental", "rapido", "rápido", 
      "devagar", "lento", "legal", "nova", "canção", "cancao", "ritmo", "melodia", "criar", "fazer", "pro", "composer", "african"
    ];
    const words = trimmed.toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_\`~()]/g, "")
      .split(/\s+/)
      .filter(w => w.length > 0);
      
    if (words.length > 0 && words.every(w => genericWords.includes(w))) {
      return { valid: false, reason: 'generic' };
    }
    
    return { valid: true, reason: null };
  };

  const triggerGenerate = async (bypassValidation = false) => {
    if (!bypassValidation && !useCustomLyrics) {
      const validation = validatePromptText(prompt);
      if (!validation.valid) {
        setPromptValidationError(
          validation.reason === 'short' 
            ? "O seu prompt é muito curto. Prompts detalhados geram músicas bem melhores!" 
            : "O seu prompt é muito genérico (contém apenas palavras comuns como 'musica', 'batida'). Adicione detalhes para obter uma música incrível e economizar seus créditos de IA!"
        );
        setShowValidationPromptConfirm(true);
        return;
      }
    }
    
    setPromptValidationError(null);
    setShowValidationPromptConfirm(false);
    await handleGenerate();
  };

  const handleGenerate = async () => {
    if (!await debitCredit()) return;

    if (!prompt.trim() && !useCustomLyrics) {
      setError("Por favor, insira um prompt ou use o modo customizado com letras.");
      return;
    }
    
    setError(null);
    setIsGenerating(true);
    toneEngine.stop();
    setIsPlaying(false);
    setCurrentStep(0);

    const fullPrompt = useCustomLyrics 
      ? `LETRA: ${lyrics}\nPROMPT: ${prompt}\nVIBE: ${vibe}`
      : prompt;

    const finalGenre = genre === "Kuduro" ? `Kuduro (${kuduroVariety})` : genre;

    try {
      await toneEngine.init();
      setIsEngineReady(true);
      
      const generatedData = await generateMusicData(fullPrompt, finalGenre, getProContext());
      setSong(generatedData);
      toneEngine.loadSong(generatedData);
      setTempo(generatedData.tempo);
      
      const melodyTrack = generatedData.tracks.find(t => t.instrument === 'melody');
      if (melodyTrack) {
        setSolfaText(melodyTrack.notes.map(n => n.solfeggio || n.note).join(' '));
      }

      pushHistory({ song: generatedData, prompt, genre: finalGenre, tempo: generatedData.tempo });
      await saveSongToFirebase(generatedData, prompt, finalGenre);
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
      await saveSongToFirebase(generatedData, 'Transcription', genre);
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

    const finalGenre = genre === "Kuduro" ? `Kuduro (${kuduroVariety})` : genre;

    try {
      await toneEngine.init();
      setIsEngineReady(true);
      
      const generatedData = await generateFromSolfa(solfaText, finalGenre, getProContext());
      setSong(generatedData);
      toneEngine.loadSong(generatedData);
      setTempo(generatedData.tempo);
      pushHistory({ song: generatedData, genre: finalGenre, tempo: generatedData.tempo });
      await saveSongToFirebase(generatedData, solfaText, finalGenre);
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

  const PRO_INSTRUMENTS_LIST = ['viola', 'violino', 'batuque', 'sacarias', 'marimba', 'kora', 'mbira', 'djembe', 'guitar', 'guitar_solo'];

  const MIX_PRESETS = [
    { name: 'Padrão', reverb: 0.3, delay: 0.2, dist: 0 },
    { name: 'Acústico Limpo', reverb: 0.1, delay: 0.05, dist: 0 },
    { name: 'Espacial', reverb: 0.8, delay: 0.6, dist: 0 },
    { name: 'Lo-Fi', reverb: 0.2, delay: 0.1, dist: 0.4 },
    { name: 'Distorcido', reverb: 0.1, delay: 0.1, dist: 0.8 },
  ];

  const applyMixPreset = (preset: typeof MIX_PRESETS[0]) => {
    setReverbMix(preset.reverb);
    setDelayMix(preset.delay);
    setDistMix(preset.dist);
    pushHistory({ reverbMix: preset.reverb, delayMix: preset.delay, distMix: preset.dist });
  };

  const handleSaveCustomPreset = () => {
    // Cannot use window.prompt in iframe easily, but we can try or use a custom UI later.
    // For now, let's use a simple name generation if prompt fails.
    let name = window.prompt("Digite o nome para o seu preset:");
    if (!name) name = "Preset " + (customPresets.length + 1);
    
    const newPreset: CustomPreset = {
      name,
      reverb: reverbMix,
      delay: delayMix,
      dist: distMix,
      synth: synthPreset
    };
    const updated = [...customPresets, newPreset];
    setCustomPresets(updated);
    localStorage.setItem('90batidas_custom_presets', JSON.stringify(updated));
  };

  const applyCustomPreset = (preset: CustomPreset) => {
    setReverbMix(preset.reverb);
    setDelayMix(preset.delay);
    setDistMix(preset.dist);
    setSynthPresetState(preset.synth || 'Padrão');
    pushHistory({ reverbMix: preset.reverb, delayMix: preset.delay, distMix: preset.dist });
  };

  const removeCustomPreset = (name: string) => {
    const updated = customPresets.filter(p => p.name !== name);
    setCustomPresets(updated);
    localStorage.setItem('90batidas_custom_presets', JSON.stringify(updated));
  };

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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/30 flex flex-col">
      {authError && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-center text-xs font-bold text-amber-400 uppercase tracking-wider animate-pulse flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
          <span>{authError}</span>
        </div>
      )}
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center overflow-hidden shadow-[0_0_15px_rgba(52,211,153,0.5)] border border-emerald-500/20">
              <img src="/logo.png" alt="90 Batidas Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500 hidden sm:block">
              90 Batidas
            </h1>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center bg-zinc-900/80 rounded-full p-1 border border-zinc-800">
            {[
              { id: 'create', icon: Wand2, label: 'Criar' },
              { id: 'explore', icon: Music, label: 'Explorar' },
              { id: 'library', icon: BookOpen, label: 'Biblioteca' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-all",
                  activeTab === tab.id 
                    ? "bg-emerald-500 text-zinc-950 shadow-[0_0_15px_rgba(52,211,153,0.3)]" 
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-2 text-zinc-400 hidden sm:flex">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Motor Gemini 3.1 Pro
            </span>
            <button
              onClick={() => setIsDonationModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-emerald-500/20 text-zinc-300 hover:text-emerald-400 rounded-lg transition-colors border border-zinc-700 hover:border-emerald-500/30 shadow-sm"
            >
              <Heart className="w-4 h-4 text-emerald-500" />
              <span className="hidden sm:inline">Apoiar</span>
            </button>
            {user && userData ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowAccountModal(true)}
                  className="flex items-center gap-2 hover:bg-zinc-800 px-3 py-1.5 rounded-lg transition border border-transparent hover:border-zinc-700"
                >
                  <div className="flex flex-col items-end">
                    <span className="text-zinc-300 font-medium text-sm truncate max-w-[120px] leading-tight">{user.email}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                      {userData.plan === 'pro' ? 'PRO' : `${userData.credits} Créditos`}
                    </span>
                  </div>
                </button>
                <button
                  onClick={() => setShowUpgrade(true)}
                  className={`px-2 py-1 text-xs font-semibold rounded-md border transition ${userData.plan === 'pro' ? 'hidden' : 'bg-zinc-800 hover:bg-zinc-700 text-amber-400 border-zinc-700'}`}
                >
                  UPGRADE
                </button>
                <button
                  onClick={logout}
                  className="px-3 py-1.5 text-xs font-semibold bg-zinc-800 hover:bg-red-500/20 text-zinc-300 hover:text-red-400 rounded-lg transition-colors border border-zinc-700 hover:border-red-500/30"
                >
                  Sair
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleLogin}
                className="px-4 py-1.5 text-sm font-semibold bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors shadow-md"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'create' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
            {/* Left Sidebar - Controls */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-emerald-400" />
                    Estúdio de Criar
                  </h2>
                  <div className="flex items-center gap-2 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                    <button 
                      onClick={() => setUseCustomLyrics(false)}
                      className={cn(
                        "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                        !useCustomLyrics ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      NORMAL
                    </button>
                    <button 
                      onClick={() => setUseCustomLyrics(true)}
                      className={cn(
                        "px-2 py-1 text-[10px] font-bold rounded-md transition-all",
                        useCustomLyrics ? "bg-amber-500 text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      CUSTOM
                    </button>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {useCustomLyrics && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                          Letras (Lyrics)
                        </label>
                        <textarea
                          value={lyrics}
                          onChange={(e) => setLyrics(e.target.value)}
                          placeholder="Escreva a letra da sua música aqui..."
                          className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 resize-none transition-all placeholder:text-zinc-600"
                        />
                        <button 
                          onClick={() => setLyrics("A vida é curta, o som é infinito...\nNas batidas do meu coração angolano.\nNo ritmo da batida, sinto o calor da alma.")}
                          className="text-[10px] text-zinc-500 hover:text-emerald-400 mt-1 transition-colors"
                        >
                          Gerar letra de exemplo
                        </button>
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                          Vibe / Emoção
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {VIBES.map(v => (
                            <button
                              key={v}
                              onClick={() => setVibe(v)}
                              className={cn(
                                "px-2 py-1 rounded-md text-[10px] font-bold transition-all border",
                                vibe === v 
                                  ? "bg-amber-500/10 border-amber-500/50 text-amber-400 shadow-sm" 
                                  : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:bg-zinc-800"
                              )}
                            >
                              {v.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                      {useCustomLyrics ? "Instruções de Estilo" : "Vibe Musical / Prompt"}
                    </label>
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder={useCustomLyrics ? "ex: Melódico, voz suave, violão acústico..." : "ex: Uma batida rápida e energética com uma linha de baixo marcante..."}
                      className="w-full h-24 bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 resize-none transition-all placeholder:text-zinc-600"
                    />
                  </div>

                  <div>
                    <label className="flex items-center text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                      Gênero Dominante
                      <HelpTooltip content="O estilo determina a velocidade e os instrumentos típicos." />
                    </label>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      {GENRES.map(g => (
                        <button
                          key={g}
                          onClick={() => setGenre(g)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                            genre === g 
                              ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" 
                              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                          )}
                        >
                          {g.toUpperCase()}
                        </button>
                      ))}
                    </div>

                    {genre === "Kuduro" && (
                      <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-3 mt-3 shadow-inner">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          <div>
                            <label className="block text-xs font-black text-amber-400 uppercase tracking-wider">
                              Variedidades do Kuduro Angolano
                            </label>
                            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">Escolha o sub-estilo ideal para as batidas e arranjos</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {KUDURO_VARIETIES.map(v => (
                            <button
                              key={v.name}
                              type="button"
                              onClick={() => setKuduroVariety(v.name)}
                              className={cn(
                                "px-2.5 py-1.5 rounded-lg text-[9px] font-black transition-all border uppercase tracking-wider text-left flex flex-col justify-between max-w-[130px] flex-1 min-w-[110px]",
                                kuduroVariety === v.name 
                                  ? "bg-amber-500/10 border-amber-500/50 text-amber-400 shadow-md" 
                                  : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                              )}
                              title={v.description}
                            >
                              <span>{v.name}</span>
                              <span className="text-[7.5px] font-normal text-zinc-500 lowercase leading-tight line-clamp-2 mt-1">{v.description}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progressão de Acordes / Harmonia Customizada */}
                  <div className="p-4 bg-zinc-950/60 border border-zinc-800/40 rounded-2xl space-y-3 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Grid className="w-4 h-4 text-cyan-400 animate-pulse" />
                        <div>
                          <label className="block text-xs font-black text-zinc-100 uppercase tracking-wider">
                            Progressão de Acordes IA
                          </label>
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                            Aplica sequências africanas/kizomba automáticas
                          </span>
                        </div>
                      </div>
                      
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 uppercase tracking-wider">
                        Preset Ativo
                      </span>
                    </div>

                    <div className="relative">
                      <select
                        value={selectedChordProgression}
                        onChange={(e) => setSelectedChordProgression(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-lg p-2 text-xs uppercase font-extrabold focus:outline-none focus:ring-1 focus:ring-cyan-500/30 cursor-pointer"
                      >
                        {CHORD_PROGRESSIONS.map(p => (
                          <option key={p.id} value={p.id} className="bg-zinc-950 text-zinc-300 uppercase font-bold py-1">
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="bg-cyan-500/5 border border-cyan-500/10 p-2.5 rounded-xl space-y-1 text-left">
                      <span className="block text-[7.5px] font-black text-cyan-400 uppercase tracking-widest">
                        Acordes do Estúdio:
                      </span>
                      <p className="text-[10px] font-black text-zinc-300">
                        🎼 {CHORD_PROGRESSIONS.find(p => p.id === selectedChordProgression)?.progression}
                      </p>
                      <p className="text-[8.5px] text-zinc-500 leading-snug">
                        {CHORD_PROGRESSIONS.find(p => p.id === selectedChordProgression)?.description}
                      </p>
                    </div>
                  </div>

                  {/* Perfil de Canto & Vozes (Angola, Moçambique, Portugal, Brasil) */}
                  <div className="p-4 bg-zinc-950/60 border border-zinc-800/40 rounded-2xl space-y-3 shadow-inner">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mic className="w-4 h-4 text-emerald-400 animate-pulse" />
                        <div>
                          <label className="block text-xs font-black text-zinc-100 uppercase tracking-wider">
                            Voz do Cantor IA (Multicountry)
                          </label>
                          <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                            Define o sotaque e sintonização acústica local
                          </span>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={handleRandomizeVocalProfile}
                        className="px-2.5 py-1 text-[8px] font-black rounded-lg uppercase tracking-widest border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/30 transition-all flex items-center gap-1.5"
                        title="Sortear voz, país e vantagem aleatória"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        Sortear Voz
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1.5">
                      {/* Gênero do Vocalista */}
                      <div>
                        <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Gênero Vocal:</span>
                        <div className="flex gap-1 bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800 text-[10px] font-bold">
                          {(['aleatorio', 'masculino', 'feminino'] as const).map(g => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => {
                                setVocalGender(g);
                                toneEngine.setVocalProfile(g, vocalAccent, vocalVantage);
                              }}
                              className={cn(
                                "flex-1 py-1 rounded transition-all capitalize text-[9px]",
                                vocalGender === g
                                  ? "bg-zinc-800 text-white shadow"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              {g === 'aleatorio' ? 'Misto/Random' : g}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Accent / Country of Singer */}
                      <div>
                        <span className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Sotaque e Dialeto:</span>
                        <div className="relative">
                          <select
                            value={vocalAccent}
                            onChange={(e) => {
                              const v = e.target.value;
                              setVocalAccent(v);
                              toneEngine.setVocalProfile(vocalGender, v, vocalVantage);
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-350 rounded-lg p-1.5 text-[10px] uppercase font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                          >
                            <option value="aleatorio">🎲 Sotaque Aleatório</option>
                            <option value="angola">🇦🇴 Angola (Luanda / Kuduro / Semba)</option>
                            <option value="mozambique">🇲🇿 Moçambique (Marrabenta)</option>
                            <option value="portugal">🇵🇹 Portugal (Fado / Sotaque PT)</option>
                            <option value="brazil">🇧🇷 Brasil (Samba / Pop BR)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Vantage / Perk system */}
                    <div className="bg-zinc-900 border border-zinc-800/60 p-2.5 rounded-xl space-y-1">
                      <span className="block text-[7px] font-black text-zinc-500 uppercase tracking-widest">
                        ⭐ Vantagem Acústica Ativa:
                      </span>
                      <div className="flex items-center justify-between text-[10px] font-black text-amber-400 uppercase tracking-wide">
                        <span className="truncate flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
                          {vocalVantage}
                        </span>
                        <span className="text-[7.5px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider">
                          +Bônus IA
                        </span>
                      </div>
                      <span className="block text-[8px] font-medium text-zinc-500 leading-tight">
                        A IA irá ajustar o timbre, gírias e a prosódia das letras para valorizar essa sonoridade típica.
                      </span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-800">
                    <button 
                      onClick={() => setIsStudioMode(!isStudioMode)}
                      className={cn(
                        "w-full py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-lg",
                        isStudioMode 
                          ? "bg-red-500 text-white shadow-red-500/20" 
                          : "bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700"
                      )}
                    >
                      <Mic className="w-4 h-4" />
                      {isStudioMode ? "FECHAR ESTÚDIO" : "ABRIR ESTÚDIO (GRAVAR VOZ)"}
                    </button>
                    
                    <AnimatePresence>
                      {isStudioMode && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-4"
                        >
                          <StudioMode 
                            isSongPlaying={isPlaying}
                            onTogglePlay={togglePlay}
                            onRecordingComplete={handleRecordingMixing}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
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
                onClick={() => triggerGenerate(false)}
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
                onClick={() => triggerGenerate(false)}
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
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sliders className="w-5 h-5 text-emerald-400" />
                Mixer & Efeitos
                <HelpTooltip content="Brinque com a ambiência do estúdio: mude de um som claro para um som espaçoso ou distorcido, e troque de sintetizadores." />
              </h2>
            </div>
            
            <div className="mb-6">
              <label className="text-xs text-zinc-400 mb-2 block uppercase tracking-wide">Timbre dos Instrumentos</label>
              <div className="flex flex-wrap gap-2">
                {['Padrão', 'Sintético', 'Suave'].map(p => (
                  <button
                    key={p}
                    onClick={() => { setSynthPresetState(p); pushHistory({ synthPreset: p }); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${synthPreset === p ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-xs text-zinc-400 mb-2 block uppercase tracking-wide">Presets de Mixagem</label>
              <div className="flex flex-wrap gap-2">
                {MIX_PRESETS.map(preset => (
                  <button
                    key={preset.name}
                    onClick={() => applyMixPreset(preset)}
                    className="px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded border border-zinc-700 transition-colors"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {customPresets.length > 0 && (
              <div className="mb-6 border-t border-zinc-800 pt-4">
                <label className="text-xs text-zinc-400 mb-2 block uppercase tracking-wide">Meus Presets</label>
                <div className="flex flex-wrap gap-2">
                  {customPresets.map(preset => (
                    <div key={preset.name} className="flex rounded border border-zinc-700 overflow-hidden">
                      <button
                        onClick={() => applyCustomPreset(preset)}
                        className="px-2.5 py-1 text-[10px] font-medium tracking-wider bg-zinc-800 hover:bg-zinc-700 text-emerald-300 transition-colors"
                      >
                        {preset.name}
                      </button>
                      <button
                        onClick={() => removeCustomPreset(preset.name)}
                        className="px-2 py-1 text-[10px] bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-500 transition-colors border-l border-zinc-700"
                        title="Remover Preset"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4 border-t border-zinc-800 pt-4">
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
            
            <button
              onClick={handleSaveCustomPreset}
              className="mt-6 w-full py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Salvar como Preset Personalizado
            </button>
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
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 shadow-2xl relative overflow-hidden flex items-center justify-center min-h-[160px] group">
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 to-transparent z-0" />
            <canvas 
              ref={canvasRef} 
              width={800} 
              height={160} 
              className="w-full h-full opacity-90 mix-blend-screen relative z-10"
            />
            
            {/* Lyrics Card Overlay */}
            <AnimatePresence>
              {isPlaying && song && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute bottom-6 left-6 right-6 z-20 text-center"
                >
                  <p className="text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-tight">
                    {song.tracks.find(t => t.instrument === 'voz' || t.instrument === 'melody')?.notes.find(n => {
                      const [bar, beat] = n.time.split(':').map(Number);
                      const currentBar = Math.floor(currentStep / 16);
                      const currentBeat = Math.floor((currentStep % 16) / 4);
                      return bar === currentBar && beat === currentBeat;
                    })?.lyric || lyrics.split('\n')[Math.floor(currentStep / 32) % lyrics.split('\n').length] || ""}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                <div className="flex flex-col items-center gap-2 opacity-20">
                  <Music className="w-10 h-10" />
                  <span className="text-zinc-400 text-[10px] font-black uppercase tracking-[0.3em]">Estúdio 90 Batidas</span>
                </div>
              </div>
            )}

            {/* Progress Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-950 z-30">
              <motion.div 
                className="h-full bg-emerald-400 shadow-[0_0_15px_#10b981]"
                initial={{ width: 0 }}
                animate={{ width: `${(currentStep / totalSteps) * 100}%` }}
                transition={{ type: "spring", bounce: 0, duration: 0.1 }}
              />
            </div>
          </div>

          {/* Interactive Drum Rhythm Grid Editor */}
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl relative overflow-hidden flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Grid className="w-5 h-5 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100 uppercase tracking-widest flex items-center gap-1.5">
                    Editor de Ritmo de Bateria
                    <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded tracking-widest uppercase">
                      Grid Sequenciador
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Clique nos blocos para ligar/desligar batidas ou preencha com ritmos afro-brasileiros tradicionais.
                  </p>
                </div>
              </div>

              {!song ? (
                <button
                  onClick={handleCreateBlankSong}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-black text-xs uppercase rounded-xl transition-all flex items-center gap-2 tracking-wider shadow-[0_4px_12px_rgba(16,185,129,0.2)]"
                >
                  <Sparkles className="w-4 h-4" />
                  Iniciar Ritmo do Zero
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={clearDrumTrack}
                    className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-red-500/30 text-zinc-400 hover:text-red-400 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5"
                    title="Apagar todas as notas da bateria"
                  >
                    <X className="w-4 h-4" />
                    Limpar Beat
                  </button>
                </div>
              )}
            </div>

            {!song ? (
              <div className="py-6 flex flex-col items-center justify-center text-center text-zinc-500">
                <Music className="w-12 h-12 mb-3 opacity-20 text-emerald-400 animate-bounce" />
                <p className="text-xs font-black uppercase tracking-wider text-zinc-400 mb-1">Sem música carregada</p>
                <p className="text-[11px] text-zinc-500 max-w-sm mb-4">
                  Gere uma música usando IA à esquerda ou crie uma faixa vazia para programar seu ritmo passo a passo.
                </p>
                <button
                  onClick={handleCreateBlankSong}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 hover:text-white border border-zinc-700 text-zinc-300 font-bold text-xs uppercase rounded-lg transition-all"
                >
                  Acessar Estúdio Vazio
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Presets - Ritmos Únicos */}
                <div className="p-3 bg-zinc-950/40 rounded-xl border border-zinc-800/60 flex flex-col gap-2">
                  <div className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">
                    Loops Afro/Brasil de 1 Clique:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => applyDrumPreset('kizomba')}
                      className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-emerald-500/30 text-zinc-300 hover:text-emerald-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      🥁 Kizomba Clássica
                    </button>
                    <button
                      onClick={() => applyDrumPreset('funana')}
                      className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-amber-500/30 text-zinc-300 hover:text-amber-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      ⚡ Funaná Cabo Verde
                    </button>
                    <button
                      onClick={() => applyDrumPreset('funk')}
                      className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-purple-500/30 text-zinc-300 hover:text-purple-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      🔥 Funk Tamborzão
                    </button>
                    <button
                      onClick={() => applyDrumPreset('samba')}
                      className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-rose-500/30 text-zinc-300 hover:text-rose-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      🇧🇷 Samba Batucada
                    </button>
                    <button
                      onClick={() => applyDrumPreset('rap')}
                      className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-cyan-500/30 text-zinc-300 hover:text-cyan-400 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                    >
                      🎤 Rap Adegão Beat
                    </button>
                  </div>
                </div>

                {/* Compasso Selector Tabs */}
                {Math.max(1, totalSteps / 16) > 1 && (
                  <div className="flex items-center gap-1.5 border-b border-zinc-800 pb-2 overflow-x-auto">
                    <span className="text-[10px] font-black uppercase text-zinc-500 tracking-wider mr-2 shrink-0">Compasso:</span>
                    {Array.from({ length: Math.max(1, totalSteps / 16) }).map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => setEditorBar(idx)}
                        className={cn(
                          "px-3 py-1 rounded text-xs font-black uppercase tracking-wider transition-all border shrink-0",
                          editorBar === idx
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/45"
                            : "bg-zinc-950 text-zinc-450 border-zinc-800 hover:border-zinc-700"
                        )}
                      >
                        Compasso {idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                {/* Sequencer Grid */}
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                  <div className="min-w-[700px] space-y-2">
                    {/* Header with step numbers */}
                    <div className="flex items-center">
                      <div className="w-36 flex justify-between pr-2 border-r border-zinc-800 select-none">
                        <span className="text-[9px] font-black uppercase text-zinc-600 tracking-wider">INSTRUMENTO</span>
                      </div>
                      <div className="flex-1 grid grid-cols-16 gap-1 pl-2 text-center select-none">
                        {Array.from({ length: 16 }).map((_, i) => {
                          const isBeat = i % 4 === 0;
                          return (
                            <span 
                              key={i} 
                              className={cn(
                                "text-[9px] font-black",
                                isBeat ? "text-zinc-450" : "text-zinc-650"
                              )}
                            >
                              {i + 1}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    {/* Drum Rows */}
                    {DRUM_PAD_LAYERS.map(layer => {
                      const drumTrack = song.tracks.find(t => t.instrument === 'drums');
                      
                      return (
                        <div key={layer.id} className="flex items-center group/row">
                          {/* Row title / sound trigger */}
                          <div 
                            onClick={() => toneEngine.triggerDrumPreview(layer.id)}
                            className="w-36 pr-2 border-r border-zinc-800 flex items-center justify-between cursor-pointer hover:bg-zinc-800/40 p-1 rounded-lg transition-colors select-none"
                            title={`Clique para ouvir o som de ${layer.name}`}
                          >
                            <span className="text-[11px] font-black text-zinc-300 truncate uppercase tracking-tight">
                              {layer.id === 'kick' ? 'BUMBO' :
                               layer.id === 'snare' ? 'CAIXA' :
                               layer.id === 'hihat' ? 'HI-HAT (FECH.)' :
                               layer.id === 'openhat' ? 'HI-HAT (ABERT.)' :
                               layer.id === 'batuque' ? 'BATUQUE' : 'DJEMBE'}
                            </span>
                            <Play className="w-3 h-3 text-zinc-500 group-hover/row:text-emerald-400 transition-colors shrink-0" />
                          </div>

                          {/* 16 steps pads */}
                          <div className="flex-1 grid grid-cols-16 gap-1 pl-2">
                            {Array.from({ length: 16 }).map((_, i) => {
                              const step = (editorBar * 16) + i;
                              const isBeat = i % 4 === 0;
                              
                              // Check active status
                              const isActive = drumTrack?.notes.some(n => {
                                const parts = n.time.split(':');
                                if (parts.length >= 2) {
                                  const b = parseInt(parts[0], 10);
                                  const bt = parseInt(parts[1], 10);
                                  const s = parts.length === 3 ? parseInt(parts[2], 10) : 0;
                                  const absStep = (b * 16) + (bt * 4) + s;
                                  return absStep === step && n.drum === layer.id;
                                }
                                return false;
                              }) || false;

                              const isCurrentPlayCol = isPlaying && (currentStep % 16 === i) && Math.floor(currentStep / 16) === editorBar;

                              return (
                                <button
                                  key={i}
                                  onClick={() => toggleDrumStep(layer.id, i)}
                                  className={cn(
                                    "aspect-square rounded-md transition-all relative border overflow-hidden cursor-pointer",
                                    isActive 
                                      ? layer.color
                                      : isBeat
                                        ? "bg-zinc-950 border-zinc-700/60 hover:bg-zinc-900/40 hover:border-zinc-500"
                                        : "bg-zinc-950/40 border-zinc-800/50 hover:bg-zinc-900/40 hover:border-zinc-700",
                                    isCurrentPlayCol && "ring-2 ring-white scale-105 z-10 shadow-[0_0_10px_rgba(255,255,255,0.8)]"
                                  )}
                                  title={`${layer.name} - Compasso ${editorBar + 1}, Tempo ${Math.floor(i / 4) + 1}, Sub-divisão ${(i % 4) + 1}`}
                                >
                                  {isCurrentPlayCol && (
                                    <div className="absolute inset-0 bg-white/20 animate-ping pointer-events-none" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                <span className="text-xs text-zinc-500 uppercase font-medium tracking-wider flex justify-between items-center">
                  <span>Tempo <HelpTooltip content="Controle a velocidade da música (Batidas Por Minuto)." /></span>
                  <span className="text-emerald-400 font-mono ml-2">{tempo}</span>
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
                  {song.tracks.map((track) => {
                    const instrument = track.instrument;
                    const colorClass = 
                      instrument === 'melody' ? 'bg-fuchsia-500' : 
                      instrument === 'bass' ? 'bg-cyan-500' : 
                      instrument === 'kora' ? 'bg-amber-600' : 
                      instrument === 'mbira' ? 'bg-orange-500' : 
                      instrument === 'voz' ? 'bg-pink-400' : 
                      instrument === 'marimba' ? 'bg-yellow-500' : 
                      instrument === 'viola' ? 'bg-purple-500' : 
                      instrument === 'violino' ? 'bg-indigo-500' : 
                      'bg-emerald-500';
                    
                    const instrumentName = 
                      instrument === 'melody' ? 'Melodia' : 
                      instrument === 'drums' ? 'Bateria' : 
                      instrument === 'bass' ? 'Baixo' : 
                      instrument; // capitalize later
                    
                    return (
                      <div key={instrument} className="relative">
                        <div className="sticky left-0 flex items-center justify-between mb-2 bg-zinc-900/80 backdrop-blur-sm z-20 w-max pr-4">
                          <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider capitalize">
                            {instrumentName}
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
                                          animate={
                                            currentStep === i && isPlaying 
                                            ? { scale: [1, 1.25, 1], opacity: 1, filter: "brightness(1.5)" } 
                                            : { scale: 1, opacity: 0.8, filter: "brightness(1)" }
                                          }
                                          transition={{ duration: 0.2 }}
                                          className={cn(
                                            "absolute top-1 bottom-1 left-0.5 right-0.5 rounded-sm",
                                            colorClass,
                                            currentStep === i && isPlaying ? "shadow-[0_0_15px_currentColor] z-10" : ""
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
      </div>
    ) : activeTab === 'explore' ? (
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-800 pb-8">
          <div className="space-y-2">
            <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-500 uppercase tracking-tighter">Explorar</h2>
            <p className="text-zinc-400 text-base max-w-md">Ouça e inspire-se com as batidas geradas pela nossa comunidade.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {["Tudo", "Kizomba", "Afrobeat", "Gospel", "Trap", "Semba"].map(f => (
              <button key={f} className="px-5 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-400 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all">
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {[
            { title: "Noite em Luanda", genre: "Kizomba", owner: "Dany_Beat", color: "from-indigo-600 to-purple-700", bpm: 95 },
            { title: "Kuduro Cyber 2026", genre: "Kuduro", owner: "Electro_King", color: "from-emerald-500 to-cyan-700", bpm: 140 },
            { title: "Oração Matinal", genre: "Gospel", owner: "Maestro_X", color: "from-amber-500 to-orange-600", bpm: 72 },
            { title: "Semba do Amanhã", genre: "Semba", owner: "Tradicao", color: "from-red-600 to-black", bpm: 110 },
            { title: "Vibe Tropical", genre: "Afrobeat", owner: "Sunny_Side", color: "from-blue-500 to-sky-600", bpm: 105 },
            { title: "Trap Angolano", genre: "Trap", owner: "Rapper_Y", color: "from-zinc-100 to-zinc-400 text-zinc-950", bpm: 145 },
            { title: "Zouk Love", genre: "Zouk", owner: "Romeo", color: "from-pink-500 to-rose-600", bpm: 88 },
            { title: "Deep Mbira", genre: "Traditional", owner: "Spirit", color: "from-orange-800 to-amber-950", bpm: 80 },
          ].map((item, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ y: -8 }}
              className="bg-zinc-900/40 border border-zinc-800/60 rounded-3xl overflow-hidden group relative flex flex-col h-full shadow-xl hover:shadow-emerald-500/10 hover:border-emerald-500/40 transition-all cursor-pointer"
            >
              <div className={cn("h-44 bg-gradient-to-br flex items-center justify-center relative overflow-hidden", item.color)}>
                 <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                 <Music className="w-16 h-16 opacity-30 group-hover:scale-110 transition-transform duration-500" />
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px]">
                   <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center text-zinc-950 shadow-2xl active:scale-90 transition-transform">
                     <Play className="w-8 h-8 fill-current ml-1" />
                   </div>
                 </div>
                 <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-[10px] font-black tracking-widest text-white border border-white/10 uppercase">
                    {item.bpm} BPM
                 </div>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-white group-hover:text-emerald-400 transition-colors text-lg leading-tight truncate">{item.title}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">{item.genre}</span>
                    <span className="text-[10px] font-bold text-zinc-500">por <span className="text-zinc-300">{item.owner}</span></span>
                  </div>
                </div>
                <div className="flex items-center gap-6 mt-6 pt-4 border-t border-zinc-800/50">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <Heart className="w-3.5 h-3.5 text-zinc-600 group-hover:text-red-500 transition-colors" /> {Math.floor(Math.random() * 500) + 100}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <Play className="w-3.5 h-3.5 text-zinc-600" /> {Math.floor(Math.random() * 2000) + 500}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ) : (
      <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto">
        <div className="space-y-2 border-b border-zinc-800 pb-8">
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Minha Biblioteca</h2>
          <p className="text-zinc-400 text-base">Gerencie suas batidas, músicas salvas e uploads.</p>
        </div>
        
        {!user ? (
          <div className="h-96 flex flex-col items-center justify-center bg-zinc-900/10 border-2 border-dashed border-zinc-800 rounded-[40px] p-12 text-center">
            <div className="w-24 h-24 bg-zinc-900 rounded-full flex items-center justify-center mb-8 border border-zinc-800">
              <FolderOpen className="w-10 h-10 text-zinc-700" />
            </div>
            <h3 className="text-2xl font-black text-white mb-3 uppercase tracking-tight">Suas Batidas estão esperando</h3>
            <p className="text-zinc-500 max-w-xs mb-10 text-sm leading-relaxed">Faça login para salvar suas criações na nuvem e acessá-las de qualquer lugar do mundo.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-md">
              <button onClick={handleGoogleLogin} className="w-full sm:w-auto px-8 py-4 bg-white text-zinc-950 font-black rounded-2xl hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-xl tracking-wide text-xs">
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" />
                ENTRAR COM GOOGLE
              </button>
              <button onClick={handleGuestLogin} className="w-full sm:w-auto px-8 py-4 bg-zinc-800 text-zinc-300 font-bold rounded-2xl hover:bg-zinc-700 hover:text-white transition-all flex items-center justify-center gap-2 border border-zinc-700 tracking-wider text-[10px] uppercase">
                <FolderOpen className="w-4 h-4 text-zinc-500" />
                ENTRAR COMO CONVIDADO (TESTE)
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
             {song ? (
               <motion.div 
                 layout
                 className="bg-zinc-900/50 border-2 border-emerald-500/20 rounded-3xl p-6 flex flex-col gap-6 group hover:border-emerald-500/40 transition-all shadow-xl"
               >
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-2xl flex items-center justify-center text-zinc-950 shadow-lg">
                      <Music className="w-8 h-8" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-white text-xl truncate">{prompt.substring(0, 40) || "Nova Batida Sônica"}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{genre}</span>
                        <div className="w-1 h-1 rounded-full bg-zinc-700" />
                        <span className="text-[10px] font-bold text-zinc-500">{new Date().toLocaleDateString('pt-AO')}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={togglePlay} className="flex-1 py-3 bg-emerald-500 text-zinc-950 font-black rounded-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-wider">
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                      {isPlaying ? 'Pausar' : 'Ouvir Agora'}
                    </button>
                    <button className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition-all border border-zinc-700">
                      <Download className="w-5 h-5" />
                    </button>
                    <button className="p-3 bg-zinc-800 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-xl transition-all border border-zinc-700 hover:border-red-500/30">
                      <Heart className="w-5 h-5" />
                    </button>
                  </div>
               </motion.div>
             ) : (
               <div className="col-span-full h-80 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-[40px] text-zinc-600 p-12 text-center">
                  <Music className="w-12 h-12 opacity-10 mb-4" />
                  <p className="text-zinc-500 font-medium">Sua rádio pessoal está vazia por enquanto.</p>
                  <button onClick={() => setActiveTab('create')} className="mt-6 px-8 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-emerald-500 font-black hover:bg-zinc-800 hover:border-emerald-500/30 transition-all uppercase tracking-widest text-xs">Começar a Criar</button>
               </div>
             )}
          </div>
        )}
      </div>
    )}
  </main>

      <footer className="w-full bg-zinc-950/80 backdrop-blur-md border-t border-zinc-900 py-6 text-center text-xs text-zinc-500 sticky bottom-0 z-10">
        <div className="flex justify-center gap-6 mb-2">
          <button onClick={() => setShowTerms(true)} className="hover:text-emerald-400 transition-colors">Termos de Uso</button>
          <button onClick={() => setShowPrivacy(true)} className="hover:text-emerald-400 transition-colors">Política de Privacidade</button>
        </div>
        <p>&copy; {new Date().getFullYear()} 90 Batidas Musical. Todos os direitos reservados.</p>
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

      <AccountModal 
        isOpen={showAccountModal} 
        onClose={() => setShowAccountModal(false)} 
        user={user} 
        userData={userData as any} 
      />

      <MonetizationModal 
        isOpen={isDonationModalOpen} 
        onClose={() => setIsDonationModalOpen(false)} 
      />

      {/* Modal de Validação de Prompt */}
      <AnimatePresence>
        {showValidationPromptConfirm && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Sliders className="w-5 h-5 animate-pulse" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-base font-black text-white uppercase tracking-wider">Aviso de Prompt Simples</h3>
                <p className="text-zinc-400 text-xs leading-relaxed">
                  {promptValidationError}
                </p>
                <div className="mt-2.5 p-3 bg-zinc-950 rounded-xl border border-zinc-850 font-mono text-xs text-zinc-400 break-all select-all">
                  "{prompt}"
                </div>
              </div>

              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 space-y-1 text-xs text-emerald-400/80">
                <p className="font-bold flex items-center gap-1.5 uppercase tracking-wider text-[9px]">
                  💡 Dica do Produtor IA:
                </p>
                <p className="leading-relaxed">
                  Descreva ritmos, instrumentos típicos (marimba, kora, guitarra) ou a história que deseja expressar para gerar uma melodia muito melhor e aproveitar o potencial máximo de IA!
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-1.5">
                <button
                  onClick={() => setShowValidationPromptConfirm(false)}
                  className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl text-xs transition-colors uppercase tracking-wider border border-zinc-750"
                >
                  Melhorar Prompt
                </button>
                <button
                  onClick={() => triggerGenerate(true)}
                  className="flex-1 py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black rounded-xl text-xs transition-all shadow-md uppercase tracking-wider"
                >
                  Gerar Mesmo Assim
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

