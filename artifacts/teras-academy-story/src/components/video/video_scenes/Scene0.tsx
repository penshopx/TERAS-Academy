import { motion } from 'framer-motion';
import { SafeFrame } from '@/lib/video';

export const Scene0 = () => {
  return (
    <SafeFrame className="relative flex flex-col items-center justify-center bg-bg-dark h-full overflow-hidden">
      <motion.div
        className="absolute inset-0 w-full h-full"
        exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
        transition={{ duration: 0.8 }}
      >
        {/* Background Video */}
        <motion.div
          className="absolute inset-0 w-full h-full opacity-40 mix-blend-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ duration: 2 }}
        >
          <video
            src={`${import.meta.env.BASE_URL}videos/data-nodes.mp4`}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Brand Logo */}
        <motion.img
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt="TERAS Academy"
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[6cqw] w-auto z-20"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1, y: '-8cqw' }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        />

        {/* Foreground Content */}
        <div className="z-20 flex flex-col items-center text-center mt-[12cqw]">
          <motion.h1
            className="text-[4.5cqw] font-display font-bold text-text-primary tracking-tight leading-tight max-w-[80%]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, delay: 1.2, ease: 'easeOut' }}
          >
            Mengubah pembelajaran <br />
            <span className="text-primary">menjadi kapabilitas terbukti.</span>
          </motion.h1>
          
          <motion.p
            className="mt-[3cqw] text-[2.2cqw] font-mono text-text-secondary uppercase tracking-widest"
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1, delay: 2.2 }}
          >
            Evidence-Based Capability Development
          </motion.p>
        </div>

        {/* Accents */}
        <motion.div
          className="absolute top-0 right-0 w-[50cqw] h-[50cqw] rounded-full bg-primary opacity-20 blur-[120px]"
          animate={{ x: [100, -100, 100], y: [-50, 50, -50] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        />
      </motion.div>
    </SafeFrame>
  );
};
