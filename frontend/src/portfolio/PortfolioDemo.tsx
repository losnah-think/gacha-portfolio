import { useState, type FormEvent } from 'react';
import { HistoryContentCard } from '../features/history/components/HistoryContentCard';
import { Button } from '../shared/components/ui/Button';
import { Card } from '../shared/components/ui/Card';
import { DEFAULT_SITUATIONS } from '../shared/constants/situations';
import { clampReadingFontSize, READING_FONT_SIZE_MIN, READING_FONT_SIZE_MAX } from '../shared/utils/readingFontSize';
import { requestAdvice, readAdviceHistory, ADVICE_PERSONAS, ADVICE_STORAGE_KEY, type AdviceResult } from './adviceData';
import './portfolio.css';

export function PortfolioDemo() {
  const [view, setView] = useState<'choose' | 'result' | 'saved'>('choose');
  const [situation, setSituation] = useState('');
  const [personaId, setPersonaId] = useState(ADVICE_PERSONAS[0].id);
  const [result, setResult] = useState<AdviceResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [fontSize, setFontSize] = useState(18);
  const [message, setMessage] = useState('');
  const [inputError, setInputError] = useState('');
  const [history, setHistory] = useState(() => {
    try { return { items: readAdviceHistory(), error: '' }; }
    catch { return { items: [] as AdviceResult[], error: '브라우저 보관함을 읽지 못했습니다. 저장 설정을 확인하거나 보관함을 초기화해 주세요.' }; }
  });

  function openView(next: typeof view) {
    setView(next);
    setMessage('');
    setInputError('');
  }

  async function generateAdvice(event: FormEvent) {
    event.preventDefault();
    if (isGenerating) return;
    setInputError('');
    setIsGenerating(true);
    try {
      setResult(await requestAdvice(personaId, situation));
      openView('result');
    } catch (error) {
      setInputError(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : 'AI에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally { setIsGenerating(false); }
  }

  function saveExample() {
    if (!result || history.error) return;
    if (history.items.some((item) => item.id === result.id)) return;
    if (history.items.length >= 10) {
      setMessage('보관함은 최대 10개입니다. 보관함에서 조언을 삭제한 후 저장해 주세요.');
      return;
    }
    const items = [result, ...history.items];
    try {
      localStorage.setItem(ADVICE_STORAGE_KEY, JSON.stringify(items));
      setHistory({ items, error: '' });
      setMessage('이 브라우저의 보관함에 저장했습니다.');
    } catch {
      setMessage('저장하지 못했습니다. 브라우저의 저장 권한이나 여유 공간을 확인해 주세요.');
    }
  }

  function removeExample(id: string) {
    const items = history.items.filter((item) => item.id !== id);
    try {
      localStorage.setItem(ADVICE_STORAGE_KEY, JSON.stringify(items));
      setHistory({ items, error: '' });
      setMessage('조언을 보관함에서 삭제했습니다.');
    } catch { setMessage('삭제하지 못했습니다. 브라우저의 저장 설정을 확인해 주세요.'); }
  }

  function resetHistory() {
    if (!window.confirm('이 브라우저에 저장된 가차 조언을 모두 삭제할까요?')) return;
    try {
      localStorage.removeItem(ADVICE_STORAGE_KEY);
      setHistory({ items: [], error: '' });
      setMessage('보관함을 초기화했습니다.');
    } catch { setMessage('초기화하지 못했습니다. 브라우저의 저장 설정을 확인해 주세요.'); }
  }

  const isSaved = result && history.items.some((item) => item.id === result.id);

  return (
    <main className="portfolio-demo space-y-6 p-5 sm:p-7">
      <header className="space-y-3">
        <h1 className="t-display">가차</h1>
        <p className="t-body">고민을 적고 캐릭터를 골라, 지금 나에게 필요한 조언을 받아 보세요.</p>
        <p className="demo-notice t-body">캐릭터의 말투로 AI가 새로 작성하는 참고용 조언입니다. 실제 인물의 발언이 아닙니다.</p>
      </header>

      <nav aria-label="가차 메뉴" className="grid grid-cols-2 gap-3">
        <Button variant={view === 'choose' ? 'primary' : 'secondary'} disabled={isGenerating} aria-pressed={view === 'choose'} onClick={() => openView('choose')}>조언 만들기</Button>
        <Button variant={view === 'saved' ? 'primary' : 'secondary'} disabled={isGenerating} aria-pressed={view === 'saved'} onClick={() => openView('saved')}>보관함</Button>
      </nav>

      {history.error && (
        <div role="alert" className="space-y-3">
          <p className="t-body">{history.error}</p>
          <Button variant="secondary" onClick={resetHistory}>보관함 초기화</Button>
        </div>
      )}
      {message && <p role="status" className="demo-notice t-body">{message}</p>}

      {view === 'choose' && (
        <form onSubmit={generateAdvice} aria-busy={isGenerating} className="space-y-5">
          <Card className="space-y-4 p-5">
            <label htmlFor="demo-situation" className="block t-title">지금 어떤 고민이 있나요?</label>
            <textarea id="demo-situation" required disabled={isGenerating} maxLength={200} rows={3} value={situation} onChange={(event) => { setSituation(event.target.value); setInputError(''); }} aria-describedby="demo-input-note" className="demo-field" placeholder="예: 새로운 일을 시작하기가 망설여져요" />
            <p id="demo-input-note" className="t-body">200자까지 입력할 수 있습니다. 조언 생성을 위해 입력 내용을 서버와 Google Cloud에 전달합니다. 이름·연락처 등 개인정보는 적지 마세요.</p>
            <div className="space-y-2">
              <p className="t-body font-bold">고민 예시 선택</p>
              {DEFAULT_SITUATIONS.slice(0, 3).map((item) => (
                <Button key={item.id} disabled={isGenerating} variant="secondary" onClick={() => { setSituation(item.title); setInputError(''); }}>{item.title}</Button>
              ))}
            </div>
          </Card>
          <div className="space-y-2">
            <label htmlFor="demo-persona" className="block t-section">어떤 캐릭터의 조언을 받을까요?</label>
            <select id="demo-persona" disabled={isGenerating} value={personaId} onChange={(event) => setPersonaId(event.target.value)} className="demo-field">
              {ADVICE_PERSONAS.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
            </select>
            <p className="t-body">선택한 캐릭터가 고민에 맞춰 조언을 작성합니다.</p>
          </div>
          {inputError && <p role="alert" className="t-body">{inputError}</p>}
          {isGenerating && <p role="status" className="t-body">조언을 작성하고 있습니다. 잠시 기다려 주세요.</p>}
          <Button type="submit" size="lg" loading={isGenerating}>{isGenerating ? '조언 작성 중' : '내 조언 만들기'}</Button>
        </form>
      )}

      {view === 'result' && result && (
        <section aria-labelledby="demo-result-title" className="space-y-4">
          <h2 id="demo-result-title" className="t-title">{result.title}</h2>
          <p className="t-body break-words">입력한 고민: {result.situation}</p>
          <p className="t-body">Google Cloud Vertex AI가 작성한 참고용 글입니다. 실제 인물의 발언이 아닙니다.</p>
          <label className="block space-y-2 t-body font-bold" htmlFor="demo-font-size">
            <span>글자 크기: {fontSize}px</span>
            <input id="demo-font-size" type="range" min={READING_FONT_SIZE_MIN} max={READING_FONT_SIZE_MAX} value={fontSize} onChange={(event) => setFontSize(clampReadingFontSize(Number(event.target.value)))} className="h-11 w-full accent-[#1d5fc3]" />
          </label>
          <HistoryContentCard item={result} fontSize={fontSize} showAttribution={false} />
          <Button onClick={saveExample} disabled={Boolean(isSaved) || Boolean(history.error)}>{isSaved ? '보관함에 저장됨' : '이 브라우저에 저장'}</Button>
          <Button variant="secondary" onClick={() => openView('choose')}>다른 캐릭터와 고민 선택</Button>
        </section>
      )}

      {view === 'saved' && (
        <section aria-labelledby="demo-history-title" className="space-y-4">
          <h2 id="demo-history-title" className="t-title">이 브라우저의 보관함</h2>
          <p className="t-body">저장한 조언은 이 브라우저에만 남습니다. 브라우저 데이터를 지우면 조언도 삭제됩니다.</p>
          {history.items.length === 0 ? (
            <Card surface="reading" className="space-y-4 p-5">
              <p className="t-body">저장한 조언이 없습니다. 조언을 받은 뒤 저장해 보세요.</p>
              <Button variant="secondary" onClick={() => openView('choose')}>조언 만들기로 이동</Button>
            </Card>
          ) : history.items.map((item) => (
            <Card key={item.id} surface="reading" className="space-y-3 p-5">
              <h3 className="t-section">{item.title}</h3>
              <p className="t-body break-words">{item.situation}</p>
              <p className="t-body">AI가 작성한 참고용 조언</p>
              <div className="grid grid-cols-2 gap-3">
                <Button variant="secondary" onClick={() => { setResult(item); openView('result'); }} aria-label={`${item.title} 다시 보기`}>다시 보기</Button>
                <Button variant="ghost" onClick={() => removeExample(item.id)} aria-label={`${item.title} 삭제`}>삭제</Button>
              </div>
            </Card>
          ))}
        </section>
      )}

      <footer className="border-t border-[#6b7684] pt-4 t-body">
        <a className="inline-flex min-h-11 items-center font-bold underline" href="https://github.com/losnah-think/gacha-portfolio" target="_blank" rel="noreferrer">가차 원본 소스 스냅샷 보기</a>
      </footer>
    </main>
  );
}
