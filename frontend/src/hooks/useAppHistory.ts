import { useEffect, useRef, useCallback } from 'react';
import type { GachaResult } from '../shared/types';
import type { ActiveTab } from '../shared/types/navigation';
import { isActiveTab } from '../shared/types/navigation';

interface AppHistoryState {
  step: 'landing' | 'choose' | 'result';
  activeTab: ActiveTab;
  chooseStep: 1 | 2 | 3;
  isSituationsExpanded: boolean;
  isPersonasExpanded: boolean;
  selectedHistoryId: string | null;
  selectedPersonaId: string;
  selectedSituation: string;
  situationQuery: string;
  result: GachaResult | null;
  selectionSummary: string;
}

interface UseAppHistoryProps extends AppHistoryState {
  setStep: (step: 'landing' | 'choose' | 'result') => void;
  setActiveTab: (tab: ActiveTab) => void;
  setChooseStep: (step: 1 | 2 | 3) => void;
  setIsSituationsExpanded: (expanded: boolean) => void;
  setIsPersonasExpanded: (expanded: boolean) => void;
  setSelectedHistoryId: (id: string | null) => void;
  setSelectedPersonaId: (id: string) => void;
  setSelectedSituation: (id: string) => void;
  setSituationQuery: (query: string) => void;
  setResult: (result: GachaResult | null) => void;
  setSelectionSummary: (summary: string) => void;
}

export const useAppHistory = ({
  step,
  activeTab,
  chooseStep,
  isSituationsExpanded,
  isPersonasExpanded,
  selectedHistoryId,
  selectedPersonaId,
  selectedSituation,
  situationQuery,
  result,
  selectionSummary,
  setStep,
  setActiveTab,
  setChooseStep,
  setIsSituationsExpanded,
  setIsPersonasExpanded,
  setSelectedHistoryId,
  setSelectedPersonaId,
  setSelectedSituation,
  setSituationQuery,
  setResult,
  setSelectionSummary
}: UseAppHistoryProps) => {
  const isBackNav = useRef(false);
  const isFirstRender = useRef(true);

  // 현재 상태를 객체로 반환
  const getCurrentState = useCallback((): AppHistoryState => ({
    step,
    activeTab,
    chooseStep,
    isSituationsExpanded,
    isPersonasExpanded,
    selectedHistoryId,
    selectedPersonaId,
    selectedSituation,
    situationQuery,
    result,
    selectionSummary
  }), [
    step,
    activeTab,
    chooseStep,
    isSituationsExpanded,
    isPersonasExpanded,
    selectedHistoryId,
    selectedPersonaId,
    selectedSituation,
    situationQuery,
    result,
    selectionSummary
  ]);

  useEffect(() => {
    // 1. 초기 로드 시 히스토리 State 초기화
    if (!window.history.state) {
      const initialState = getCurrentState();
      window.history.replaceState(initialState, '');
    }

    // 2. 뒤로가기(popstate) 핸들러
    const handlePopState = (event: PopStateEvent) => {
      if (event.state) {
        console.log('[History] Restoring state:', event.state);
        isBackNav.current = true; // 뒤로가기 플래그

        // 상태 일괄 복원
        setStep(event.state.step || 'landing');
        setActiveTab(isActiveTab(event.state.activeTab) ? event.state.activeTab : 'home');
        setChooseStep(event.state.chooseStep || 1);
        setIsSituationsExpanded(event.state.isSituationsExpanded || false);
        setIsPersonasExpanded(event.state.isPersonasExpanded || false);
        setSelectedHistoryId(event.state.selectedHistoryId || null);
        setSelectedPersonaId(event.state.selectedPersonaId || '');
        setSelectedSituation(event.state.selectedSituation || '');
        setSituationQuery(event.state.situationQuery || '');
        setResult(event.state.result || null);
        setSelectionSummary(event.state.selectionSummary || '');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [
    getCurrentState, // Added dependency
    setStep,
    setActiveTab,
    setChooseStep,
    setIsSituationsExpanded,
    setIsPersonasExpanded,
    setSelectedHistoryId,
    setSelectedPersonaId,
    setSelectedSituation,
    setSituationQuery,
    setResult,
    setSelectionSummary
  ]); // Mount 시 1회 실행 (하지만 Deps 추가 권장)

  useEffect(() => {
    const currentState = getCurrentState();
    const historyState = window.history.state;

    // A. 첫 렌더링 처리
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (historyState) {
        console.log('[History] Initial load: Restoring state from history.state', historyState);
        // 첫 렌더링 시점에 히스토리 상태가 있다면 앱 상태로 복원
        setStep(historyState.step || 'landing');
        setActiveTab(isActiveTab(historyState.activeTab) ? historyState.activeTab : 'home');
        setChooseStep(historyState.chooseStep || 1);
        setIsSituationsExpanded(historyState.isSituationsExpanded || false);
        setIsPersonasExpanded(historyState.isPersonasExpanded || false);
        setSelectedHistoryId(historyState.selectedHistoryId || null);
        setSelectedPersonaId(historyState.selectedPersonaId || '');
        setSelectedSituation(historyState.selectedSituation || '');
        setResult(historyState.result || null);
        setSelectionSummary(historyState.selectionSummary || '');
      } else {
        window.history.replaceState(currentState, '');
      }
      return;
    }

    // B. 뒤로가기에 의한 변경이면 Push 생략
    if (isBackNav.current) {
      console.log('[History] Skip pushState (Back Nav)');
      isBackNav.current = false;
      return;
    }

    // C. 중복 Push 방지 (핵심 상태만 비교)
    const isSameNavState = historyState &&
      (historyState.step === currentState.step) &&
      (historyState.activeTab === currentState.activeTab) &&
      (historyState.chooseStep === currentState.chooseStep) &&
      (historyState.isSituationsExpanded === currentState.isSituationsExpanded) &&
      (historyState.isPersonasExpanded === currentState.isPersonasExpanded) &&
      (historyState.selectedHistoryId === currentState.selectedHistoryId) &&
      (historyState.selectedPersonaId === currentState.selectedPersonaId) &&
      (historyState.selectedSituation === currentState.selectedSituation);

    if (isSameNavState) {
      return;
    }

    // D. 새로운 상태 Push 또는 Replace
    // - result 화면만 Replace (뒤로가기 시 결과 건너뛰기)
    // - choose 단계(1→2→3)는 Push하여 뒤로가기 시 이전 단계로 복귀 가능
    const shouldReplace = (currentState.step === 'result');

    if (shouldReplace) {
      console.log('[History] Replacing state:', currentState);
      window.history.replaceState(currentState, '');
    } else {
      console.log('[History] Pushing new state:', currentState);
      window.history.pushState(currentState, '');
    }

  }, [
    getCurrentState, // Added dependency
    step,
    activeTab,
    chooseStep,
    isSituationsExpanded,
    isPersonasExpanded,
    selectedHistoryId,
    selectedPersonaId,
    selectedSituation,
    result,
    selectionSummary,
    setStep,
    setActiveTab,
    setChooseStep,
    setIsSituationsExpanded,
    setIsPersonasExpanded,
    setSelectedHistoryId,
    setSelectedPersonaId,
    setSelectedSituation,
    setResult,
    setSelectionSummary
  ]);
};
