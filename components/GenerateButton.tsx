'use client';

import { useState, useEffect } from 'react';
import { Users, Loader2, Check, Music } from 'lucide-react';
import type { MusicStyle } from './StylePicker';

interface GenerateButtonProps {
  audioUrl: string | null;
  style: MusicStyle | null;
  onGenerateComplete: (generatedUrl: string) => void;
  disabled?: boolean;
}

const stylePrompts: Record<MusicStyle, string> = {
  'outlaw': 'Outlaw country style with raw acoustic guitar, honky-tonk piano, warm bass, sparse drums. Think Willie Nelson, Waylon Jennings - authentic, rebellious, storytelling feel.',
  'nashville': 'Modern Nashville country pop with polished production, electric guitars, programmed drums, bright synths, radio-ready mix. Contemporary commercial country sound.',
  'muscle-shoals': 'Muscle Shoals soul-country fusion with warm Hammond organ, tight rhythm section, horn stabs, funky bass. Southern soul meets country authenticity.',
  'honky-tonk': 'Texas honky-tonk with twangy telecaster, walking bass, shuffle drums, steel guitar, dance hall energy. Classic country swing feel.',
};

const stages = [
  { id: 'analyzing', label: 'Analyzing', icon: Music },
  { id: 'composing', label: 'Composing', icon: Music },
  { id: 'mixing', label: 'Adding Band', icon: Users },
  { id: 'finalizing', label: 'Finalizing', icon: Check },
];

export function GenerateButton({ audioUrl, style, onGenerateComplete, disabled = false }: GenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);

  const canGenerate = audioUrl && style && !disabled;

  useEffect(() => {
    if (!isGenerating) {
      setCurrentStage(0);
      setProgress(0);
    }
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setCurrentStage(0);
    setProgress(0);

    try {
      // Simulate AI generation stages with progress
      // In production, this would call your actual generate API

      for (let stage = 0; stage < stages.length; stage++) {
        setCurrentStage(stage);

        // Simulate stage progress
        for (let p = 0; p <= 100; p += 5) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setProgress(p);
        }
      }

      // TODO: Replace with actual API call
      // const response = await fetch('/api/generate', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     audioUrl,
      //     style,
      //     prompt: stylePrompts[style],
      //   }),
      // });
      // const { generatedUrl } = await response.json();

      // For demo, use the original audio
      onGenerateComplete(audioUrl);

    } catch (error) {
      console.error('Generation failed:', error);
      alert('Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="w-full">
      {/* Progress Display */}
      {isGenerating && (
        <div className="mb-4 p-4 bg-black/40 rounded-2xl border border-violet-500/30">
          {/* Stages */}
          <div className="flex items-center justify-between mb-3">
            {stages.map((stage, index) => {
              const isComplete = index < currentStage;
              const isCurrent = index === currentStage;
              const Icon = stage.icon;

              return (
                <div key={stage.id} className="flex flex-col items-center gap-1">
                  <div
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center
                      transition-all duration-300
                      ${isComplete
                        ? 'bg-violet-500 text-white'
                        : isCurrent
                          ? 'bg-violet-500/30 text-violet-400 animate-pulse'
                          : 'bg-white/10 text-gray-600'
                      }
                    `}
                  >
                    {isComplete ? (
                      <Check className="w-4 h-4" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <span className={`text-xs ${isCurrent ? 'text-violet-400' : 'text-gray-500'}`}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300"
              style={{ width: `${((currentStage * 100) + progress) / stages.length}%` }}
            />
          </div>
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={!canGenerate || isGenerating}
        className={`
          w-full py-5 rounded-2xl font-bold text-lg
          flex items-center justify-center gap-3
          transition-all duration-200 active:scale-98
          ${canGenerate && !isGenerating
            ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_0_30px_rgba(139,92,246,0.4)] hover:from-violet-500 hover:to-fuchsia-500'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Creating Magic...</span>
          </>
        ) : (
          <>
            <Users className="w-6 h-6" />
            <span>Add Full Band</span>
          </>
        )}
      </button>

      {/* Helper Text */}
      {!canGenerate && !isGenerating && (
        <p className="text-gray-500 text-xs text-center mt-2">
          {!audioUrl ? 'Record something first' : !style ? 'Pick a style' : ''}
        </p>
      )}
    </div>
  );
}
