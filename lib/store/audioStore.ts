import { create } from 'zustand';
import { Track, AudioState, EQSettings, CompressorSettings, ReverbSettings } from '../types/audio';
import { AudioEngine } from '../audio/engine';

/**
 * Zustand Audio Store
 * Global state management for DAW functionality
 */

// Singleton audio engine instance
let audioEngine: AudioEngine | null = null;

const getEngine = (): AudioEngine => {
  if (!audioEngine) {
    audioEngine = new AudioEngine({
      sampleRate: 48000,
      latencyHint: 'playback',
      maxTracks: 110,
    });
  }
  return audioEngine;
};

interface AudioStore extends AudioState {
  // Playback actions
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setCurrentTime: (time: number) => void;

  // Track actions
  addTrack: (name: string, buffer: AudioBuffer) => void;
  removeTrack: (trackId: string) => void;
  selectTrack: (trackId: string) => void;
  updateTrackName: (trackId: string, name: string) => void;

  // Track audio controls
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackMute: (trackId: string, muted: boolean) => void;
  setTrackSolo: (trackId: string, solo: boolean) => void;

  // Effects
  setTrackEQ: (trackId: string, band: 'low' | 'mid' | 'high', gain: number) => void;
  setTrackCompression: (trackId: string, settings: Partial<CompressorSettings>) => void;
  setTrackReverb: (trackId: string, settings: Partial<ReverbSettings>) => void;

  // Master controls
  setMasterVolume: (volume: number) => void;
  setMasterPan: (pan: number) => void;

  // Project
  setProjectName: (name: string) => void;
  setTempo: (tempo: number) => void;

  // UI
  setZoom: (zoom: number) => void;
  setViewport: (start: number, end: number) => void;

  // Load audio from URL
  loadAudioFromUrl: (trackId: string, url: string) => Promise<void>;

  // Get audio engine
  getAudioEngine: () => AudioEngine;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  // Initial state
  playback: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    loop: false,
  },
  tracks: [],
  activeTrackId: null,
  masterVolume: 0,
  masterPan: 0,
  project: {
    id: 'default-project',
    name: 'Untitled Project',
    sampleRate: 48000,
    bitDepth: 24,
    tempo: 120,
    timeSignature: '4/4',
  },
  zoom: 1.0,
  viewportStart: 0,
  viewportEnd: 100,

  // Playback actions
  play: () => {
    const state = get();
    const engine = getEngine();

    if (!state.playback.isPlaying) {
      const activeTracks = state.tracks.filter(t => !t.muted);
      engine.startPlayback(activeTracks, state.playback.currentTime);

      set({
        playback: {
          ...state.playback,
          isPlaying: true,
        },
      });
    }
  },

  pause: () => {
    const engine = getEngine();
    engine.pausePlayback();

    set((state) => ({
      playback: {
        ...state.playback,
        isPlaying: false,
        currentTime: engine.getCurrentTime(),
      },
    }));
  },

  stop: () => {
    const engine = getEngine();
    engine.stopPlayback();

    set((state) => ({
      playback: {
        ...state.playback,
        isPlaying: false,
        currentTime: 0,
      },
    }));
  },

  seek: (time: number) => {
    const state = get();
    const engine = getEngine();

    if (state.playback.isPlaying) {
      engine.stopPlayback();
      set({ playback: { ...state.playback, currentTime: time } });
      engine.startPlayback(state.tracks, time);
    } else {
      set({ playback: { ...state.playback, currentTime: time } });
    }
  },

  setCurrentTime: (time: number) => {
    set((state) => ({
      playback: {
        ...state.playback,
        currentTime: time,
      },
    }));
  },

  // Track actions
  addTrack: (name: string, buffer: AudioBuffer) => {
    const engine = getEngine();
    const trackId = `track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Create nodes for this track
    engine.createTrackNodes(trackId);

    // Extract waveform data
    const waveform = engine.extractWaveform(buffer, 100);

    // Calculate duration
    const duration = buffer.duration;

    const newTrack: Track = {
      id: trackId,
      name,
      buffer,
      volume: 0, // 0 dB
      pan: 0,
      muted: false,
      solo: false,
      regions: [],
      eq: { low: 0, mid: 0, high: 0 },
      compression: {
        threshold: -24,
        ratio: 4,
        attack: 0.003,
        release: 0.25,
        knee: 30,
      },
      reverb: { amount: 0, duration: 2.0, enabled: false },
      tape: {
        enabled: false,
        drive: 30,
        warmth: 40,
        saturation: 35,
        tapeSpeed: '15',
        tapeType: 'modern',
        wowFlutter: 5,
        hiss: 2,
      },
      fet: {
        enabled: false,
        inputGain: 0,
        outputGain: 0,
        attack: 4,
        release: 4,
        ratio: '4',
        mix: 100,
      },
      opto: {
        enabled: false,
        peakReduction: 40,
        gain: 0,
        mode: 'compress',
        mix: 100,
        emphasis: 0,
      },
      isSelected: false,
      isCollapsed: false,
      color: `hsl(${Math.random() * 360}, 70%, 60%)`,
      waveform,
    };

    set((state) => ({
      tracks: [...state.tracks, newTrack],
      playback: {
        ...state.playback,
        duration: Math.max(state.playback.duration, duration),
      },
    }));
  },

  removeTrack: (trackId: string) => {
    const engine = getEngine();
    engine.removeTrack(trackId);

    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== trackId),
      activeTrackId: state.activeTrackId === trackId ? null : state.activeTrackId,
    }));
  },

  selectTrack: (trackId: string) => {
    set((state) => ({
      tracks: state.tracks.map((t) => ({
        ...t,
        isSelected: t.id === trackId,
      })),
      activeTrackId: trackId,
    }));
  },

  updateTrackName: (trackId: string, name: string) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, name } : t)),
    }));
  },

  // Track audio controls
  setTrackVolume: (trackId: string, volume: number) => {
    const engine = getEngine();
    engine.setTrackVolume(trackId, volume);

    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, volume } : t)),
    }));
  },

  setTrackPan: (trackId: string, pan: number) => {
    const engine = getEngine();
    engine.setTrackPan(trackId, pan);

    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, pan } : t)),
    }));
  },

  setTrackMute: (trackId: string, muted: boolean) => {
    set((state) => ({
      tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, muted } : t)),
    }));
  },

  setTrackSolo: (trackId: string, solo: boolean) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, solo }
          : { ...t, muted: solo ? true : t.muted }
      ),
    }));
  },

  // Effects
  setTrackEQ: (trackId: string, band: 'low' | 'mid' | 'high', gain: number) => {
    const engine = getEngine();
    engine.setTrackEQ(trackId, band, gain);

    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, eq: { ...t.eq, [band]: gain } }
          : t
      ),
    }));
  },

  setTrackCompression: (trackId: string, settings: Partial<CompressorSettings>) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, compression: { ...t.compression, ...settings } }
          : t
      ),
    }));
  },

  setTrackReverb: (trackId: string, settings: Partial<ReverbSettings>) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, reverb: { ...t.reverb, ...settings } }
          : t
      ),
    }));
  },

  // Master controls
  setMasterVolume: (volume: number) => {
    const engine = getEngine();
    engine.setMasterVolume(volume);

    set({ masterVolume: volume });
  },

  setMasterPan: (pan: number) => {
    set({ masterPan: pan });
  },

  // Project
  setProjectName: (name: string) => {
    set((state) => ({
      project: { ...state.project, name },
    }));
  },

  setTempo: (tempo: number) => {
    set((state) => ({
      project: { ...state.project, tempo },
    }));
  },

  // UI
  setZoom: (zoom: number) => {
    set({ zoom });
  },

  setViewport: (start: number, end: number) => {
    set({ viewportStart: start, viewportEnd: end });
  },

  // Load audio from URL
  loadAudioFromUrl: async (trackId: string, url: string) => {
    try {
      const engine = getEngine();
      const buffer = await engine.loadAudioBuffer(url);

      set((state) => ({
        tracks: state.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                buffer,
                waveform: engine.extractWaveform(buffer, 100),
              }
            : t
        ),
      }));
    } catch (error) {
      console.error('[AudioStore] Failed to load audio:', error);
      throw error;
    }
  },

  // Get audio engine
  getAudioEngine: () => getEngine(),
}));
