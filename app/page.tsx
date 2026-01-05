'use client';

import { useState } from 'react';
import { Music, ChevronDown, RotateCcw, Share2, Download } from 'lucide-react';
import { RecordButton } from '@/components/RecordButton';
import { StylePicker, type MusicStyle } from '@/components/StylePicker';
import { GenerateButton } from '@/components/GenerateButton';
import { MasterButton } from '@/components/MasterButton';
import { TrackPlayer } from '@/components/TrackPlayer';

type AppStage = 'record' | 'style' | 'generate' | 'master' | 'done';

export default function MobileStudio() {
  // Workflow state
  const [stage, setStage] = useState<AppStage>('record');
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<MusicStyle | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [masteredUrl, setMasteredUrl] = useState<string | null>(null);

  // Handle recording completion
  const handleRecordingComplete = (blob: Blob, url: string) => {
    setRecordedBlob(blob);
    setRecordedAudioUrl(url);
    setStage('style');
  };

  // Handle style selection
  const handleStyleSelect = (style: MusicStyle) => {
    setSelectedStyle(style);
    setStage('generate');
  };

  // Handle generation completion
  const handleGenerateComplete = (url: string) => {
    setGeneratedUrl(url);
    setStage('master');
  };

  // Handle mastering completion
  const handleMasterComplete = (url: string) => {
    setMasteredUrl(url);
    setStage('done');
  };

  // Reset workflow
  const handleReset = () => {
    if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
    if (generatedUrl && generatedUrl !== recordedAudioUrl) URL.revokeObjectURL(generatedUrl);
    if (masteredUrl && masteredUrl !== generatedUrl) URL.revokeObjectURL(masteredUrl);

    setStage('record');
    setRecordedAudioUrl(null);
    setRecordedBlob(null);
    setSelectedStyle(null);
    setGeneratedUrl(null);
    setMasteredUrl(null);
  };

  // Share functionality
  const handleShare = async () => {
    const urlToShare = masteredUrl || generatedUrl || recordedAudioUrl;
    if (!urlToShare) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My AI Music Track',
          text: 'Check out this track I made with AI Music Studio!',
          url: window.location.href,
        });
      } catch (error) {
        console.log('Share cancelled or failed');
      }
    } else {
      // Fallback: copy URL to clipboard
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  // Download functionality
  const handleDownload = () => {
    const urlToDownload = masteredUrl || generatedUrl || recordedAudioUrl;
    if (!urlToDownload) return;

    const a = document.createElement('a');
    a.href = urlToDownload;
    a.download = `ai-music-track-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Progress indicator
  const stages: AppStage[] = ['record', 'style', 'generate', 'master', 'done'];
  const currentStageIndex = stages.indexOf(stage);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="safe-area-top px-4 py-3 flex items-center justify-between border-b border-white/10 bg-black/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center">
            <Music className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-sm">AI Music Studio</span>
        </div>

        <div className="flex items-center gap-2">
          {stage !== 'record' && (
            <button
              onClick={handleReset}
              className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white transition-colors"
              aria-label="Start over"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Progress Bar */}
      <div className="px-4 py-2 bg-black/50">
        <div className="flex gap-1">
          {stages.map((s, i) => (
            <div
              key={s}
              className={`
                h-1 flex-1 rounded-full transition-all duration-300
                ${i <= currentStageIndex
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                  : 'bg-white/10'
                }
              `}
            />
          ))}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col px-4 py-6 overflow-y-auto">
        {/* Stage: Record */}
        {stage === 'record' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <h1 className="text-2xl font-bold text-center">
              Record Your Idea
            </h1>
            <p className="text-gray-400 text-center text-sm max-w-xs">
              Sing, hum, or play something. We'll turn it into a full track.
            </p>
            <RecordButton onRecordingComplete={handleRecordingComplete} />
          </div>
        )}

        {/* Stage: Style */}
        {stage === 'style' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Choose Your Sound</h1>
              <p className="text-gray-400 text-sm mt-1">What vibe are you going for?</p>
            </div>

            {/* Mini Player */}
            <div className="bg-black/40 rounded-2xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center">
                  <Music className="w-6 h-6 text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Your Recording</p>
                  <p className="text-gray-500 text-xs">Tap to preview</p>
                </div>
                {recordedAudioUrl && (
                  <audio src={recordedAudioUrl} controls className="hidden" id="preview-audio" />
                )}
                <button
                  onClick={() => {
                    const audio = document.getElementById('preview-audio') as HTMLAudioElement;
                    if (audio) {
                      if (audio.paused) audio.play();
                      else audio.pause();
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white"
                >
                  <Music className="w-4 h-4" />
                </button>
              </div>
            </div>

            <StylePicker
              selectedStyle={selectedStyle}
              onStyleSelect={handleStyleSelect}
            />

            <div className="flex-1" />

            {/* Continue Button */}
            {selectedStyle && (
              <button
                onClick={() => setStage('generate')}
                className="w-full py-4 rounded-2xl bg-white/10 font-semibold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
              >
                Continue
                <ChevronDown className="w-5 h-5 rotate-[-90deg]" />
              </button>
            )}
          </div>
        )}

        {/* Stage: Generate */}
        {stage === 'generate' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Add Full Band</h1>
              <p className="text-gray-400 text-sm mt-1">
                AI will add instruments matching your {selectedStyle?.replace('-', ' ')} style
              </p>
            </div>

            {/* Style Badge */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/20 border border-violet-500/30">
                <Music className="w-4 h-4 text-violet-400" />
                <span className="text-violet-300 text-sm font-medium capitalize">
                  {selectedStyle?.replace('-', ' ')}
                </span>
              </div>
            </div>

            <div className="flex-1" />

            <GenerateButton
              audioUrl={recordedAudioUrl}
              style={selectedStyle}
              onGenerateComplete={handleGenerateComplete}
            />
          </div>
        )}

        {/* Stage: Master */}
        {stage === 'master' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Polish Your Track</h1>
              <p className="text-gray-400 text-sm mt-1">
                One tap to make it radio-ready
              </p>
            </div>

            {/* Player */}
            <TrackPlayer
              originalUrl={recordedAudioUrl}
              processedUrl={generatedUrl}
              label="With Full Band"
            />

            <div className="flex-1" />

            <MasterButton
              audioUrl={generatedUrl}
              onMasterComplete={handleMasterComplete}
            />

            {/* Skip option */}
            <button
              onClick={() => {
                setMasteredUrl(generatedUrl);
                setStage('done');
              }}
              className="text-gray-500 text-sm text-center hover:text-gray-300 transition-colors"
            >
              Skip mastering
            </button>
          </div>
        )}

        {/* Stage: Done */}
        {stage === 'done' && (
          <div className="flex-1 flex flex-col gap-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
                <Music className="w-8 h-8 text-green-400" />
              </div>
              <h1 className="text-2xl font-bold">Your Track is Ready!</h1>
              <p className="text-gray-400 text-sm mt-1">
                Listen, share, or download
              </p>
            </div>

            {/* Player */}
            <TrackPlayer
              originalUrl={generatedUrl}
              processedUrl={masteredUrl}
              label="Final Mix"
            />

            <div className="flex-1" />

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleShare}
                className="flex-1 py-4 rounded-2xl bg-white/10 font-semibold flex items-center justify-center gap-2 hover:bg-white/20 transition-colors"
              >
                <Share2 className="w-5 h-5" />
                Share
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 font-semibold flex items-center justify-center gap-2 hover:from-violet-500 hover:to-fuchsia-500 transition-colors"
              >
                <Download className="w-5 h-5" />
                Download
              </button>
            </div>

            {/* Start Over */}
            <button
              onClick={handleReset}
              className="py-4 rounded-2xl border border-white/10 font-semibold flex items-center justify-center gap-2 hover:bg-white/5 transition-colors text-gray-400"
            >
              <RotateCcw className="w-5 h-5" />
              Make Another Track
            </button>
          </div>
        )}
      </main>

      {/* Safe area bottom padding */}
      <div className="safe-area-bottom" />
    </div>
  );
}
