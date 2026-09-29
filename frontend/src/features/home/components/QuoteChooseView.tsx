import { AnimatePresence } from 'framer-motion';
import { memo, useCallback, useEffect } from 'react';
import { CheckCircle2, ChevronLeft, Sparkles, Ticket } from 'lucide-react';
import type { Persona, Situation } from '../../../shared/types';
import { useAppNavigationBar } from '../../../hooks/useAppNavigationBar';
import { getPersonaIcon } from '../../../shared/utils/personaHelper';
import { SituationStep } from './SituationStep';
import { QuotePersonaStep } from './QuotePersonaStep';
import { TicketCostButton } from '../../../shared/components/ui';
import { haptic } from '../../../shared/utils/haptics';

interface QuoteChooseViewProps {
  setStep: (step: 'landing' | 'choose' | 'result') => void;
  chooseStep: 1 | 2 | 3;
  setChooseStep: React.Dispatch<React.SetStateAction<1 | 2 | 3>>;
  quickMode?: boolean;
  situationQuery: string;
  setSituationQuery: (q: string) => void;
  setSituationError: (e: string | null) => void;
  selectedSituation: string;
  setSelectedSituation: (s: string) => void;
  situationOptions: Situation[];
  situationError: string | null;
  trackCta: (type: 'persona' | 'situation', id: string) => void;
  personas: Persona[];
  recommendedPersonas?: Persona[];
  recommendedSituations?: Situation[];
  selectedPersonaId: string;
  setSelectedPersonaId: (id: string) => void;
  handleGachaSelection: (id?: string) => void;
  isSituationsExpanded: boolean;
  setIsSituationsExpanded: (expanded: boolean) => void;
  isPersonasExpanded: boolean;
  setIsPersonasExpanded: (expanded: boolean) => void;
  rewardLevelsByPersona?: Record<string, number>;
  accountLevel?: number;
  drawCount: number;
  isSubmitting?: boolean;
}

interface QuoteReviewStepProps {
  selectedSituation: string;
  selectedPersona: Persona | null;
  personas: Persona[];
  drawCount: number;
  isSubmitting: boolean;
  onChangeSituation: () => void;
  onChangePersona: () => void;
  onStart: () => void;
}

const QuoteReviewStep = memo(({
  selectedSituation,
  selectedPersona,
  personas,
  drawCount,
  isSubmitting,
  onChangeSituation,
  onChangePersona,
  onStart,
}: QuoteReviewStepProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-2 px-1">
        <p className="inline-flex items-center gap-1.5 rounded-lg bg-toss-blue/10 px-3 py-1.5 text-[12px] font-extrabold text-toss-blue">
          <CheckCircle2 size={14} />
          마지막 확인
        </p>
        <h3 className="text-[22px] font-extrabold leading-tight tracking-tight text-toss-gray-900">
          이대로 상담을 시작할까요?
        </h3>
        <p className="text-[14px] font-medium leading-relaxed text-toss-gray-400">
          시작 버튼을 누르기 전까지 이용권은 사용되지 않아요.
        </p>
      </div>

      <div className="space-y-3">
        <div className="rounded-[18px] border border-toss-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[12px] font-extrabold uppercase tracking-wider text-toss-gray-400">내 고민</p>
            <button
              onClick={onChangeSituation}
              className="rounded-lg bg-toss-blue/10 px-3 py-1.5 text-[12px] font-extrabold text-toss-blue active:scale-95"
            >
              수정
            </button>
          </div>
          <p className="break-words text-[16px] font-extrabold leading-relaxed text-toss-gray-900">
            {selectedSituation}
          </p>
        </div>

        <div className="rounded-[18px] border border-toss-gray-100 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[12px] font-extrabold uppercase tracking-wider text-toss-gray-400">상담가</p>
            <button
              onClick={onChangePersona}
              className="rounded-lg bg-toss-blue/10 px-3 py-1.5 text-[12px] font-extrabold text-toss-blue active:scale-95"
            >
              변경
            </button>
          </div>
          {selectedPersona ? (
            <div className="flex items-center gap-3">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-toss-blue/20 bg-toss-blue/5">
                {getPersonaIcon(selectedPersona.name, personas)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-extrabold text-toss-gray-900">{selectedPersona.name}</p>
                <p className="mt-1 line-clamp-2 text-[13px] font-medium leading-relaxed text-toss-gray-400">
                  {selectedPersona.desc}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[14px] font-bold text-red-500">상담가를 다시 선택해주세요.</p>
          )}
        </div>

        <div className="flex items-center gap-3 rounded-[16px] border border-amber-100 bg-amber-50/70 px-4 py-3">
          <Ticket size={17} className="flex-shrink-0 text-amber-600" />
          <p className="text-[13px] font-bold leading-relaxed text-amber-700">
            상담 시작 시 이용권 1장을 사용해요. 현재 {drawCount}장 보유 중이에요.
          </p>
        </div>
      </div>

      <div className="sticky bottom-4 z-10 space-y-2 rounded-[20px] border border-white/70 bg-white/90 p-3 shadow-[0_14px_32px_rgba(25,43,77,0.12)] backdrop-blur">
        <TicketCostButton
          cost={1}
          balance={drawCount}
          onConfirm={() => {
            haptic('tap');
            onStart();
          }}
          disabled={!selectedPersona || !selectedSituation.trim() || isSubmitting}
          loading={isSubmitting}
          className="h-14"
        >
          <Sparkles size={18} />
          {isSubmitting ? '상담 준비 중...' : '이용권 1장 쓰고 시작하기'}
        </TicketCostButton>
        <button
          onClick={onChangePersona}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] bg-toss-gray-50 text-[14px] font-extrabold text-toss-gray-500 active:scale-[0.99]"
        >
          <ChevronLeft size={16} />
          상담가 다시 고르기
        </button>
      </div>
    </div>
  );
});

export const QuoteChooseView = memo(({
  setStep,
  chooseStep,
  setChooseStep,
  quickMode = false,
  situationQuery,
  setSituationQuery,
  setSituationError,
  selectedSituation,
  setSelectedSituation,
  situationOptions,
  situationError,
  trackCta,
  personas,
  recommendedPersonas = [],
  recommendedSituations = [],
  selectedPersonaId,
  setSelectedPersonaId,
  handleGachaSelection,
  isSituationsExpanded,
  setIsSituationsExpanded,
  isPersonasExpanded,
  setIsPersonasExpanded,
  rewardLevelsByPersona = {},
  accountLevel = 1,
  drawCount,
  isSubmitting = false,
}: QuoteChooseViewProps) => {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [chooseStep]);

  const AIDisclaimer = () => (
    <div className="mt-8 mb-4 py-5 px-6 rounded-[24px] bg-toss-gray-50/50 text-center border border-toss-gray-100/50">
      <p className="text-[15px] text-toss-gray-500 font-medium leading-relaxed">
        모든 조언과 이미지는<br />
        자동으로 만든 참고용 이야기예요.
      </p>
    </div>
  );

  const onBackPress = useCallback(() => {
    if (chooseStep > 1) {
      setChooseStep((prev) => (prev - 1) as 1 | 2 | 3);
    } else {
      setStep('landing');
    }
  }, [chooseStep, setChooseStep, setStep]);

  useAppNavigationBar({
    title: chooseStep === 1 ? '고민 고르기' : chooseStep === 2 ? '상담가 고르기' : '상담 확인',
    showBack: true,
    onBackPress
  });

  const handleSituationSelect = useCallback((sit: Situation) => {
    trackCta('situation', sit.id);
    setSelectedSituation(sit.title);
    setSituationQuery('');
    setSelectedPersonaId('');
    setSituationError(null);
    setChooseStep(2);
  }, [trackCta, setSelectedSituation, setSituationQuery, setSelectedPersonaId, setSituationError, setChooseStep]);

  const handlePersonaSelect = useCallback((pId: string) => {
    trackCta('persona', pId);
    setSelectedPersonaId(pId);
    setChooseStep(3);
  }, [trackCta, setSelectedPersonaId, setChooseStep]);

  const selectedSituationText = selectedSituation || situationQuery.trim();
  const selectedPersona = personas.find(p => p.id === selectedPersonaId) || null;

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {chooseStep === 1 && (
          <SituationStep
            key="quote-situation"
            situationOptions={situationOptions}
            recommendedSituations={recommendedSituations}
            situationQuery={situationQuery}
            setSituationQuery={setSituationQuery}
            setSituationError={setSituationError}
            situationError={situationError}
            handleSituationSelect={handleSituationSelect}
            handleCustomSituationConfirm={() => {
              const customSituation = situationQuery.trim();
              if (customSituation) {
                setSelectedSituation(customSituation);
                setSelectedPersonaId('');
                setSituationError(null);
                setChooseStep(2);
              }
            }}
            isSituationsExpanded={isSituationsExpanded}
            setIsSituationsExpanded={setIsSituationsExpanded}
            AIDisclaimer={AIDisclaimer}
          />
        )}
        {chooseStep === 2 && (
          <QuotePersonaStep
            key="quote-persona"
            selectedSituation={selectedSituationText}
            setChooseStep={setChooseStep}
            personas={personas}
            recommendedPersonas={recommendedPersonas}
            selectedPersonaId={selectedPersonaId}
            handlePersonaSelect={handlePersonaSelect}
            isPersonasExpanded={isPersonasExpanded}
            setIsPersonasExpanded={setIsPersonasExpanded}
            rewardLevelsByPersona={rewardLevelsByPersona}
            accountLevel={accountLevel}
            quickMode={quickMode}
            AIDisclaimer={AIDisclaimer}
          />
        )}
        {chooseStep === 3 && (
          <QuoteReviewStep
            key="quote-review"
            selectedSituation={selectedSituationText}
            selectedPersona={selectedPersona}
            personas={personas}
            drawCount={drawCount}
            isSubmitting={isSubmitting}
            onChangeSituation={() => setChooseStep(1)}
            onChangePersona={() => setChooseStep(2)}
            onStart={() => handleGachaSelection()}
          />
        )}
      </AnimatePresence>
    </div>
  );
});
