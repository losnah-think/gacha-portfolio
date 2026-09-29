import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Wand2, Sparkles, Lightbulb } from 'lucide-react';
import { Button, Card } from '../../../shared/components/ui';
import type { DetailedAnalysis } from '../../../shared/types';

interface DetailedAnalysisPageProps {
  analysis: DetailedAnalysis;
  title?: string;
  persona?: string;
  onBack: () => void;
}

export const DetailedAnalysisPage = memo(({ analysis, title, persona, onBack }: DetailedAnalysisPageProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="-mx-5 -mt-10 min-h-[100dvh] bg-paper surface-reading"
    >
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 border-b border-toss-gray-100 bg-paper/90 backdrop-blur-xl">
        <div className="max-w-[520px] mx-auto flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center rounded-md text-toss-gray-700 active:bg-toss-gray-50"
            aria-label="뒤로가기"
          >
            <ArrowLeft size={18} className="text-toss-gray-700" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-toss-gray-100 bg-toss-gray-50">
              <Wand2 size={16} className="text-toss-blue" />
            </div>
            <h1 className="t-title text-toss-gray-900">자세한 해석</h1>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-[520px] mx-auto px-5 pt-6 pb-[120px] space-y-6">
        {/* Summary card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card surface="reading" className="p-5">
            {persona && (
              <p className="t-caption mb-1 font-bold text-toss-blue">{persona}의 해석</p>
            )}
            {title && (
              <p className="t-body mb-2 font-bold text-toss-gray-700 break-keep">{title}</p>
            )}
            <p className="t-section text-toss-gray-900 break-keep">{analysis.summary}</p>
          </Card>
        </motion.div>

        {/* 본문 해석 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <Card surface="reading" className="space-y-3 p-5">
            <h3 className="t-section flex items-center gap-1.5 text-toss-gray-900">
              <Sparkles size={17} className="text-toss-blue" />
              결과 해석
            </h3>
            <p className="t-body-lg whitespace-pre-wrap text-toss-gray-700 break-keep">
              {analysis.interpretation}
            </p>
          </Card>
        </motion.div>

        {/* 실천 가이드 */}
        {analysis.actionItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card surface="reading" className="space-y-3 p-5">
              <h3 className="t-section flex items-center gap-1.5 text-toss-gray-900">
                <Wand2 size={17} className="text-toss-blue" />
                오늘의 실천 가이드
              </h3>
              <div className="space-y-2.5">
                {analysis.actionItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-md bg-toss-gray-50 px-4 py-3.5">
                    <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-toss-blue">
                      <span className="t-micro font-bold text-white">{i + 1}</span>
                    </div>
                    <p className="t-body text-toss-gray-700 break-keep">{item}</p>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* 행운 팁 */}
        {analysis.luckyTip && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <Card surface="reading" className="p-5">
              <div className="flex items-start gap-3">
                <Lightbulb size={18} className="mt-0.5 flex-shrink-0 text-warning" />
                <div className="space-y-1.5">
                  <h3 className="t-section text-toss-gray-900">행운 팁</h3>
                  <p className="t-body text-toss-gray-700 break-keep">{analysis.luckyTip}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* 궁합 · 상성 */}
        {analysis.compatibility && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card surface="reading" className="p-5">
              <div className="flex items-start gap-3">
                <Sparkles size={18} className="mt-0.5 flex-shrink-0 text-rarity-epic" />
                <div className="space-y-1.5">
                  <h3 className="t-section text-toss-gray-900">궁합 · 상성</h3>
                  <p className="t-body text-toss-gray-700 break-keep">{analysis.compatibility}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </div>

      {/* ── Bottom button ── */}
      <div className="fixed inset-x-0 bottom-0 border-t border-toss-gray-100 bg-paper/90 px-5 py-4 backdrop-blur-xl pb-safe-4">
        <div className="max-w-[520px] mx-auto">
          <Button variant="primary" onClick={onBack}>
            돌아가기
          </Button>
        </div>
      </div>
    </motion.div>
  );
});
