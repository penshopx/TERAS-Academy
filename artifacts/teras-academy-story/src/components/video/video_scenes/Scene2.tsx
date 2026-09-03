import { motion } from 'framer-motion';
import { SafeFrame } from '@/lib/video';
import { useEffect, useState } from 'react';

export const Scene2 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer1 = setTimeout(() => setPhase(1), 1500);
    const timer2 = setTimeout(() => setPhase(2), 3500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <SafeFrame className="relative flex flex-col items-center justify-center bg-bg-dark h-full overflow-hidden">
      <motion.div
        className="absolute inset-0 w-full h-full flex flex-col justify-center"
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.8 }}
      >
        {/* Background Shift */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-error/10 via-bg-dark to-primary/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
        />

        <div className="z-20 w-full px-[10cqw] flex flex-col justify-center h-full">
          {/* Shield Icon / Gate Concept */}
          <motion.div
            className="w-[12cqw] h-[12cqw] rounded-full border-[0.5cqw] border-error/50 flex items-center justify-center mb-[4cqw]"
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 1.2, type: 'spring', bounce: 0.4 }}
          >
            <motion.div
              className="w-[6cqw] h-[6cqw] bg-error rounded-sm"
              animate={{ 
                scale: phase >= 2 ? [1, 1.2, 1] : 1,
                rotate: phase >= 2 ? [0, 45, 0] : 0
              }}
              transition={{ duration: 0.5 }}
            />
          </motion.div>

          <motion.h2
            className="text-[5cqw] font-display font-extrabold text-text-primary uppercase tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            Safety Gates
          </motion.h2>

          <motion.p
            className="text-[2.5cqw] text-error font-mono mt-[2cqw] max-w-[80%]"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -30 }}
            transition={{ duration: 0.8, type: 'spring' }}
          >
            Standar kritis yang tidak bisa ditawar.
          </motion.p>

          <motion.div
            className="mt-[4cqw] p-[3cqw] border-l-[0.5cqw] border-error bg-error/10 max-w-[80%]"
            initial={{ opacity: 0, scaleY: 0, transformOrigin: 'top' }}
            animate={{ opacity: phase >= 2 ? 1 : 0, scaleY: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 0.6, ease: 'circOut' }}
          >
            <p className="text-[2.2cqw] text-text-primary leading-relaxed">
              Nilai rendah pada elemen kritis <span className="text-error font-bold">TIDAK DAPAT</span> dikompensasi dengan skor tinggi di area lain.
            </p>
          </motion.div>
        </div>
      </motion.div>
    </SafeFrame>
  );
};
