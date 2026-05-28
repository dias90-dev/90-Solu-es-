import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Save, Play, RefreshCw, RotateCcw, Music, CheckCircle2, Pause, Sparkles, BookOpen, ChevronLeft, ChevronRight, Trash, ListFilter } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { toneEngine } from '../lib/tone-engine';

interface MiniWaveformProps {
  blob: Blob;
}

export const MiniWaveform: React.FC<MiniWaveformProps> = ({ blob }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawPlaceholder = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#3f3f46'; // zinc-700
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
    };

    drawPlaceholder();

    const decodeAndDraw = async () => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const decodeCtx = new AudioContextClass();
        const audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer).catch(() => null);
        decodeCtx.close();

        if (!audioBuffer || !active) return;

        const channelData = audioBuffer.getChannelData(0);
        const step = Math.ceil(channelData.length / canvas.width);
        const peaks: number[] = [];

        for (let i = 0; i < canvas.width; i++) {
          let min = 1.0;
          let max = -1.0;
          const start = i * step;
          const end = Math.min(start + step, channelData.length);
          for (let j = start; j < end; j++) {
            const val = channelData[j];
            if (val < min) min = val;
            if (val > max) max = val;
          }
          peaks.push(max - min);
        }

        if (!active) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#10b981'; // emerald-500
        const midY = canvas.height / 2;

        for (let i = 0; i < peaks.length; i++) {
          const val = peaks[i];
          const height = Math.max(3, val * canvas.height * 0.9);
          const y = midY - height / 2;
          ctx.fillRect(i * 1.5, y, 1, height);
        }
      } catch (err) {
        if (!active) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#10b981';
        const midY = canvas.height / 2;
        for (let i = 0; i < canvas.width; i += 3) {
          const height = 4 + Math.sin(i * 0.4) * 6;
          ctx.fillRect(i, midY - height / 2, 1.5, height);
        }
      }
    };

    decodeAndDraw();

    return () => {
      active = false;
    };
  }, [blob]);

  return (
    <canvas 
      ref={canvasRef} 
      width={48} 
      height={24} 
      className="bg-zinc-950/65 rounded border border-zinc-850 opacity-80 group-hover:opacity-100 transition-opacity" 
    />
  );
};

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const autoCorrelate = (buffer: Float32Array, sampleRate: number): number => {
  const SIZE = buffer.length;
  let sumOfSquares = 0;
  for (let i = 0; i < SIZE; i++) {
    const val = buffer[i];
    sumOfSquares += val * val;
  }
  const rootMeanSquare = Math.sqrt(sumOfSquares / SIZE);
  if (rootMeanSquare < 0.008) {
    return -1; // Not enough signal
  }

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buffer[i]) < thres) {
      r1 = i;
      break;
    }
  }
  for (let i = SIZE - 1; i >= SIZE / 2; i--) {
    if (Math.abs(buffer[i]) < thres) {
      r2 = i;
      break;
    }
  }

  const subBuffer = buffer.subarray(r1, r2);
  const len = subBuffer.length;

  const minPeriod = Math.floor(sampleRate / 1200); // Max ~1200Hz
  const maxPeriod = Math.floor(sampleRate / 55);   // Min ~55Hz

  let bestOffset = -1;
  let bestCorrelation = -1;

  for (let offset = minPeriod; offset <= maxPeriod; offset++) {
    let correlation = 0;
    for (let i = 0; i < len - offset; i++) {
      correlation += subBuffer[i] * subBuffer[i + offset];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestCorrelation > 0.1 && bestOffset !== -1) {
    return sampleRate / bestOffset;
  }
  return -1;
};

const getNoteFromFrequency = (frequency: number): { note: string; cents: number } => {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  const roundedNoteNum = Math.round(noteNum);
  const cents = Math.round((noteNum - roundedNoteNum) * 100);
  let noteIndex = (roundedNoteNum + 69) % 12;
  if (noteIndex < 0) noteIndex += 12;
  const octave = Math.floor((roundedNoteNum + 69) / 12) - 1;
  return {
    note: `${NOTE_NAMES[noteIndex]}${octave}`,
    cents
  };
};

interface StudioModeProps {
  onRecordingComplete: (blob: Blob, processingStyle: 'Dry' | 'Warm' | 'Echo') => void;
  isSongPlaying: boolean;
  onTogglePlay: () => void;
}

export const StudioMode: React.FC<StudioModeProps> = ({ 
  onRecordingComplete, 
  isSongPlaying,
  onTogglePlay
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [vocalProcessing, setVocalProcessing] = useState<'Dry' | 'Warm' | 'Echo'>('Dry');
  const [cooldownDuration, setCooldownDuration] = useState<number>(5);
  const [prepCountdown, setPrepCountdown] = useState<number>(0);
  const [recordingCooldown, setRecordingCooldown] = useState<number>(0);

  // Studio Mode Step-by-Step Onboarding states
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  useEffect(() => {
    const isCompleted = localStorage.getItem('beats_studio_onboarding_done_v2');
    if (!isCompleted) {
      setShowOnboarding(true);
    }
  }, []);

  const finishOnboarding = () => {
    localStorage.setItem('beats_studio_onboarding_done_v2', 'true');
    setShowOnboarding(false);
  };

  const onboardingSteps = [
    {
      title: "1. Escolher Estilo Vocal",
      description: "Antes de começar, escolha o efeito de áudio desejado no menu. 'Dry' grava o som puro sem modificações. 'Warm' adiciona calor analógico de estúdio com compressão firme. 'Echo' introduz ecos de palco tridimensionais e reverb espaçoso.",
      icon: Sparkles,
      tip: "Perfeito para dar peso e presença pro seu vocal antes da mixagem."
    },
    {
      title: "2. Gravar no Tempo Certo",
      description: "Dê um clique no grande botão vermelho do microfone. O Estúdio iniciará um cronômetro de 3 segundos para você se preparar e entrar no tempo do beat, capturando sua voz em perfeita sincronia.",
      icon: Mic,
      tip: "Mantenha uma distância estável do microfone para melhor qualidade."
    },
    {
      title: "3. Resfriamento Ativo",
      description: "Clique no quadrado vermelho para parar. Para preservar a precisão harmônica do seu sinal digital e evitar ruídos de buffer, as válvulas virtuais do estúdio entram em resfriamento automático por alguns segundos.",
      icon: Square,
      tip: "Você pode alterar o tempo de refrigeração no menu superior a qualquer momento."
    },
    {
      title: "4. Comparar Efeito em Tempo Real",
      description: "Na lista de takes salvos abaixo, você pode usar os novos botões rápidos 'Original' (som natural do mic) e 'Estúdio' (voz processada com efeito selecionado) para alternar e validar seu tom instantaneamente no beat.",
      icon: Play,
      tip: "O cross-fade é instantâneo e ultra-suave durante a reprodução!"
    },
    {
      title: "5. Misturar na Nuvem",
      description: "Satisfeito com o seu vocal? Clique no botão verde 'MISTURAR'. A nossa IA transcreverá os harmônicos melódicos de sua gravação, integrando e sintetizando sua voz na melodia principal da batida de forma genial!",
      icon: Save,
      tip: "Seu take misturado estará pronto em instantes na nuvem."
    }
  ];

  const [recordings, setRecordings] = useState<{ blob: Blob; url: string; timestamp: number; style: 'Dry' | 'Warm' | 'Echo'; title?: string }[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // States for renaming and volume control
  const [editingTimestamp, setEditingTimestamp] = useState<number | null>(null);
  const [tempTitle, setTempTitle] = useState("");
  const [takeVolumes, setTakeVolumes] = useState<Record<number, number>>({});
  const [normalizedTakes, setNormalizedTakes] = useState<Record<number, boolean>>({});
  const [normalizationGains, setNormalizationGains] = useState<Record<number, number>>({});
  const [isNormalizing, setIsNormalizing] = useState<Record<number, boolean>>({});
  const [normalizationThresholds, setNormalizationThresholds] = useState<Record<number, number>>({});
  const [maxPeaks, setMaxPeaks] = useState<Record<number, number>>({});
  const [fadeInDurations, setFadeInDurations] = useState<Record<number, number>>({});
  const [fadeOutDurations, setFadeOutDurations] = useState<Record<number, number>>({});
  const volumeNodeRef = useRef<GainNode | null>(null);

  // Auto-analyze peaks of all recordings for precision mapping & visual indicators
  useEffect(() => {
    recordings.forEach(rec => {
      if (maxPeaks[rec.timestamp] === undefined && !isNormalizing[rec.timestamp]) {
        extractMaxPeak(rec).catch(err => console.warn("Auto peak analysis error:", err));
      }
    });
  }, [recordings]);

  // Filtering & grouping states for recordings take list
  const [takeFilter, setTakeFilter] = useState<'All' | 'Dry' | 'Warm' | 'Echo'>('All');
  const [groupByStyle, setGroupByStyle] = useState<boolean>(false);

  // High-fidelity dynamic preview states for Compare button
  const [playingTimestamp, setPlayingTimestamp] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState<'Original' | 'Processado'>('Processado');

  // Pitch Tuner / Note Analyzer states
  const [tunerActive, setTunerActive] = useState(false);
  const [detectedPitch, setDetectedPitch] = useState<{ hz: number; note: string; cents: number } | null>(null);
  const tunerStreamRef = useRef<MediaStream | null>(null);
  const tunerCtxRef = useRef<AudioContext | null>(null);
  const tunerAnalyserRef = useRef<AnalyserNode | null>(null);
  const tunerFrameRef = useRef<number | null>(null);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const currentCtxRef = useRef<AudioContext | null>(null);
  const dryGainRef = useRef<GainNode | null>(null);
  const wetGainRef = useRef<GainNode | null>(null);
  const delayNodeRef = useRef<DelayNode | null>(null);
  const delayFeedbackRef = useRef<GainNode | null>(null);

  // Clean up Web Audio graph resources
  const cleanupPreviewEngine = () => {
    try {
      if (currentSourceRef.current) {
        currentSourceRef.current.disconnect();
        currentSourceRef.current = null;
      }
      if (dryGainRef.current) {
        dryGainRef.current.disconnect();
        dryGainRef.current = null;
      }
      if (wetGainRef.current) {
        wetGainRef.current.disconnect();
        wetGainRef.current = null;
      }
      if (currentCtxRef.current) {
        if (currentCtxRef.current.state !== 'closed') {
          currentCtxRef.current.close();
        }
        currentCtxRef.current = null;
      }
    } catch (e) {
      console.warn("Error cleaning up preview engine nodes:", e);
    }
  };

  const stopPreview = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    cleanupPreviewEngine();
    setPlayingTimestamp(null);
  };

  // Real-time audio processor supporting seamless on-the-fly comparing
  const startPreview = (url: string, style: 'Dry' | 'Warm' | 'Echo', useProcessing: boolean, timestamp: number) => {
    stopPreview();

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      currentCtxRef.current = ctx;

      const audio = new Audio(url);
      audio.crossOrigin = "anonymous";
      currentAudioRef.current = audio;

      const source = ctx.createMediaElementSource(audio);
      currentSourceRef.current = source;

      // Define volume node and set current gain value
      const volumeNode = ctx.createGain();
      let currentVol = takeVolumes[timestamp] !== undefined ? takeVolumes[timestamp] : 0.8;
      if (normalizedTakes[timestamp] && normalizationGains[timestamp] !== undefined) {
        currentVol = currentVol * normalizationGains[timestamp];
      }

      const fadeInDur = fadeInDurations[timestamp] || 0;
      if (fadeInDur > 0) {
        volumeNode.gain.setValueAtTime(0, ctx.currentTime);
        volumeNode.gain.linearRampToValueAtTime(currentVol, ctx.currentTime + fadeInDur);
      } else {
        volumeNode.gain.setValueAtTime(currentVol, ctx.currentTime);
      }
      volumeNodeRef.current = volumeNode;

      // Handle Fade-Out scheduling when metadata/duration is loaded
      const setupFadeOut = () => {
        const duration = audio.duration;
        const fadeOutDur = fadeOutDurations[timestamp] || 0;
        if (duration && !isNaN(duration) && fadeOutDur > 0) {
          const actualFadeOutDur = Math.min(fadeOutDur, duration);
          const fadeOutStart = Math.max(0, duration - actualFadeOutDur);
          try {
            volumeNode.gain.setValueAtTime(currentVol, ctx.currentTime + fadeOutStart);
            volumeNode.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
          } catch (e) {
            console.warn("Could not schedule fade out:", e);
          }
        }
      };

      audio.onloadedmetadata = setupFadeOut;
      if (audio.readyState >= 1) { // metadata already loaded
        setupFadeOut();
      }

      source.connect(volumeNode);

      const dryGain = ctx.createGain();
      dryGainRef.current = dryGain;

      const wetGain = ctx.createGain();
      wetGainRef.current = wetGain;

      // Dry path direct to speakers via volume node
      volumeNode.connect(dryGain);
      dryGain.connect(ctx.destination);

      // Effect nodes setup matching target style via volume node
      if (style === 'Warm') {
        const biquad = ctx.createBiquadFilter();
        biquad.type = 'peaking';
        biquad.frequency.value = 250;
        biquad.Q.value = 0.8;
        biquad.gain.value = 10; // Extra rich analog warmth boost

        const highShelf = ctx.createBiquadFilter();
        highShelf.type = 'highshelf';
        highShelf.frequency.value = 3500;
        highShelf.gain.value = 5; // Studio crisp saturation

        volumeNode.connect(biquad);
        biquad.connect(highShelf);
        highShelf.connect(wetGain);
      } else if (style === 'Echo') {
        const delay = ctx.createDelay();
        delay.delayTime.value = 0.38; // Precise echo delay duration
        delayNodeRef.current = delay;

        const feedback = ctx.createGain();
        feedback.gain.value = 0.50; // Delay feedback volume
        delayFeedbackRef.current = feedback;

        const delayFilter = ctx.createBiquadFilter();
        delayFilter.type = 'lowpass';
        delayFilter.frequency.value = 1400; // Warm analog tape echo roll-off

        volumeNode.connect(delay);
        delay.connect(delayFilter);
        delayFilter.connect(feedback);
        feedback.connect(delay); // Create eco loop path

        delayFilter.connect(wetGain);
      } else {
        volumeNode.connect(wetGain);
      }

      wetGain.connect(ctx.destination);

      // Apply selected blend
      if (useProcessing && style !== 'Dry') {
        dryGain.gain.setValueAtTime(0.2, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.95, ctx.currentTime);
      } else {
        dryGain.gain.setValueAtTime(1.0, ctx.currentTime);
        wetGain.gain.setValueAtTime(0.0, ctx.currentTime);
      }

      audio.onended = () => {
        setPlayingTimestamp(null);
        cleanupPreviewEngine();
      };

      audio.play().catch(err => {
        console.warn("Preview play interrupted:", err);
      });
    } catch (err) {
      console.error("Failed to build review Web Audio graph, fallback running:", err);
      const fallbackAudio = new Audio(url);
      currentAudioRef.current = fallbackAudio;
      fallbackAudio.onended = () => setPlayingTimestamp(null);
      fallbackAudio.play().catch(e => console.error("Total audio fallback failed:", e));
    }
  };

  const togglePreviewMode = (mode: 'Original' | 'Processado') => {
    setPreviewMode(mode);

    if (currentCtxRef.current && dryGainRef.current && wetGainRef.current) {
      const ctx = currentCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const isProcessed = mode === 'Processado';
      const activeTake = recordings.find(r => r.timestamp === playingTimestamp);
      const takeStyle = activeTake?.style || 'Dry';

      if (isProcessed && takeStyle !== 'Dry') {
        // Linear cross-fade inside 100ms prevents clicks or sudden sound volume spikes
        dryGainRef.current.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
        wetGainRef.current.gain.linearRampToValueAtTime(0.95, ctx.currentTime + 0.1);
      } else {
        dryGainRef.current.gain.linearRampToValueAtTime(1.0, ctx.currentTime + 0.1);
        wetGainRef.current.gain.linearRampToValueAtTime(0.0, ctx.currentTime + 0.1);
      }
    }
  };

  // Clean elements on unmount
  useEffect(() => {
    return () => {
      stopPreview();
      stopTuner();
    };
  }, []);

  const stopTuner = () => {
    if (tunerFrameRef.current) {
      cancelAnimationFrame(tunerFrameRef.current);
      tunerFrameRef.current = null;
    }
    if (tunerStreamRef.current) {
      tunerStreamRef.current.getTracks().forEach(t => t.stop());
      tunerStreamRef.current = null;
    }
    if (tunerCtxRef.current) {
      if (tunerCtxRef.current.state !== 'closed') {
        tunerCtxRef.current.close().catch(() => {});
      }
      tunerCtxRef.current = null;
    }
    tunerAnalyserRef.current = null;
    setTunerActive(false);
    setDetectedPitch(null);
  };

  const startTuner = async () => {
    if (isRecording || prepCountdown > 0) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tunerStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      tunerCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      tunerAnalyserRef.current = analyser;

      setTunerActive(true);

      const bufferLength = analyser.fftSize;
      const dataArray = new Float32Array(bufferLength);

      const updatePitch = () => {
        if (!tunerAnalyserRef.current) return;
        tunerAnalyserRef.current.getFloatTimeDomainData(dataArray);

        const hz = autoCorrelate(dataArray, ctx.sampleRate);
        if (hz !== -1 && hz > 50 && hz < 1200) {
          const { note, cents } = getNoteFromFrequency(hz);
          setDetectedPitch({ hz, note, cents });
        } else {
          setDetectedPitch(null);
        }

        tunerFrameRef.current = requestAnimationFrame(updatePitch);
      };

      updatePitch();
    } catch (err) {
      console.error("Erro ao iniciar tuner:", err);
      alert("Não foi possível acessar seu microfone para o afinador.");
      stopTuner();
    }
  };

  const handleTunerToggle = () => {
    if (tunerActive) {
      stopTuner();
    } else {
      startTuner();
    }
  };

  // Preparation Countdown Effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (prepCountdown > 0) {
      timer = setTimeout(() => {
        setPrepCountdown(prev => {
          if (prev === 1) {
            triggerActualStart();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [prepCountdown]);

  // Cooldown Timer Effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (recordingCooldown > 0) {
      timer = setTimeout(() => {
        setRecordingCooldown(prev => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [recordingCooldown]);

  const handleRecordButtonClick = () => {
    if (tunerActive) {
      stopTuner();
    }
    if (isRecording) {
      stopRecording();
    } else {
      setPrepCountdown(3);
    }
  };

  const triggerActualStart = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setStream(audioStream);
      
      // Setup Analyser for Volume Visualization
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(audioStream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        setLevel(Math.min(100, (average / 128) * 100)); // Normalize to 100
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();

      const mediaRecorder = new MediaRecorder(audioStream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      const currentStyle = vocalProcessing;
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setRecordings(prev => {
          const count = prev.length + 1;
          return [{ blob, url, timestamp: Date.now(), style: currentStyle, title: `Take #${count}` }, ...prev];
        });
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Auto-play the beat if it's not playing
      if (!isSongPlaying) {
        onTogglePlay();
      }
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setPrepCountdown(0);
      alert("Não foi possível acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Cleanup Audio Analysis
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      setLevel(0);

      stream?.getTracks().forEach(track => track.stop());
      setStream(null);
      
      // Also stop playback for a cleaner "take"
      if (isSongPlaying) {
        onTogglePlay();
      }

      // Activate Cooling countdown timer
      setRecordingCooldown(cooldownDuration);
    }
  };

  const extractMaxPeak = async (rec: typeof recordings[0]): Promise<number> => {
    if (maxPeaks[rec.timestamp] !== undefined) return maxPeaks[rec.timestamp];
    
    setIsNormalizing(prev => ({ ...prev, [rec.timestamp]: true }));
    try {
      const arrayBuffer = await rec.blob.arrayBuffer();
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const tempCtx = new AudioContextClass();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      tempCtx.close();
      
      let maxVal = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const floatData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < floatData.length; i++) {
          const absVal = Math.abs(floatData[i]);
          if (absVal > maxVal) {
            maxVal = absVal;
          }
        }
      }
      
      setMaxPeaks(prev => ({ ...prev, [rec.timestamp]: maxVal }));
      setIsNormalizing(prev => ({ ...prev, [rec.timestamp]: false }));
      return maxVal;
    } catch (err) {
      console.error("Error decoding audio data for peak detection:", err);
      setIsNormalizing(prev => ({ ...prev, [rec.timestamp]: false }));
      return 1.0;
    }
  };

  const computeNormalizationGain = async (rec: typeof recordings[0], targetPercentOverride?: number) => {
    const maxVal = await extractMaxPeak(rec);
    const percent = targetPercentOverride !== undefined 
      ? targetPercentOverride 
      : (normalizationThresholds[rec.timestamp] !== undefined ? normalizationThresholds[rec.timestamp] : 85);
    const targetPeak = percent / 100;
    let gain = 1.0;
    if (maxVal > 0.01) {
      gain = targetPeak / maxVal;
      if (gain > 4) gain = 4;
    }
    setNormalizationGains(prev => ({ ...prev, [rec.timestamp]: gain }));
    return gain;
  };

  const toggleNormalization = async (rec: typeof recordings[0]) => {
    const timestamp = rec.timestamp;
    const isCurrentlyNormalized = !normalizedTakes[timestamp];
    
    setNormalizedTakes(prev => ({ ...prev, [timestamp]: isCurrentlyNormalized }));
    
    let normGain = 1.0;
    if (isCurrentlyNormalized) {
      normGain = await computeNormalizationGain(rec);
    }
    
    if (playingTimestamp === timestamp && volumeNodeRef.current && currentCtxRef.current) {
      try {
        const baseVol = takeVolumes[timestamp] !== undefined ? takeVolumes[timestamp] : 0.8;
        const targetVol = isCurrentlyNormalized ? baseVol * normGain : baseVol;
        volumeNodeRef.current.gain.linearRampToValueAtTime(targetVol, currentCtxRef.current.currentTime + 0.05);
      } catch (err) {
        console.warn("Could not ramp volume node:", err);
      }
    }
  };

  const handleThresholdChange = async (rec: typeof recordings[0], newPercent: number) => {
    const timestamp = rec.timestamp;
    setNormalizationThresholds(prev => ({ ...prev, [timestamp]: newPercent }));
    
    // Calculate new gain immediately (either use cached peak or decode if not done yet)
    let maxVal = maxPeaks[timestamp];
    if (maxVal === undefined) {
      maxVal = await extractMaxPeak(rec);
    }
    
    const targetPeak = newPercent / 100;
    let gain = 1.0;
    if (maxVal > 0.01) {
      gain = targetPeak / maxVal;
      if (gain > 4) gain = 4; // cap gain boost
    }
    setNormalizationGains(prev => ({ ...prev, [timestamp]: gain }));
    
    // If normalization is active right now and this track is currently playing, update in real-time
    if (normalizedTakes[timestamp] && playingTimestamp === timestamp && volumeNodeRef.current && currentCtxRef.current) {
      try {
        const baseVol = takeVolumes[timestamp] !== undefined ? takeVolumes[timestamp] : 0.8;
        const targetVol = baseVol * gain;
        volumeNodeRef.current.gain.linearRampToValueAtTime(targetVol, currentCtxRef.current.currentTime + 0.05);
      } catch (err) {
        console.warn("Could not ramp volume node:", err);
      }
    }
  };

  const handleVolumeChange = (timestamp: number, value: number) => {
    setTakeVolumes(prev => ({ ...prev, [timestamp]: value }));
    if (playingTimestamp === timestamp && volumeNodeRef.current && currentCtxRef.current) {
      try {
        const normGain = normalizedTakes[timestamp] ? (normalizationGains[timestamp] || 1.0) : 1.0;
        volumeNodeRef.current.gain.linearRampToValueAtTime(value * normGain, currentCtxRef.current.currentTime + 0.05);
      } catch (err) {
        console.warn("Could not ramp volume node:", err);
      }
    }
  };

  const deleteRecording = (timestamp: number) => {
    if (playingTimestamp === timestamp) {
      stopPreview();
    }
    setRecordings(prev => prev.filter(r => r.timestamp !== timestamp));
  };

  return (
    <div className="bg-zinc-950/50 border border-zinc-800 rounded-3xl p-6 space-y-6 shadow-2xl relative overflow-hidden">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-white uppercase tracking-tighter flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Estúdio Profissional
          <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[9px] border border-emerald-500/30 rounded font-bold uppercase tracking-widest">PRODUTOR ATIVO</span>
        </h3>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setOnboardingStep(0);
              setShowOnboarding(prev => !prev);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1 text-[10px] font-black rounded-lg uppercase tracking-wider transition-all border",
              showOnboarding 
                ? "text-rose-400 bg-rose-500/10 border-rose-500/20 hover:bg-rose-500/20" 
                : "text-amber-400 bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20"
            )}
          >
            <Sparkles className="w-3 h-3 animate-pulse" />
            {showOnboarding ? "Fechar Guia" : "Guia de Uso"}
          </button>
          <span className="hidden sm:inline text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Input: Microfone Aberto</span>
        </div>
      </div>

      {/* Onboarding Guide Card */}
      <AnimatePresence mode="popLayout">
        {showOnboarding && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: -12 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: -12 }}
            transition={{ type: "spring", duration: 0.4, bounce: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 border border-amber-500/30 rounded-2xl p-5 space-y-4 shadow-xl relative">
              {/* Abs decoration backdrop light blur */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-500/15 text-amber-400 border border-amber-500/20 rounded-lg">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Como utilizar o Estúdio</h4>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Aprenda a gravar e misturar seus vocais passo-a-passo!</span>
                  </div>
                </div>
                <button
                  onClick={finishOnboarding}
                  className="text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-[0.05em] px-2.5 py-1 bg-zinc-900 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
                >
                  Pular Guia
                </button>
              </div>

              {/* Steps Progress Indicator bar */}
              <div className="flex items-center gap-3 justify-between">
                <div className="flex items-center gap-1.5 w-full max-w-xs">
                  {onboardingSteps.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setOnboardingStep(idx)}
                      className={cn(
                        "h-1.5 rounded-full transition-all flex-1",
                        idx === onboardingStep 
                          ? "bg-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]" 
                          : idx < onboardingStep 
                            ? "bg-amber-500/30" 
                            : "bg-zinc-800"
                      )}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-mono font-black text-amber-400">{onboardingStep + 1} / {onboardingSteps.length}</span>
              </div>

              {/* Current Step Component Detail View */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={onboardingStep}
                  initial={{ x: 12, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -12, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center bg-zinc-900/40 border border-zinc-800/50 p-4 rounded-xl"
                >
                  <div className="sm:col-span-2 flex justify-center">
                    <div className="w-12 h-12 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-xl flex items-center justify-center shadow-lg relative shrink-0">
                      {React.createElement(onboardingSteps[onboardingStep].icon, { className: "w-5 h-5" })}
                      <div className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-amber-500 text-zinc-950 rounded-full font-black text-[9px] flex items-center justify-center shadow">
                        {onboardingStep + 1}
                      </div>
                    </div>
                  </div>
                  
                  <div className="sm:col-span-10 space-y-1.5">
                    <h5 className="text-xs font-black text-amber-400 uppercase tracking-wide flex items-center gap-2">
                      {onboardingSteps[onboardingStep].title}
                    </h5>
                    <p className="text-[11px] leading-relaxed text-zinc-300">
                      {onboardingSteps[onboardingStep].description}
                    </p>
                    <div className="text-[9px] text-zinc-400/90 flex items-center gap-1.5 mt-1 bg-zinc-950/40 px-2 py-1 rounded-md border border-zinc-800/40">
                      <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span>{onboardingSteps[onboardingStep].tip}</span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Navigation Actions Footer */}
              <div className="flex items-center justify-between pt-1">
                <button
                  disabled={onboardingStep === 0}
                  onClick={() => setOnboardingStep(prev => prev - 1)}
                  className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-zinc-250 transition-colors disabled:opacity-20 disabled:pointer-events-none"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </button>
                
                {onboardingStep < onboardingSteps.length - 1 ? (
                  <button
                    onClick={() => setOnboardingStep(prev => prev + 1)}
                    className="flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-450 text-zinc-950 text-[10px] font-black rounded-lg transition-all shadow-md hover:shadow-lg shadow-amber-500/10 uppercase tracking-widest"
                  >
                    Próximo
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={finishOnboarding}
                    className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-450 text-zinc-950 text-[10px] font-black rounded-lg transition-all shadow-md hover:shadow-lg shadow-emerald-500/10 uppercase tracking-widest animate-pulse"
                  >
                    Estou Pronto!
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice Processing dropdown and Cooling options */}
      <div className={cn(
        "grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-900/40 border p-4 rounded-2xl transition-all duration-300",
        showOnboarding && onboardingStep === 0 
          ? "border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/30" 
          : "border-zinc-800/60"
      )}>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block">Estilo de Processamento Vocal</label>
          <div className="relative">
            <select
              value={vocalProcessing}
              onChange={(e) => {
                const selected = e.target.value as 'Dry' | 'Warm' | 'Echo';
                setVocalProcessing(selected);
                toneEngine.setVocalProcessingStyle(selected);
              }}
              disabled={isRecording || prepCountdown > 0 || recordingCooldown > 0}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs font-bold text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="Dry">Estúdio Limpo (Dry - Sem Efeitos)</option>
              <option value="Warm">Encorpado Analógico (Warm - Quente & Compressão)</option>
              <option value="Echo">Efeito de Palco (Echo - Delay Espacial & Reverb)</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500">
              <span className="text-[10px]">▼</span>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest block font-bold">Resfriamento de Válvulas</label>
          <div className="relative">
            <select
              value={cooldownDuration}
              onChange={(e) => setCooldownDuration(Number(e.target.value))}
              disabled={isRecording || prepCountdown > 0 || recordingCooldown > 0}
              className="w-full bg-zinc-950 border border-zinc-800 text-xs font-bold text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500/50 appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="3">Silenciar (3 Segundos de Refrigeração)</option>
              <option value="5">Padrão (5 Segundos de Refrigeração)</option>
              <option value="10">Intenso (10 Segundos de Refrigeração)</option>
              <option value="15">Máximo (15 Segundos de Refrigeração)</option>
            </select>
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-zinc-500">
              <span className="text-[10px]">▼</span>
            </div>
          </div>
        </div>
      </div>

      <div className={cn(
        "flex flex-col items-center justify-center py-10 bg-zinc-900/20 rounded-2xl border transition-all duration-300 relative overflow-hidden",
        showOnboarding && (onboardingStep === 1 || onboardingStep === 2)
          ? "border-amber-400 bg-amber-500/5 shadow-[0_0_20px_rgba(245,158,11,0.2)] ring-1 ring-amber-500/30 border-solid"
          : "border-zinc-800/40 border-dashed"
      )}>
        <AnimatePresence mode="wait">
          {prepCountdown > 0 ? (
            <motion.div
              key="prep"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center justify-center gap-2"
            >
              <div className="text-6xl font-black text-rose-500 drop-shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-bounce font-mono">
                {prepCountdown}
              </div>
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] animate-pulse">Ajustando Equipamentos...</span>
            </motion.div>
          ) : recordingCooldown > 0 ? (
            <motion.div
              key="cooldown"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 text-cyan-400"
            >
              <div className="relative w-20 h-20 flex items-center justify-center">
                <RefreshCw className="w-10 h-10 animate-spin relative z-10 text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.4)]" />
                <div className="absolute inset-0 rounded-full border-2 border-dashed border-cyan-800 animate-[spin_10s_linear_infinite]" />
              </div>
              <div className="text-center">
                <div className="text-xs font-black text-white uppercase tracking-wider">Refrigeração Ativa</div>
                <div className="text-[10px] font-black uppercase text-cyan-400 mt-1 tracking-widest">{recordingCooldown}s restantes</div>
              </div>
            </motion.div>
          ) : !isRecording ? (
            <motion.button
              key="start"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={handleRecordButtonClick}
              className="w-24 h-24 bg-zinc-900 border-2 border-zinc-800 rounded-full flex items-center justify-center text-red-500 hover:bg-zinc-800 hover:border-red-500/50 transition-all group shadow-xl"
            >
              <Mic className="w-10 h-10 group-hover:scale-110 transition-transform" />
            </motion.button>
          ) : (
            <div className="relative flex flex-col items-center">
              <motion.button
                key="stop"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                onClick={handleRecordButtonClick}
                className="w-24 h-24 bg-red-600 rounded-full flex items-center justify-center text-white shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-all z-10"
              >
                <Square className="w-8 h-8 fill-current" />
              </motion.button>
              
              {/* Volume Rings */}
              <motion.div 
                className="absolute inset-0 rounded-full border-4 border-red-500/30 -z-0"
                animate={{ scale: 1 + (level / 100) }}
                transition={{ type: "spring", damping: 10, stiffness: 100 }}
              />
              <motion.div 
                className="absolute inset-0 rounded-full border-2 border-red-500/50 -z-0"
                animate={{ scale: 1 + (level / 50) }}
                transition={{ type: "spring", damping: 10, stiffness: 200 }}
              />
            </div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-sm font-medium text-zinc-400">
          {prepCountdown > 0 
            ? "Mantenha o silêncio para a gravação começar..." 
            : recordingCooldown > 0 
              ? "Resfriando circuitos analógicos do microfone..." 
              : isRecording 
                ? "Gravando sua voz..." 
                : "Clique para iniciar o microfone e criar"}
        </p>

        {isRecording && (
          <div className="mt-4 w-48 h-1 bg-zinc-800 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-red-500"
              animate={{ width: `${level}%` }}
              transition={{ type: "spring", bounce: 0, duration: 0.1 }}
            />
          </div>
        )}

        {/* Pitch Frequency Tuner Tool */}
        <div className="w-full max-w-xs mx-auto mt-6 pt-5 border-t border-zinc-900/40">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 label-tuner-pitch">
              <span className={cn("w-1.5 h-1.5 rounded-full", tunerActive ? "bg-emerald-500 animate-pulse" : "bg-zinc-850")} />
              Afinador de Voz (Frequência)
            </span>
            <button
              type="button"
              onClick={handleTunerToggle}
              disabled={isRecording || prepCountdown > 0 || recordingCooldown > 0}
              className={cn(
                "px-2 py-1 text-[8px] font-black rounded uppercase tracking-wider border transition-all disabled:opacity-35 disabled:pointer-events-none tuner-toggle-button",
                tunerActive
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
                  : "bg-zinc-950 border-zinc-850 text-zinc-400 hover:text-zinc-250"
              )}
            >
              {tunerActive ? "Desativar" : "Testar Tom"}
            </button>
          </div>

          <AnimatePresence mode="popLayout">
            {tunerActive && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className="overflow-hidden bg-zinc-950/40 rounded-xl border border-zinc-900 shadow-inner"
              >
                <div className="p-3 space-y-2 text-center">
                  {detectedPitch ? (
                    <div className="space-y-2">
                      <div className="flex items-baseline justify-center gap-1">
                        <span className="text-2xl font-black text-emerald-400 font-sans tracking-tight leading-none drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                          {detectedPitch.note}
                        </span>
                        <span className="text-[8px] font-mono font-bold text-zinc-500">
                          {detectedPitch.hz.toFixed(1)}Hz
                        </span>
                      </div>

                      {/* Pitch fine-tuning scale from -50 to +50 cents */}
                      <div className="space-y-1">
                        <div className="relative h-1.5 bg-zinc-900 border border-zinc-850/60 rounded-full overflow-hidden">
                          {/* Neutral tuning threshold marker */}
                          <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-zinc-800 z-10" />
                          <div className="absolute top-0 bottom-0 left-[35%] w-0.5 bg-zinc-900/80 z-10" />
                          <div className="absolute top-0 bottom-0 right-[35%] w-0.5 bg-zinc-900/80 z-10" />

                          {/* Interactive tuner tick marker */}
                          <motion.div
                            className={cn(
                              "absolute top-0 bottom-0 w-2.5 -ml-1 rounded-full z-20 shadow-md",
                              Math.abs(detectedPitch.cents) <= 8
                                ? "bg-emerald-400 drop-shadow-[0_0_6px_rgba(16,185,129,0.8)]"
                                : Math.abs(detectedPitch.cents) <= 22
                                ? "bg-amber-400"
                                : "bg-red-400"
                            )}
                            animate={{ left: `${50 + (detectedPitch.cents * 1.0)}%` }}
                            transition={{ type: "spring", damping: 15, stiffness: 180 }}
                          />
                        </div>
                        <div className="flex justify-between text-[7px] font-black tracking-widest text-zinc-500 uppercase">
                          <span>BEMOL</span>
                          <span className={cn(
                            "font-black tracking-widest",
                            Math.abs(detectedPitch.cents) <= 8 ? "text-emerald-400 font-semibold" : "text-zinc-500"
                          )}>
                            {Math.abs(detectedPitch.cents) <= 8 ? "AFINADO" : `${detectedPitch.cents > 0 ? "+" : ""}${detectedPitch.cents} Cents`}
                          </span>
                          <span>SUSTENIDO</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-2 flex flex-col items-center gap-1 text-center">
                      <div className="w-4 h-4 rounded-full border border-dashed border-zinc-800 flex items-center justify-center text-[10px] text-zinc-500 animate-[spin_4s_linear_infinite]">
                        ●
                      </div>
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest block leading-tight">
                        Cantarole para ver nota e afinador...
                      </span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className={cn(
        "space-y-4 p-3 rounded-2xl border transition-all duration-300",
        showOnboarding && onboardingStep === 3
          ? "border-amber-400/70 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/20"
          : showOnboarding && onboardingStep === 4
            ? "border-emerald-400/70 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/20"
            : "border-transparent"
      )}>
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest animate-pulse">Takes Recentes (Gravados)</h4>
              <span className="text-[10px] font-bold bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md font-mono">{recordings.length}</span>
            </div>

            {recordings.length > 0 && (
              <button
                type="button"
                onClick={() => setGroupByStyle(prev => !prev)}
                className={cn(
                  "px-2.5 py-1.5 text-[9px] font-black rounded-lg uppercase tracking-wider border border-zinc-800 flex items-center gap-1.5 transition-all self-start sm:self-auto",
                  groupByStyle 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold" 
                    : "bg-zinc-900/60 hover:bg-zinc-850 text-zinc-400 hover:text-zinc-300"
                )}
                title="Agrupar takes por estilo de voz"
              >
                <ListFilter className={cn("w-3 h-3", groupByStyle ? "text-emerald-400 animate-pulse" : "text-zinc-500")} />
                {groupByStyle ? "Agrupado" : "Agrupar por Estilo"}
              </button>
            )}
          </div>

          {/* Segmented Filter Tab Controls */}
          {recordings.length > 0 && (
            <div className="flex items-center gap-1 bg-zinc-950/45 p-1 rounded-xl border border-zinc-900/80 overflow-x-auto select-none no-scrollbar">
              <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest px-2 select-none shrink-0">Filtrar por Estilo:</span>
              {(['All', 'Dry', 'Warm', 'Echo'] as const).map((style) => {
                const count = style === 'All' 
                  ? recordings.length 
                  : recordings.filter(r => r.style === style).length;
                
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setTakeFilter(style)}
                    className={cn(
                      "px-2.5 py-1 text-[9px] font-bold rounded-lg transition-all uppercase tracking-wider flex items-center gap-1.5 shrink-0",
                      takeFilter === style 
                        ? "bg-zinc-900 text-white shadow border border-zinc-800 font-black" 
                        : "text-zinc-500 hover:text-zinc-400 hover:bg-zinc-900/30 font-medium"
                    )}
                  >
                    <span>{style === 'All' ? 'Todos' : style}</span>
                    <span className={cn(
                      "text-[8px] font-mono px-1 rounded",
                      takeFilter === style ? "bg-zinc-850 text-emerald-400" : "bg-zinc-950 text-zinc-650"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
          {recordings.length === 0 ? (
            <div className="py-8 text-center text-zinc-600 text-[10px] uppercase font-bold border border-zinc-900 rounded-xl">
              Nenhuma gravação de voz ainda
            </div>
          ) : (
            (() => {
              const filteredList = takeFilter === 'All'
                ? recordings
                : recordings.filter(rec => rec.style === takeFilter);

              if (filteredList.length === 0) {
                return (
                  <div className="py-8 text-center text-zinc-600 text-[10px] uppercase font-bold border border-zinc-900 rounded-xl">
                    Nenhum take gravado no estilo "{takeFilter}"
                  </div>
                );
              }

              const renderRow = (rec: typeof recordings[number]) => {
                const fullIndex = recordings.findIndex(r => r.timestamp === rec.timestamp);
                const computedDisplayIndex = recordings.length - (fullIndex !== -1 ? fullIndex : 0);
                
                return (
                  <motion.div 
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    key={rec.timestamp}
                    className="recording-take-row bg-zinc-900/60 border border-zinc-800 p-3 rounded-xl flex items-center justify-between group hover:border-emerald-500/30 transition-all shadow-md mt-2 first:mt-0"
                  >
                    <div className="flex items-center gap-3">
                      <MiniWaveform blob={rec.blob} />
                      <div>
                        <div className="text-[11px] font-bold text-white uppercase flex items-center gap-2">
                          {editingTimestamp === rec.timestamp ? (
                            <input
                              type="text"
                              value={tempTitle}
                              onChange={(e) => setTempTitle(e.target.value)}
                              onBlur={() => {
                                setRecordings(prev => prev.map(r => r.timestamp === rec.timestamp ? { ...r, title: tempTitle.trim() || r.title } : r));
                                setEditingTimestamp(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setRecordings(prev => prev.map(r => r.timestamp === rec.timestamp ? { ...r, title: tempTitle.trim() || r.title } : r));
                                  setEditingTimestamp(null);
                                } else if (e.key === 'Escape') {
                                  setEditingTimestamp(null);
                                }
                              }}
                              autoFocus
                              className="take-title-label bg-zinc-950 border border-zinc-700/60 text-white rounded px-1.5 py-0.5 text-[11px] font-bold outline-none max-w-[120px] uppercase font-sans tracking-wide"
                            />
                          ) : (
                            <span
                              onClick={() => {
                                setEditingTimestamp(rec.timestamp);
                                setTempTitle(rec.title || `Take #${computedDisplayIndex}`);
                              }}
                              className="take-title-label cursor-pointer hover:text-emerald-400 font-sans tracking-wide transition-colors"
                              title="Clique para renomear"
                            >
                              {rec.title || `Take #${computedDisplayIndex}`}
                            </span>
                          )}
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider font-mono",
                            rec.style === 'Warm' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            rec.style === 'Echo' ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" :
                            "bg-zinc-800 text-zinc-400 border border-zinc-400/20 text-zinc-400"
                          )}>
                            {rec.style}
                          </span>
                        </div>
                        <div className="text-[9px] text-zinc-500">{(rec.blob.size / 1024 / 1024).toFixed(2)} MB</div>
                      </div>
                    </div>
                    <div id="take-list-item-controls" className="flex items-center gap-2">
                      {/* Dedicated volume slider (range input) */}
                      <div className="flex items-center gap-1.5 bg-zinc-950/80 px-2 py-1 rounded-lg border border-zinc-800 shrink-0">
                        <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">VOL</span>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={takeVolumes[rec.timestamp] !== undefined ? takeVolumes[rec.timestamp] : 0.8}
                          onChange={(e) => handleVolumeChange(rec.timestamp, parseFloat(e.target.value))}
                          className="w-12 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                          title="Ajustar volume do take"
                        />
                      </div>

                      {/* Normalização e Limiar agrupados verticalmente */}
                      <div className="flex flex-col gap-1 min-w-[95px] bg-zinc-950/40 p-1.5 rounded-lg border border-zinc-800/60">
                        {/* Checkbox button control */}
                        <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-white transition-colors" title="Normalizar volume deste take automaticamente">
                          <input
                            type="checkbox"
                            checked={!!normalizedTakes[rec.timestamp]}
                            onChange={() => toggleNormalization(rec)}
                            disabled={isNormalizing[rec.timestamp]}
                            className="w-3 h-3 rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0 cursor-pointer accent-emerald-400 shrink-0"
                          />
                          <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest shrink-0">
                            {isNormalizing[rec.timestamp] ? "CALC..." : "NORM."}
                          </span>
                        </label>

                        {/* Limiar de Normalização (slider de 0 a 100%) */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="flex items-center justify-between text-[6.5px] font-black text-zinc-500 uppercase tracking-widest gap-1 select-none">
                            <span>ALVO/LIMIAR</span>
                            <div className="flex items-center gap-1">
                              <span className="text-zinc-400 text-[6px]">
                                {(normalizationThresholds[rec.timestamp] !== undefined ? normalizationThresholds[rec.timestamp] : 85)}%
                              </span>
                              <button
                                onClick={() => handleThresholdChange(rec, 85)}
                                className="text-zinc-500 hover:text-emerald-400 p-0.5 rounded hover:bg-zinc-800 transition-all cursor-pointer"
                                title="Resetar limiar para o padrão de 85%"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={normalizationThresholds[rec.timestamp] !== undefined ? normalizationThresholds[rec.timestamp] : 85}
                            onChange={(e) => handleThresholdChange(rec, parseInt(e.target.value))}
                            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-400"
                            title="Ajustar o limiar/volume alvo de normalização"
                          />
                        </div>

                        {/* Peak to Threshold Indicator Bar */}
                        {(() => {
                          const peak = maxPeaks[rec.timestamp] !== undefined ? maxPeaks[rec.timestamp] : 0.5;
                          const volume = takeVolumes[rec.timestamp] !== undefined ? takeVolumes[rec.timestamp] : 0.8;
                          const normalized = !!normalizedTakes[rec.timestamp];
                          const gain = normalized ? (normalizationGains[rec.timestamp] !== undefined ? normalizationGains[rec.timestamp] : 1.0) : 1.0;
                          const effectivePeak = peak * volume * gain;
                          const threshold = (normalizationThresholds[rec.timestamp] !== undefined ? normalizationThresholds[rec.timestamp] : 85) / 100;
                          
                          // Calculate percentage of threshold we are hitting
                          const ratio = threshold > 0 ? (effectivePeak / threshold) : 0;
                          const percentageOfThreshold = Math.min(ratio * 100, 100);

                          // Determine color (green -> yellow -> red)
                          let barColorClass = "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]";
                          let labelText = "Abaixo";
                          let textColorClass = "text-emerald-400";
                          if (ratio >= 0.98) {
                            barColorClass = "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)] animate-pulse";
                            labelText = "No Limiar!";
                            textColorClass = "text-rose-400";
                          } else if (ratio >= 0.80) {
                            barColorClass = "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]";
                            labelText = "Próximo";
                            textColorClass = "text-amber-400";
                          } else if (ratio < 0.3) {
                            labelText = "Baixo";
                            textColorClass = "text-zinc-500";
                          }

                          return (
                            <div className="flex flex-col gap-0.5 mt-0.5 pt-0.5 border-t border-zinc-800/40" title={`Pico efetivo: ${(effectivePeak*100).toFixed(0)}% vs Limiar: ${(threshold*100).toFixed(0)}%`}>
                              <div className="flex items-center justify-between text-[5.5px] font-black uppercase tracking-widest leading-none">
                                <span className="text-zinc-600">PICO</span>
                                <span className={cn("font-bold", textColorClass)}>{labelText}</span>
                              </div>
                              <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden flex items-center">
                                <div 
                                  className={cn("h-full rounded-full transition-all duration-300", barColorClass)} 
                                  style={{ width: `${percentageOfThreshold}%` }}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Suavização Fade-In/Out */}
                      <div className="flex flex-col gap-1 min-w-[95px] bg-zinc-950/40 p-1.5 rounded-lg border border-zinc-800/60">
                        <div className="flex items-center gap-1.5 select-none text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                          <span>SUAVIZAÇÃO</span>
                        </div>

                        {/* Fade-In */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="flex items-center justify-between text-[6.5px] font-black text-zinc-500 uppercase tracking-widest gap-1 select-none">
                            <span>FADE-IN</span>
                            <span className="text-zinc-400 text-[6px]">
                              {(fadeInDurations[rec.timestamp] !== undefined ? fadeInDurations[rec.timestamp] : 0).toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="5"
                            step="0.1"
                            value={fadeInDurations[rec.timestamp] !== undefined ? fadeInDurations[rec.timestamp] : 0}
                            onChange={(e) => setFadeInDurations(prev => ({ ...prev, [rec.timestamp]: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-400"
                            title="Ajustar tempo de Fade-In (entrada)"
                          />
                        </div>

                        {/* Fade-Out */}
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <div className="flex items-center justify-between text-[6.5px] font-black text-zinc-500 uppercase tracking-widest gap-1 select-none">
                            <span>FADE-OUT</span>
                            <span className="text-zinc-400 text-[6px]">
                              {(fadeOutDurations[rec.timestamp] !== undefined ? fadeOutDurations[rec.timestamp] : 0).toFixed(1)}s
                            </span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="5"
                            step="0.1"
                            value={fadeOutDurations[rec.timestamp] !== undefined ? fadeOutDurations[rec.timestamp] : 0}
                            onChange={(e) => setFadeOutDurations(prev => ({ ...prev, [rec.timestamp]: parseFloat(e.target.value) }))}
                            className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-400"
                            title="Ajustar tempo de Fade-Out (saída)"
                          />
                        </div>
                      </div>

                      {/* Compare Control Button Group (Only show for takes that aren't purely Dry) */}
                      {rec.style !== 'Dry' && (
                        <div className="flex items-center bg-zinc-950/80 rounded-lg p-0.5 border border-zinc-800 text-[9px] font-black uppercase tracking-wider">
                          <button
                            onClick={() => {
                              const isCurrentPlaying = playingTimestamp === rec.timestamp;
                              if (isCurrentPlaying) {
                                togglePreviewMode('Original');
                              } else {
                                setPreviewMode('Original');
                              }
                            }}
                            className={cn(
                              "px-2 py-1 rounded transition-all",
                              (playingTimestamp === rec.timestamp ? previewMode === 'Original' : previewMode === 'Original')
                                ? "bg-zinc-800 text-zinc-300 shadow" 
                                : "text-zinc-500 hover:text-zinc-400"
                            )}
                            title="Ouvir áudio original limpo (Dry)"
                          >
                            Original
                          </button>
                          <button
                            onClick={() => {
                              const isCurrentPlaying = playingTimestamp === rec.timestamp;
                              if (isCurrentPlaying) {
                                togglePreviewMode('Processado');
                              } else {
                                setPreviewMode('Processado');
                              }
                            }}
                            className={cn(
                              "px-2 py-1 rounded transition-all flex items-center gap-1.5",
                              (playingTimestamp === rec.timestamp ? previewMode === 'Processado' : previewMode === 'Processado')
                                ? "bg-emerald-500/20 text-emerald-400 font-bold shadow" 
                                : "text-zinc-500 hover:text-zinc-400"
                            )}
                            title={`Ouvir com efeito de estúdio (${rec.style})`}
                          >
                            <Sparkles className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                            Estúdio
                          </button>
                        </div>
                      )}

                      <button 
                        onClick={() => {
                          if (playingTimestamp === rec.timestamp) {
                            stopPreview();
                          } else {
                            setPlayingTimestamp(rec.timestamp);
                            startPreview(rec.url, rec.style, previewMode === 'Processado', rec.timestamp);
                          }
                        }}
                        className={cn(
                          "p-2 rounded-lg transition-all border shrink-0",
                          playingTimestamp === rec.timestamp 
                            ? "bg-red-500/10 hover:bg-red-500/20 text-red-100 border-red-500/20" 
                            : "bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700/50"
                        )}
                        title={playingTimestamp === rec.timestamp ? "Pausar" : "Tocar com estilo selecionado"}
                      >
                        {playingTimestamp === rec.timestamp ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                      </button>

                      <button
                        onClick={() => deleteRecording(rec.timestamp)}
                        className="p-2 bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 rounded-lg transition-all border border-zinc-700/50 hover:border-rose-500/30 shrink-0"
                        title="Excluir gravação"
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </button>

                      <button 
                        onClick={() => {
                          stopPreview();
                          onRecordingComplete(rec.blob, rec.style);
                        }}
                        className="px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-[10px] font-black rounded-lg transition-all flex items-center gap-1.5 shadow-lg uppercase tracking-wider shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                        MISTURAR
                      </button>
                    </div>
                  </motion.div>
                );
              };

              if (groupByStyle) {
                const stylesOrder: ('Dry' | 'Warm' | 'Echo')[] = ['Dry', 'Warm', 'Echo'];
                return (
                  <div className="space-y-4">
                    {stylesOrder.map(style => {
                      const styleTakes = filteredList.filter(r => r.style === style);
                      if (styleTakes.length === 0) return null;
                      
                      return (
                        <div key={style} className="space-y-2">
                          <div className="flex items-center gap-2 px-2 py-1 bg-zinc-950/40 rounded-lg border border-zinc-900/65 text-[9px] uppercase font-black tracking-widest text-zinc-400">
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              style === 'Warm' ? "bg-amber-500" :
                              style === 'Echo' ? "bg-cyan-500" :
                              "bg-zinc-500"
                            )} />
                            {style === 'Dry' ? 'Estúdio Limpo (Dry)' :
                             style === 'Warm' ? 'Encorpado Analógico (Warm)' :
                             'Efeito de Palco (Echo)'}
                            <span className="text-[8px] font-bold bg-zinc-900 text-zinc-500 px-1.5 py-0.2 rounded font-mono ml-auto">
                              {styleTakes.length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {styleTakes.map(renderRow)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  {filteredList.map(renderRow)}
                </div>
              );
            })()
          )}
        </div>
      </div>

      <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
        <p className="text-[10px] leading-relaxed text-zinc-400">
          <span className="text-emerald-400 font-bold">Dica do Produtor:</span> Selecione o estilo de processamento vocal antes de gravar ou ao salvar. Ao clicar em <span className="text-white">MISTURAR</span>, a IA transcreverá os harmônicos da voz segundo o estilo acústico escolhido e integrará profissionais de voz à mixagem principal.
        </p>
      </div>
    </div>
  );
};
