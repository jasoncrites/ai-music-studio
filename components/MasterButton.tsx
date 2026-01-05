'use client';

import { useState, useEffect } from 'react';
import { Radio, Loader2, Sparkles, Check } from 'lucide-react';

interface MasterButtonProps {
  audioUrl: string | null;
  onMasterComplete: (masteredUrl: string) => void;
  disabled?: boolean;
}

const masteringSteps = [
  'Analyzing dynamics',
  'Applying EQ curve',
  'Compressing peaks',
  'Adding warmth',
  'Maximizing loudness',
  'Final polish',
];

export function MasterButton({ audioUrl, onMasterComplete, disabled = false }: MasterButtonProps) {
  const [isMastering, setIsMastering] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  const canMaster = audioUrl && !disabled;

  useEffect(() => {
    if (!isMastering) {
      setCurrentStep(0);
    }
  }, [isMastering]);

  const handleMaster = async () => {
    if (!canMaster) return;

    setIsMastering(true);
    setIsComplete(false);
    setCurrentStep(0);

    try {
      // Simulate mastering stages
      // In production, this would call your actual mastering API

      for (let step = 0; step < masteringSteps.length; step++) {
        setCurrentStep(step);
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      // TODO: Replace with actual API call
      // const response = await fetch('/api/master', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ audioUrl }),
      // });
      // const { masteredUrl } = await response.json();

      setIsComplete(true);

      // Small delay to show completion state
      await new Promise(resolve => setTimeout(resolve, 500));

      // For demo, use the original audio
      onMasterComplete(audioUrl);

    } catch (error) {
      console.error('Mastering failed:', error);
      alert('Mastering failed. Please try again.');
    } finally {
      setIsMastering(false);
      setIsComplete(false);
    }
  };

  return (
    <div className="w-full">
      {/* Progress Display */}
      {isMastering && (
        <div className="mb-4 p-4 bg-black/40 rounded-2xl border border-amber-500/30">
          <div className="flex items-center gap-3 mb-3">
            {isComplete ? (
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>
            )}
            <span className={`text-sm font-medium ${isComplete ? 'text-green-400' : 'text-amber-400'}`}>
              {isComplete ? 'Radio ready!' : masteringSteps[currentStep]}
            </span>
          </div>

          {/* Step Indicators */}
          <div className="flex gap-1">
            {masteringSteps.map((_, index) => (
              <div
                key={index}
                className={`
                  h-1 flex-1 rounded-full transition-all duration-300
                  ${index <= currentStep
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-white/10'
                  }
                `}
              />
            ))}
          </div>
        </div>
      )}

      {/* Master Button */}
      <button
        onClick={handleMaster}
        disabled={!canMaster || isMastering}
        className={`
          w-full py-5 rounded-2xl font-bold text-lg
          flex items-center justify-center gap-3
          transition-all duration-200 active:scale-98
          ${canMaster && !isMastering
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:from-amber-400 hover:to-orange-400'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }
        `}
      >
        {isMastering ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Mastering...</span>
          </>
        ) : (
          <>
            <Radio className="w-6 h-6" />
            <span>Make Radio Ready</span>
          </>
        )}
      </button>

      {/* Helper Text */}
      {!canMaster && !isMastering && (
        <p className="text-gray-500 text-xs text-center mt-2">
          Generate a track first
        </p>
      )}
    </div>
  );
}
