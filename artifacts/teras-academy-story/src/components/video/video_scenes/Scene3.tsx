import { motion } from 'framer-motion';
import { SafeFrame } from '@/lib/video';
import { useEffect, useState } from 'react';

export const Scene3 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setPhase(1), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <SafeFrame className="relative flex items-center justify-center bg-bg-dark h-full overflow-hidden">
      <motion.div
        className="absolute inset-0 w-full h-full flex flex-col justify-center"
        exit={{ opacity: 0, x: -50 }}
        transition={{ duration: 0.8 }}
      >
        {/* Background Pulse */}
        <motion.div
          className="absolute inset-0 bg-primary/5"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="z-20 w-full px-[10cqw] flex flex-row items-center justify-between">
          
          {/* Left: Text Content */}
          <div className="flex-1 pr-[5cqw]">
            <motion.h2
              className="text-[4.5cqw] font-display font-bold text-text-primary leading-tight mb-[3cqw]"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
            >
              Siklus Assessment <br/>
              <span className="text-secondary">&amp; Remediation</span>
            </motion.h2>

            <motion.p
              className="text-[2.2cqw] text-text-secondary mb-[2cqw]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.8 }}
            >
              Evaluasi berkelanjutan.
            </motion.p>
            
            <motion.p
              className="text-[2.2cqw] text-text-primary font-medium"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 20 }}
              transition={{ duration: 0.8, type: 'spring' }}
            >
              Tutup celah kemampuan hingga mencapai standar keunggulan.
            </motion.p>
          </div>

          {/* Right: Cycle Animation */}
          <div className="flex-1 flex justify-center relative h-[40cqw]">
            <motion.div
              className="absolute w-[30cqw] h-[30cqw] border-[0.3cqw] border-dashed border-primary/40 rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute w-[20cqw] h-[20cqw] border-[0.5cqw] border-secondary rounded-full border-t-transparent"
              animate={{ rotate: -360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            />
            
            {/* Central Core */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[8cqw] h-[8cqw] bg-primary rounded-full shadow-[0_0_40px_rgba(0,195,255,0.6)]"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1, delay: 1, type: 'spring' }}
            />

            {/* Orbits */}
            <motion.div
              className="absolute top-0 left-1/2 w-[3cqw] h-[3cqw] bg-white rounded-full"
              style={{ originY: '15cqw', originX: '-1cqw' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
          </div>
        </div>
      </motion.div>
    </SafeFrame>
  );
};
