import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { Persona } from '../../../shared/types';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';

interface TypingIndicatorProps {
  persona: Persona;
  personas: Persona[];
}

const commonPhrases = [
  '고민을 읽고 있어요',
  '답을 쓰고 있어요',
  '깊이 생각하고 있어요. 조금만 기다려 주세요',
];

export const TypingIndicator = ({ persona, personas }: TypingIndicatorProps) => {
  const reduceMotion = useReducedMotion();
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setPhraseIndex(1), 4000),
      window.setTimeout(() => setPhraseIndex(2), 8000),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return (
    <div className="flex w-full items-center gap-2.5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-toss-gray-100 bg-paper shadow-soft">
        {getPersonaIcon(persona.name, personas)}
      </div>
      <div className="flex items-center gap-2 rounded-lg rounded-tl-sm border border-toss-gray-100 bg-toss-gray-50 px-4 py-3 shadow-soft">
        <div className="flex items-center gap-1" aria-hidden="true">
          {reduceMotion ? (
            <span className="t-body text-toss-gray-400">···</span>
          ) : (
            [0, 1, 2].map((dot) => (
              <motion.span
                key={dot}
                className="h-1.5 w-1.5 rounded-full bg-toss-gray-400"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.9, delay: dot * 0.12, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))
          )}
        </div>
        <span className="t-caption text-toss-gray-500">
          {persona.name}이 {commonPhrases[phraseIndex]}
        </span>
      </div>
    </div>
  );
};
