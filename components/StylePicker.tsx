'use client';

import { useState } from 'react';
import { Guitar, Music2, Disc3, Mic2 } from 'lucide-react';

export type MusicStyle = 'outlaw' | 'nashville' | 'muscle-shoals' | 'honky-tonk';

interface StyleOption {
  id: MusicStyle;
  name: string;
  icon: typeof Guitar;
  color: string;
  description: string;
}

const styles: StyleOption[] = [
  {
    id: 'outlaw',
    name: 'Outlaw Country',
    icon: Guitar,
    color: 'amber',
    description: 'Willie, Waylon, raw & real',
  },
  {
    id: 'nashville',
    name: 'Modern Nashville',
    icon: Music2,
    color: 'blue',
    description: 'Polished country pop',
  },
  {
    id: 'muscle-shoals',
    name: 'Muscle Shoals',
    icon: Disc3,
    color: 'emerald',
    description: 'Soul-infused southern',
  },
  {
    id: 'honky-tonk',
    name: 'Texas Honky-Tonk',
    icon: Mic2,
    color: 'rose',
    description: 'Classic dance hall vibes',
  },
];

interface StylePickerProps {
  selectedStyle: MusicStyle | null;
  onStyleSelect: (style: MusicStyle) => void;
  disabled?: boolean;
}

export function StylePicker({ selectedStyle, onStyleSelect, disabled = false }: StylePickerProps) {
  return (
    <div className="w-full">
      <h3 className="text-gray-400 text-sm font-medium mb-3 text-center">Pick Your Sound</h3>
      <div className="grid grid-cols-2 gap-3">
        {styles.map((style) => {
          const Icon = style.icon;
          const isSelected = selectedStyle === style.id;

          // Color classes based on style
          const colorClasses = {
            amber: {
              bg: isSelected ? 'bg-amber-500/20' : 'bg-white/5',
              border: isSelected ? 'border-amber-500/50' : 'border-white/10',
              icon: isSelected ? 'text-amber-400' : 'text-gray-500',
              text: isSelected ? 'text-amber-100' : 'text-gray-300',
              glow: isSelected ? 'shadow-[0_0_20px_rgba(245,158,11,0.2)]' : '',
            },
            blue: {
              bg: isSelected ? 'bg-blue-500/20' : 'bg-white/5',
              border: isSelected ? 'border-blue-500/50' : 'border-white/10',
              icon: isSelected ? 'text-blue-400' : 'text-gray-500',
              text: isSelected ? 'text-blue-100' : 'text-gray-300',
              glow: isSelected ? 'shadow-[0_0_20px_rgba(59,130,246,0.2)]' : '',
            },
            emerald: {
              bg: isSelected ? 'bg-emerald-500/20' : 'bg-white/5',
              border: isSelected ? 'border-emerald-500/50' : 'border-white/10',
              icon: isSelected ? 'text-emerald-400' : 'text-gray-500',
              text: isSelected ? 'text-emerald-100' : 'text-gray-300',
              glow: isSelected ? 'shadow-[0_0_20px_rgba(16,185,129,0.2)]' : '',
            },
            rose: {
              bg: isSelected ? 'bg-rose-500/20' : 'bg-white/5',
              border: isSelected ? 'border-rose-500/50' : 'border-white/10',
              icon: isSelected ? 'text-rose-400' : 'text-gray-500',
              text: isSelected ? 'text-rose-100' : 'text-gray-300',
              glow: isSelected ? 'shadow-[0_0_20px_rgba(244,63,94,0.2)]' : '',
            },
          };

          const colors = colorClasses[style.color as keyof typeof colorClasses];

          return (
            <button
              key={style.id}
              onClick={() => onStyleSelect(style.id)}
              disabled={disabled}
              className={`
                p-4 rounded-2xl border transition-all duration-200
                flex flex-col items-center gap-2 text-center
                active:scale-95 min-h-[100px]
                ${colors.bg} ${colors.border} ${colors.glow}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/20'}
              `}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSelected ? colors.bg : 'bg-white/5'}`}>
                <Icon className={`w-5 h-5 ${colors.icon}`} />
              </div>
              <div>
                <p className={`font-semibold text-sm ${colors.text}`}>{style.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{style.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
