'use client';

import { useState } from 'react';
import { Volume2, Headphones, Settings } from 'lucide-react';
import { useAudioStore } from '@/lib/store/audioStore';
import { Track } from '@/lib/types/audio';

interface MixerChannelProps {
  track: Track;
}

export function MixerChannel({ track }: MixerChannelProps) {
  const {
    setTrackVolume,
    setTrackPan,
    setTrackMute,
    setTrackSolo,
    setTrackEQ,
  } = useAudioStore();

  const [showEQ, setShowEQ] = useState(false);

  // Convert dB to fader position (0-100)
  const dbToFader = (db: number): number => {
    return ((db + 60) / 60) * 100;
  };

  // Convert fader position to dB
  const faderToDb = (value: number): number => {
    return (value / 100) * 60 - 60;
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10 min-w-[80px]">
      {/* Track Name */}
      <div className="text-xs font-medium text-center text-gray-300 truncate w-full px-2">
        {track.name}
      </div>

      {/* EQ Section */}
      {showEQ && (
        <div className="w-full space-y-3 p-3 bg-black/40 rounded-lg border border-white/10">
          <div className="text-[10px] font-bold text-gray-400 text-center mb-2">
            3-BAND EQ
          </div>

          {/* High */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-500 w-8">HIGH</span>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={track.eq.high}
              onChange={(e) =>
                setTrackEQ(track.id, 'high', parseFloat(e.target.value))
              }
              className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500"
            />
            <span className="text-[9px] text-gray-400 w-8 text-right">
              {track.eq.high > 0 ? '+' : ''}
              {track.eq.high.toFixed(1)}
            </span>
          </div>

          {/* Mid */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-500 w-8">MID</span>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={track.eq.mid}
              onChange={(e) =>
                setTrackEQ(track.id, 'mid', parseFloat(e.target.value))
              }
              className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500"
            />
            <span className="text-[9px] text-gray-400 w-8 text-right">
              {track.eq.mid > 0 ? '+' : ''}
              {track.eq.mid.toFixed(1)}
            </span>
          </div>

          {/* Low */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-gray-500 w-8">LOW</span>
            <input
              type="range"
              min="-12"
              max="12"
              step="0.5"
              value={track.eq.low}
              onChange={(e) =>
                setTrackEQ(track.id, 'low', parseFloat(e.target.value))
              }
              className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500"
            />
            <span className="text-[9px] text-gray-400 w-8 text-right">
              {track.eq.low > 0 ? '+' : ''}
              {track.eq.low.toFixed(1)}
            </span>
          </div>
        </div>
      )}

      {/* Volume Fader */}
      <div className="relative flex flex-col items-center gap-2 h-48">
        <div className="text-[10px] text-gray-500">
          {track.volume > -60 ? `${track.volume.toFixed(1)} dB` : '-∞'}
        </div>

        {/* Fader Track */}
        <div className="relative flex-1 w-8 bg-gradient-to-b from-green-500 via-yellow-500 to-red-500 rounded-full overflow-hidden opacity-20">
          <div className="absolute inset-0 bg-black/60" />
        </div>

        {/* Fader Handle */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={dbToFader(track.volume)}
          onChange={(e) =>
            setTrackVolume(track.id, faderToDb(parseFloat(e.target.value)))
          }
          className="absolute top-6 left-1/2 -translate-x-1/2 w-40 h-48 -rotate-90 origin-center appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-gradient-to-b [&::-webkit-slider-thumb]:from-gray-200 [&::-webkit-slider-thumb]:to-gray-400 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/30"
        />
      </div>

      {/* Pan Control */}
      <div className="w-full space-y-1">
        <div className="text-[10px] text-gray-500 text-center">PAN</div>
        <div className="flex items-center gap-1">
          <span className="text-[8px] text-gray-600">L</span>
          <input
            type="range"
            min="-1"
            max="1"
            step="0.01"
            value={track.pan}
            onChange={(e) =>
              setTrackPan(track.id, parseFloat(e.target.value))
            }
            className="flex-1 h-1 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          />
          <span className="text-[8px] text-gray-600">R</span>
        </div>
        <div className="text-[9px] text-gray-400 text-center">
          {track.pan === 0
            ? 'C'
            : track.pan < 0
            ? `${Math.abs(track.pan * 50).toFixed(0)}L`
            : `${(track.pan * 50).toFixed(0)}R`}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-1 w-full">
        <button
          onClick={() => setTrackMute(track.id, !track.muted)}
          className={`flex-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
            track.muted
              ? 'bg-red-500 text-white'
              : 'bg-white/10 text-gray-400 hover:bg-white/20'
          }`}
        >
          M
        </button>
        <button
          onClick={() => setTrackSolo(track.id, !track.solo)}
          className={`flex-1 px-2 py-1 rounded text-[10px] font-bold transition-colors ${
            track.solo
              ? 'bg-yellow-500 text-black'
              : 'bg-white/10 text-gray-400 hover:bg-white/20'
          }`}
        >
          S
        </button>
        <button
          onClick={() => setShowEQ(!showEQ)}
          className={`flex-1 px-2 py-1 rounded text-[10px] transition-colors ${
            showEQ
              ? 'bg-violet-500 text-white'
              : 'bg-white/10 text-gray-400 hover:bg-white/20'
          }`}
        >
          <Settings className="w-3 h-3 mx-auto" />
        </button>
      </div>

      {/* Track Color Indicator */}
      <div
        className="w-full h-1 rounded-full"
        style={{ backgroundColor: track.color }}
      />
    </div>
  );
}
