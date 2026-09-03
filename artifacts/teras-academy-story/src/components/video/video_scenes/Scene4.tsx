import { motion } from 'framer-motion';
import { SafeFrame } from '@/lib/video';

export const Scene4 = () => {
  return (
    <SafeFrame className="relative flex flex-col items-center justify-center bg-bg-dark h-full overflow-hidden">
      <motion.div
        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center"
        exit={{ opacity: 0, filter: 'blur(20px)' }}
        transition={{ duration: 1 }}
      >
        {/* Background Image / Render */}
        <motion.div
          className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen"
          initial={{ opacity: 0, scale: 1.2 }}
          animate={{ opacity: 0.5, scale: 1 }}
          transition={{ duration: 2, ease: 'easeOut' }}
        >
          <img
            src={`${import.meta.env.BASE_URL}images/passport.png`}
            alt="Capability Passport"
            className="w-full h-full object-cover"
          />
        </motion.div>

        {/* Dramatic Vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-bg-dark/80 to-bg-dark" />

        <div className="z-20 flex flex-col items-center text-center mt-[15cqw]">
          <motion.div
            className="inline-block bg-primary/20 text-primary border border-primary px-[2cqw] py-[1cqw] rounded-full text-[1.8cqw] font-mono tracking-widest mb-[4cqw]"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            Kesiapan Terbukti
          </motion.div>

          <motion.h1
            className="text-[6cqw] font-display font-extrabold text-white tracking-tight leading-none mb-[3cqw]"
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, delay: 1, ease: 'easeOut' }}
          >
            Capability Passport
          </motion.h1>

          <motion.p
            className="text-[2.5cqw] text-text-secondary max-w-[70%]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 2 }}
          >
            Bukan sekadar sertifikat. <br/>
            <span className="text-white font-bold">Ini adalah bukti sejati kapabilitas Anda.</span>
          </motion.p>
        </div>

        {/* Final Logo Lockup */}
        <motion.img
          src={`${import.meta.env.BASE_URL}logo.svg`}
          alt="TERAS Academy"
          className="absolute bottom-[5cqw] h-[8cqw] w-auto z-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, delay: 3 }}
        />
      </motion.div>
    </SafeFrame>
  );
};
