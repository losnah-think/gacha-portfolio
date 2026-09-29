import { motion, useReducedMotion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import type { ChatMessage, Persona } from '../../../shared/types';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { cn } from '../../../shared/utils/cn';
import { fadeUp, staggerList } from '../../../shared/motion';

interface ChatBubbleProps {
  message: ChatMessage;
  persona: Persona;
  personas: Persona[];
  showAvatar: boolean;
  onRetry?: (content: string) => void;
}

const splitParagraphs = (content: string) =>
  content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

const groupAssistantParagraphs = (content: string) => {
  const paragraphs = splitParagraphs(content);
  if (paragraphs.length === 0) return [[content]];
  if (content.length <= 400 || paragraphs.length < 3) return [paragraphs];

  const groups: string[][] = [];
  for (let index = 0; index < paragraphs.length; index += 2) {
    groups.push(paragraphs.slice(index, index + 2));
  }
  return groups;
};

export const ChatBubble = ({ message, onRetry, persona, personas, showAvatar }: ChatBubbleProps) => {
  const reduceMotion = useReducedMotion();
  const isUser = message.role === 'user';
  const isFailed = message.status === 'failed';

  if (isUser) {
    return (
      <div className="flex w-full justify-end">
        <div className="flex max-w-[76%] items-end gap-2">
          {isFailed && onRetry && (
            <button
              type="button"
              aria-label="다시 보내기"
              onClick={() => onRetry(message.content)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-toss-blue active:bg-toss-gray-50"
            >
              <RotateCcw size={18} />
            </button>
          )}
          <div
            className={cn(
              'rounded-lg rounded-tr-sm bg-toss-blue px-4 py-3 text-white',
              't-body-lg whitespace-pre-wrap break-words',
              isFailed && 'opacity-60',
            )}
          >
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  const groups = groupAssistantParagraphs(message.content);

  return (
    <div className="flex w-full items-start gap-2.5">
      <div className="h-9 w-9 shrink-0">
        {showAvatar && (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-toss-gray-100 bg-paper shadow-soft">
            {getPersonaIcon(persona.name, personas)}
          </div>
        )}
      </div>
      <motion.div
        variants={staggerList(reduceMotion ? 0 : 0.45)}
        initial="hidden"
        animate="show"
        className="max-w-[76%] space-y-2"
      >
        {groups.map((paragraphs, groupIndex) => (
          <motion.div
            key={`${message.id}-${groupIndex}`}
            variants={fadeUp}
            className="rounded-lg rounded-tl-sm border border-toss-gray-100 bg-toss-gray-50 px-4 py-3 text-toss-gray-800 shadow-soft"
          >
            {paragraphs.map((paragraph, index) => (
              <p
                key={`${message.id}-${groupIndex}-${index}`}
                className={cn('t-body-lg whitespace-pre-wrap break-words', index > 0 && 'mt-3')}
              >
                {paragraph}
              </p>
            ))}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};
