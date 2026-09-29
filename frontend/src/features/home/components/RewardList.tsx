import { Play, ChevronRight, Gift } from 'lucide-react';
import { useState, useEffect, memo } from 'react';
import { apiUrl } from '../../../shared/api/client';
import { AppImage } from '../../../shared/components/ui';
import { getStorageUrl } from '../../../shared/utils/storage';

export interface ShopProduct {
  productId: string;
  name: string;
  price: number;
  tickets: number;
  description?: string;
  icon?: string;
  isBest?: boolean;
}

interface RewardListProps {
  handleWatchAd?: () => void;
  isAdLoading?: boolean;
  handlePurchase?: (product: ShopProduct) => void;
  handleLogout?: () => void;
  onOpenRecharge?: () => void;
  mode?: 'all' | 'purchaseOnly' | 'rewardsOnly' | 'noShare';
}

export const RewardList = memo(({
  handleWatchAd,
  isAdLoading = false,
  handlePurchase,
  handleLogout,
  mode = 'all'
}: RewardListProps) => {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const showRewards = mode === 'all' || mode === 'rewardsOnly' || mode === 'noShare';
  const showPurchases = mode === 'all' || mode === 'purchaseOnly' || mode === 'noShare';
  // [수정] 유저 요청으로 공유하기 기능 UI 제거 (showSharing = false)
  const showSharing = false;

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

    if (showPurchases) {
      const fetchProducts = async () => {
        try {
          setIsLoadingProducts(true);
          setLoadError(null);
          console.log('[RewardList] Fetching products...');

          const response = await fetch(apiUrl('/shop/products', { version: 'v3' }), {
            signal: controller.signal
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const result = await response.json();
          console.log('[RewardList] API Result:', result);

          if (isMounted) {
            if (result.resultType === 'SUCCESS' && Array.isArray(result.data)) {
              setProducts(result.data);
            } else {
              setProducts([]);
            }
          }
        } catch (error: any) {
          console.error('[RewardList] Failed to fetch products:', error);
          if (isMounted) {
            if (error.name === 'AbortError') {
              setLoadError('응답 시간이 초과되었습니다.');
            } else {
              setLoadError('상품 목록을 불러올 수 없어요.');
            }
          }
        } finally {
          if (isMounted) {
            setIsLoadingProducts(false);
            clearTimeout(timeoutId);
          }
        }
      };

      fetchProducts();
    }

    return () => {
      isMounted = false;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [showPurchases, retryCount]);

  return (
    <div className="space-y-5 pt-2 pb-10 text-left">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-[20px] font-black text-toss-gray-900">
          {mode === 'purchaseOnly' ? '이용권 사기' : '이용권 받기'}
        </h3>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-[13px] font-black text-toss-blue">추가 혜택</span>
      </div>

      <div className="space-y-2 rounded-[22px] border border-toss-gray-100 bg-toss-gray-50/50 p-2">

        {/* 결제 상품 항목 (API 동적 렌더링) */}
        {showPurchases && (
          <>
            {isLoadingProducts ? (
              <div className="py-10 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-[3px] border-toss-blue/30 border-t-toss-blue rounded-full animate-spin" />
                <p className="text-[14px] text-toss-gray-400 font-medium">상품 목록을 불러오고 있어요</p>
              </div>
            ) : loadError ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-center">
                <p className="text-[14px] text-toss-gray-500 font-medium">{loadError}</p>
                <button
                  onClick={() => setRetryCount(prev => prev + 1)}
                  className="text-[13px] text-toss-blue underline font-medium"
                >
                  다시 시도하기
                </button>
              </div>
            ) : products.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-[14px] text-toss-gray-400 font-medium">판매 중인 상품이 없어요</p>
              </div>
            ) : (
              products.map((product, index) => (
                <div key={product.productId || `product-${index}`}>
                  <button
                    onClick={() => handlePurchase?.(product)}
                    className="comfort-press flex w-full items-center justify-between rounded-[20px] bg-white px-4 py-4 text-left transition-colors hover:bg-toss-gray-50"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <div className={`flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[16px] ${product.isBest ? 'bg-amber-50' : 'bg-blue-50'}`}>
                        {product.icon ? (
                          <AppImage src={product.icon} width={52} className="w-full h-full object-cover" alt="item" />
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center">
                            {product.tickets >= 5 ? (
                              <AppImage src={getStorageUrl('images/ui/gacha_logo.png')} width={52} className="w-full h-full object-cover opacity-80" alt="logo" />
                            ) : (
                              <Gift size={24} className={product.isBest ? 'text-amber-500' : 'text-toss-blue'} />
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-left flex flex-col gap-1 min-w-0">
                        <p className="flex items-center gap-2 break-keep text-[16px] font-black leading-tight text-toss-gray-900">
                          {product.name || '상품 정보 없음'}
                          {product.isBest && (
                            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 t-micro font-black text-white">추천</span>
                          )}
                        </p>
                        <p className="break-keep text-[13px] font-bold text-toss-gray-500">{product.description || `${product.tickets || 0}회의 상담을 더 받아보세요`}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="whitespace-nowrap rounded-[12px] border border-toss-gray-200 bg-white px-3 py-2 shadow-sm">
                        <span className={`text-[15px] font-bold ${product.isBest ? 'text-amber-600' : 'text-toss-blue'}`}>
                          {(product.price || 0).toLocaleString()}원
                        </span>
                      </div>
                      <ChevronRight size={20} className="text-toss-gray-700" />
                    </div>
                  </button>
                  {(index < products.length - 1 || showRewards) && <div className="mx-6 h-[1px] bg-toss-gray-200/70" />}
                </div>
              ))
            )}
          </>
        )}

        {/* 보상형 항목: 광고 보기 - 티켓 1장 */}
        {showRewards && handleWatchAd && (
          <>
            <button
              onClick={() => handleWatchAd()}
              disabled={isAdLoading}
              className="comfort-card comfort-press flex w-full items-center justify-between rounded-[20px] bg-white px-4 py-4 text-left disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-[16px] bg-blue-50">
                  {isAdLoading ? (
                    <div className="w-6 h-6 border-[3px] border-toss-blue border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Play size={24} className="text-toss-blue fill-toss-blue" />
                  )}
                </div>
                <div className="text-left flex flex-col gap-1 min-w-0">
                  <p className="break-keep text-[16px] font-black leading-tight text-toss-gray-900">
                    {isAdLoading ? '광고를 준비하고 있어요' : '광고 보고 이용권 받기'}
                  </p>
                  <p className="break-keep text-[13px] font-bold text-toss-gray-500">짧은 영상을 보고 이용권 1장을 받아요</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="whitespace-nowrap rounded-[12px] border border-toss-gray-200 bg-white px-2.5 py-2 shadow-sm">
                  <span className="text-[14px] font-bold text-amber-600">+1장</span>
                </div>
                <ChevronRight size={20} className="text-toss-gray-700" />
              </div>
            </button>
            {showSharing && <div className="mx-6 h-[1px] bg-toss-gray-200/70" />}
          </>
        )}


      </div>

      {handleLogout && mode === 'all' && (
        <div className="flex justify-center pt-4">
          <button
            onClick={handleLogout}
            className="comfort-press rounded-full bg-toss-gray-50 px-6 py-3 text-[15px] font-bold text-toss-gray-500"
          >
            로그아웃하기
          </button>
        </div>
      )}
    </div>
  );
});
;
