'use client';

import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, Volume2, VolumeX, ToggleLeft, ToggleRight } from 'lucide-react';

interface TrackPlayerProps {
  originalUrl: string | null;
  processedUrl: string | null;
  label?: string;
}

export function TrackPlayer({ originalUrl, processedUrl, label = 'Your Track' }: TrackPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showProcessed, setShowProcessed] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const currentUrl = showProcessed && processedUrl ? processedUrl : originalUrl;
  const hasProcessed = !!processedUrl;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = currentUrl || '';
      audioRef.current.load();

      // Maintain playback state when switching
      if (isPlaying && currentUrl) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [currentUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    if (!audioRef.current || !currentUrl) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => {});
    }
    setIsPlaying(!isPlaying);
  };

  const handleRestart = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    setCurrentTime(0);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !progressRef.current || !duration) return;

    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = (clickX / rect.width) * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!currentUrl) {
    return (
      <div className="w-full p-6 bg-black/40 rounded-2xl border border-white/10">
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-gray-500">
          <Play className="w-8 h-8" />
          <span className="text-sm">No audio yet</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-black/40 rounded-2xl border border-white/10 overflow-hidden">
      {/* Hidden Audio Element */}
      <audio ref={audioRef} preload="metadata" />

      {/* Header with Toggle */}
      {hasProcessed && (
        <div className="px-4 pt-4 flex items-center justify-between">
          <span className="text-gray-400 text-sm font-medium">{label}</span>
          <button
            onClick={() => setShowProcessed(!showProcessed)}
            className={`
              flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium
              transition-all duration-200
              ${showProcessed
                ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }
            `}
          >
            {showProcessed ? (
              <>
                <ToggleRight className="w-4 h-4" />
                <span>After</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-4 h-4" />
                <span>Before</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Waveform / Progress Bar */}
      <div className="px-4 py-3">
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className="h-12 bg-white/5 rounded-xl relative cursor-pointer overflow-hidden"
        >
          {/* Fake Waveform Background */}
          <div className="absolute inset-0 flex items-center justify-center gap-[2px] px-2 opacity-30">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className={`flex-1 rounded-full ${showProcessed ? 'bg-violet-500' : 'bg-amber-500'}`}
                style={{
                  height: `${20 + Math.sin(i * 0.3) * 30 + Math.random() * 20}%`,
                }}
              />
            ))}
          </div>

          {/* Progress Overlay */}
          <div
            className={`
              absolute inset-y-0 left-0 flex items-center justify-center gap-[2px] px-2
              ${showProcessed ? 'bg-violet-500/30' : 'bg-amber-500/30'}
            `}
            style={{ width: `${progress}%` }}
          >
            {Array.from({ length: 50 }).map((_, i) => {
              const barProgress = (i / 50) * 100;
              if (barProgress > progress) return null;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-full ${showProcessed ? 'bg-violet-400' : 'bg-amber-400'}`}
                  style={{
                    height: `${20 + Math.sin(i * 0.3) * 30 + Math.random() * 20}%`,
                  }}
                />
              );
            })}
          </div>

          {/* Playhead */}
          <div
            className={`absolute top-0 bottom-0 w-0.5 ${showProcessed ? 'bg-violet-400' : 'bg-amber-400'}`}
            style={{ left: `${progress}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 pb-4 flex items-center justify-between">
        {/* Time */}
        <span className="text-gray-500 text-xs font-mono w-16">
          {formatTime(currentTime)}
        </span>

        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestart}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className={`
              w-14 h-14 rounded-full flex items-center justify-center
              transition-all duration-200 active:scale-95
              ${showProcessed
                ? 'bg-violet-500 hover:bg-violet-400 shadow-[0_0_20px_rgba(139,92,246,0.3)]'
                : 'bg-amber-500 hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
              }
            `}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 text-white fill-white" />
            ) : (
              <Play className="w-6 h-6 text-white fill-white ml-1" />
            )}
          </button>

          <button
            onClick={toggleMute}
            className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        {/* Duration */}
        <span className="text-gray-500 text-xs font-mono w-16 text-right">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
