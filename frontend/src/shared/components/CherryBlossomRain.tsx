import { useEffect, useRef } from 'react';

interface Petal {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  rotation: number;
  rotationSpeed: number;
  opacity: number;
  wobble: number;
  wobbleSpeed: number;
  wobbleOffset: number;
  color: string;
  scaleX: number;
  type: 'azalea' | 'forsythia'; // 진달래 or 개나리
}

const PETAL_COLORS = [
  // 진달래 (분홍~보라)
  'rgba(218, 80, 152, OPACITY)',   // 진달래 핑크
  'rgba(200, 90, 160, OPACITY)',   // 진달래 자주
  'rgba(230, 120, 170, OPACITY)',  // 연한 진달래
  'rgba(190, 60, 140, OPACITY)',   // 진한 진달래
  // 개나리 (노랑)
  'rgba(255, 210, 0, OPACITY)',    // 개나리 노랑
  'rgba(255, 195, 0, OPACITY)',    // 진한 개나리
  'rgba(255, 225, 60, OPACITY)',   // 연한 개나리
  'rgba(240, 180, 0, OPACITY)',    // 골드 개나리
];

function createPetal(canvasWidth: number, initial = false): Petal {
  const size = Math.random() * 10 + 6;
  const isAzalea = Math.random() > 0.45; // 55% 진달래, 45% 개나리
  const colorPool = isAzalea
    ? PETAL_COLORS.slice(0, 4)  // 진달래 색상
    : PETAL_COLORS.slice(4);    // 개나리 색상
  const colorTemplate = colorPool[Math.floor(Math.random() * colorPool.length)];
  const opacity = Math.random() * 0.55 + 0.3;
  return {
    x: Math.random() * canvasWidth,
    y: initial ? Math.random() * -100 - 10 : -(size + 10),
    size,
    speedY: Math.random() * 1.5 + 0.6,
    speedX: (Math.random() - 0.5) * 0.8,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 3,
    opacity,
    wobble: 0,
    wobbleSpeed: Math.random() * 0.04 + 0.01,
    wobbleOffset: Math.random() * Math.PI * 2,
    color: colorTemplate.replace('OPACITY', String(opacity)),
    scaleX: Math.random() * 0.5 + 0.5,
    type: isAzalea ? 'azalea' : 'forsythia',
  };
}

function drawPetal(ctx: CanvasRenderingContext2D, petal: Petal) {
  ctx.save();
  ctx.translate(petal.x, petal.y);
  ctx.rotate((petal.rotation * Math.PI) / 180);
  ctx.scale(petal.scaleX, 1);

  const s = petal.size;
  ctx.fillStyle = petal.color;

  if (petal.type === 'azalea') {
    // 진달래 — 5갈래 둥근 꽃잎
    const petals = 5;
    for (let i = 0; i < petals; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / petals);
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.6, s * 0.35, s * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 중심 점
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 255, 255, ${petal.opacity * 0.6})`;
    ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // 개나리 — 4갈래 꽃잎
    const petals = 4;
    for (let i = 0; i < petals; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI * 2) / petals);
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.55, s * 0.3, s * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 중심 점
    ctx.beginPath();
    ctx.fillStyle = `rgba(180, 120, 0, ${petal.opacity * 0.5})`;
    ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

interface CherryBlossomRainProps {
  count?: number;
  active?: boolean;
}

export function CherryBlossomRain({ count = 35, active = true }: CherryBlossomRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);
  const petalsRef = useRef<Petal[]>([]);
  const tickRef = useRef(0);

  useEffect(() => {
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 초기 꽃잎 생성 (화면 곳곳에 분산)
    petalsRef.current = Array.from({ length: count }, () =>
      createPetal(canvas.width, true)
    );
    // 초기 y를 화면 안쪽에도 배치
    petalsRef.current.forEach(p => {
      p.y = Math.random() * canvas.height;
    });

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      tickRef.current += 1;

      petalsRef.current.forEach(p => {
        // 흔들림 (sin 파형)
        p.wobble = Math.sin(tickRef.current * p.wobbleSpeed + p.wobbleOffset) * 2.5;
        p.x += p.speedX + p.wobble * 0.15;
        p.y += p.speedY;
        p.rotation += p.rotationSpeed;

        // 화면 밖으로 나가면 위에서 재생성
        if (p.y > canvas.height + 20) {
          const fresh = createPetal(canvas.width);
          Object.assign(p, fresh);
        }
        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;

        drawPetal(ctx, p);
      });

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [active, count]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
      aria-hidden="true"
    />
  );
}
