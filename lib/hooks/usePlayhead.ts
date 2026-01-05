import { useEffect, useRef } from 'react';
import { useAudioStore } from '../store/audioStore';

/**
 * Custom hook for real-time playhead synchronization
 * Updates playhead position at 60fps during playback
 */
export function usePlayhead() {
  const { playback, setCurrentTime, getAudioEngine } = useAudioStore();
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!playback.isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const engine = getAudioEngine();

    // High-precision playhead update loop
    const updatePlayhead = () => {
      if (playback.isPlaying) {
        const currentTime = engine.getCurrentTime();
        setCurrentTime(currentTime);

        // Continue loop
        animationFrameRef.current = requestAnimationFrame(updatePlayhead);
      }
    };

    // Start the loop
    animationFrameRef.current = requestAnimationFrame(updatePlayhead);

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [playback.isPlaying, setCurrentTime, getAudioEngine]);

  return playback.currentTime;
}
