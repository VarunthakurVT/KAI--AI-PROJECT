import { motion } from 'framer-motion';

interface TapeVisualizerProps {
  waveformData: number[];
  isPlaying?: boolean;
}

export function TapeVisualizer({ waveformData, isPlaying = false }: TapeVisualizerProps) {
  return (
    <div className="flex items-center gap-[2px] h-12 px-2">
      {waveformData.map((amplitude, i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-gradient-to-t from-amber-600 to-amber-400"
          initial={{ height: 4 }}
          animate={{
            height: isPlaying ? amplitude * 48 : amplitude * 24,
            opacity: isPlaying ? 1 : 0.6,
          }}
          transition={{
            duration: 0.15,
            delay: isPlaying ? i * 0.02 : 0,
          }}
        />
      ))}
    </div>
  );
}
