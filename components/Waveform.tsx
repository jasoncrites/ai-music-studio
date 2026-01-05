'use client';

import { useEffect, useRef } from 'react';

interface WaveformProps {
  waveformData: number[];
  color: string;
  currentTime?: number;
  duration?: number;
  className?: string;
}

/**
 * Canvas-based waveform renderer
 * Displays audio waveform with playhead indicator
 */
export function Waveform({
  waveformData,
  color,
  currentTime = 0,
  duration = 100,
  className = '',
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    const barWidth = canvas.width / waveformData.length;
    const centerY = canvas.height / 2;

    for (let i = 0; i < waveformData.length; i++) {
      const x = i * barWidth;
      const height = (waveformData[i] / 100) * centerY;

      // Gradient for visual appeal
      const gradient = ctx.createLinearGradient(x, centerY - height, x, centerY + height);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '40'); // Semi-transparent

      ctx.fillStyle = gradient;
      ctx.fillRect(x, centerY - height, barWidth - 1, height * 2);
    }

    // Draw playhead if currentTime is set
    if (currentTime > 0 && duration > 0) {
      const playheadX = (currentTime / duration) * canvas.width;
      ctx.strokeStyle = '#ef4444'; // Red
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, canvas.height);
      ctx.stroke();
    }
  }, [waveformData, color, currentTime, duration]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
