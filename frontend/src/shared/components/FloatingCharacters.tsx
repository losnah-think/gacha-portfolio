import { motion } from 'framer-motion';

interface FloatingChar {
  src: string;
  size: number;
  top: string;
  left: string;
  delay: number;
  duration: number;
  rotate: number;
  opacity: number;
}

const FLOATING_CHARS: FloatingChar[] = [
  { src: '/images/personas/cat.png', size: 48, top: '-8px', left: '85%', delay: 0, duration: 4.5, rotate: 12, opacity: 0.18 },
  { src: '/images/personas/alien.png', size: 40, top: '80px', left: '-6%', delay: 0.8, duration: 5, rotate: -15, opacity: 0.14 },
  { src: '/images/personas/einstein.png', size: 32, top: '160px', left: '75%', delay: 1.6, duration: 5.8, rotate: 18, opacity: 0.12 },
  { src: '/images/personas/chicken.png', size: 36, top: '280px', left: '92%', delay: 1.5, duration: 4, rotate: 8, opacity: 0.15 },
  { src: '/images/personas/nagging_mom.png', size: 30, top: '360px', left: '5%', delay: 0.3, duration: 6, rotate: -20, opacity: 0.12 },
  { src: '/images/personas/marilyn_monroe.png', size: 34, top: '440px', left: '60%', delay: 2.2, duration: 5.2, rotate: 10, opacity: 0.11 },
  { src: '/images/personas/future_robot.png', size: 38, top: '520px', left: '-4%', delay: 2, duration: 5.5, rotate: -10, opacity: 0.13 },
  { src: '/images/personas/musician.png', size: 28, top: '600px', left: '90%', delay: 0.5, duration: 5.6, rotate: 22, opacity: 0.1 },
  { src: '/images/personas/steve_jobs.png', size: 32, top: '680px', left: '10%', delay: 1.0, duration: 5.3, rotate: -12, opacity: 0.11 },
  { src: '/images/personas/writer.png', size: 30, top: '760px', left: '80%', delay: 1.8, duration: 4.8, rotate: 15, opacity: 0.12 },
  { src: '/images/personas/smartphone.png', size: 26, top: '840px', left: '2%', delay: 2.5, duration: 5, rotate: -18, opacity: 0.1 },
  { src: '/images/personas/socrates.png', size: 36, top: '920px', left: '88%', delay: 0.9, duration: 4.2, rotate: 10, opacity: 0.12 },
  { src: '/images/personas/digital.png', size: 28, top: '1000px', left: '20%', delay: 1.3, duration: 6.2, rotate: -8, opacity: 0.1 },
  { src: '/images/personas/king_sejong.png', size: 34, top: '1080px', left: '70%', delay: 2.0, duration: 5.4, rotate: 14, opacity: 0.11 },
  { src: '/images/personas/yi_sun_shin.png', size: 30, top: '1160px', left: '4%', delay: 0.6, duration: 4.6, rotate: -16, opacity: 0.12 },
  { src: '/images/personas/chatty_taxi_driver.png', size: 32, top: '1240px', left: '85%', delay: 1.4, duration: 5.8, rotate: 8, opacity: 0.1 },
];

export const FloatingCharacters = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      {FLOATING_CHARS.map((char, i) => (
        <motion.img
          key={i}
          src={char.src}
          alt=""
          className="absolute rounded-full"
          style={{
            width: char.size,
            height: char.size,
            top: char.top,
            left: char.left,
            opacity: char.opacity,
            rotate: `${char.rotate}deg`,
            filter: 'blur(0.3px)',
          }}
          animate={{
            y: [0, -12, 0, 8, 0],
            rotate: [char.rotate, char.rotate + 5, char.rotate, char.rotate - 3, char.rotate],
            scale: [1, 1.05, 1, 0.97, 1],
          }}
          transition={{
            duration: char.duration,
            repeat: Infinity,
            delay: char.delay,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};
