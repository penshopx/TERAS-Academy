import { motion } from 'framer-motion';
import { SafeFrame } from '@/lib/video';

export const Scene1 = () => {
  return (
    <SafeFrame className="relative flex flex-col items-center justify-center bg-bg-dark h-full overflow-hidden">
      <motion.div
        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center"
        exit={{ opacity: 0, y: -50 }}
        transition={{ duration: 0.8 }}
      >
        {/* Background Video Continued (Persistent feel via opacity transition) */}
        <motion.div
          className="absolute inset-0 w-full h-full opacity-30 mix-blend-screen"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 0.3, scale: 1 }}
          transition={{ duration: 1.5 }}
        >
          <video
            src={`${import.meta.env.BASE_URL}videos/pathway.mp4`}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Grid Pattern Midground */}
        <motion.div 
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: 'linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.05 }}
          transition={{ duration: 2 }}
        />

        <div className="z-20 w-full flex flex-col items-center px-[8cqw]">
          <motion.h2
            className="text-[3cqw] font-mono text-text-secondary tracking-[0.2em] mb-[6cqw] uppercase"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.2 }}
          >
            Dua Jalur Pembelajaran
          </motion.h2>

          <div className="flex w-full justify-between gap-[4cqw]">
            {/* Path A */}
            <motion.div
              className="flex-1 bg-white/5 border border-primary/30 p-[4cqw] rounded-2xl backdrop-blur-sm relative overflow-hidden"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 0.8, type: 'spring', bounce: 0.3 }}
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-primary" />
              <motion.div 
                className="text-[1.8cqw] font-mono text-primary mb-[2cqw]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
              >
                01
              </motion.div>
              <motion.h3 
                className="text-[3.5cqw] font-display font-bold text-text-primary mb-[1.5cqw]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4 }}
              >
                Path A: Installation
              </motion.h3>
              <motion.p 
                className="text-[2cqw] text-text-secondary leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.6 }}
              >
                Membangun kapabilitas dasar dari nol dengan panduan terstruktur.
              </motion.p>
            </motion.div>

            {/* Path B */}
            <motion.div
              className="flex-1 bg-white/5 border border-primary/30 p-[4cqw] rounded-2xl backdrop-blur-sm relative overflow-hidden"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1, delay: 1.0, type: 'spring', bounce: 0.3 }}
            >
              <div className="absolute top-0 left-0 w-1 h-full bg-secondary" />
              <motion.div 
                className="text-[1.8cqw] font-mono text-secondary mb-[2cqw]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                02
              </motion.div>
              <motion.h3 
                className="text-[3.5cqw] font-display font-bold text-text-primary mb-[1.5cqw]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.6 }}
              >
                Path B: Design
              </motion.h3>
              <motion.p 
                className="text-[2cqw] text-text-secondary leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.8 }}
              >
                Mengasah dan meningkatkan keahlian yang sudah ada ke tingkat lanjut.
              </motion.p>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </SafeFrame>
  );
};
