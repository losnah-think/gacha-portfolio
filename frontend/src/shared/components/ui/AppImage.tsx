import type { ImgHTMLAttributes } from 'react';

interface AppImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'width'> {
  src: string;
  alt: string;
  width: number;
  eager?: boolean;
}

const isRemote = (src: string) => /^(https?:|data:|blob:)/.test(src);

const toWebpPath = (src: string, suffix = '') => {
  if (isRemote(src) || !src.match(/\.(png|jpg|jpeg)$/i)) return null;
  return src.replace(/\.(png|jpg|jpeg)$/i, `${suffix}.webp`);
};

export const AppImage = ({
  alt,
  className,
  eager = false,
  src,
  width,
  ...props
}: AppImageProps) => {
  const webp = toWebpPath(src);
  const webp2x = toWebpPath(src, '@2x');

  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      loading={eager ? 'eager' : 'lazy'}
      decoding={eager ? 'sync' : 'async'}
      className={className}
      {...props}
    />
  );

  if (!webp || !webp2x) return img;

  return (
    <picture>
      <source type="image/webp" srcSet={`${webp} 1x, ${webp2x} 2x`} />
      {img}
    </picture>
  );
};
