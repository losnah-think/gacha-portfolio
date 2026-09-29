import { Quote, Heart, Sparkles } from 'lucide-react';

export const getIcon = (type: string) => {
  switch (type) {
    case 'quote': return <Quote size={24} className="text-[#3182F6]" />;
    case 'warm_word': return <Heart size={24} className="text-[#F04452]" />;
    default: return <Sparkles size={24} className="text-toss-gray-400" />;
  }
};
