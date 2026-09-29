import { memo } from 'react';

interface TicketIconProps {
  className?: string;
  size?: number;
  primaryColor?: string;
}

export const TicketIcon = memo(({
  className = "",
  size = 40,
  primaryColor = "#3182f6",
}: TicketIconProps) => {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      <svg 
        viewBox="0 0 40 40" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-sm"
      >
        <g clipPath="url(#clip0_ticket)">
          <path 
            opacity="0.4" 
            fillRule="evenodd" 
            clipRule="evenodd" 
            d="M20 40C8.954 40 0 31.046 0 20C0 8.954 8.954 0 20 0C31.046 0 40 8.954 40 20C40 31.046 31.046 40 20 40Z" 
            fill="#EEEEEE"
          />
          <path 
            fillRule="evenodd" 
            clipRule="evenodd" 
            d="M19.6 8.7L10.9 12.2C10.5 12.4 10.2 12.8 10.2 13.2V21.5C10.2 25.3 15 29 19.5 31.3C19.8 31.4 20.1 31.4 20.4 31.3C24.9 29 29.7 25.3 29.7 21.5V13.2C29.7 12.8 29.5 12.4 29.1 12.3L20.4 8.7C20.1 8.6 19.8 8.6 19.6 8.7Z"
            fill="#00B2B0"
          />
          <path 
            fillRule="evenodd" 
            clipRule="evenodd" 
            d="M24.9 18.1H21.4V14.6C21.4 14.3 21.1 14 20.8 14H19.2C18.9 14 18.6 14.3 18.6 14.6V18.1H15.1C14.8 18.1 14.5 18.4 14.5 18.7V20.3C14.5 20.6 14.8 20.9 15.1 20.9H18.6V24.4C18.6 24.7 18.9 25 19.2 25H20.8C21.1 25 21.4 24.7 21.4 24.4V20.9H24.9C25.2 20.9 25.5 20.6 25.5 20.3V18.7C25.5 18.4 25.2 18.1 24.9 18.1Z" 
            fill="white"
          />
          <g>
            <path 
              fillRule="evenodd" 
              clipRule="evenodd" 
              d="M26.54 20.54L24.14 21.32C22.82 21.74 21.86 22.76 21.44 24.02L20.54 26.54C20.3 27.08 19.64 27.08 19.58 26.54L18.8 24.14C18.38 22.82 17.36 21.86 16.1 21.44L13.46 20.54C12.92 20.3 12.92 19.64 13.46 19.58L15.86 18.8C17.18 18.38 18.14 17.36 18.56 16.1L19.46 13.46C19.7 12.92 20.36 12.92 20.42 13.46L21.2 15.86C21.62 17.18 22.64 18.14 23.9 18.56L26.3 19.34C27.08 19.7 27.08 20.3 26.54 20.54ZM20 8C13.34 8 8 13.34 8 20C8 26.66 13.34 32 20 32C26.66 32 32 26.66 32 20C32 13.34 26.66 8 20 8Z"
              fill={primaryColor}
            />
            <path 
              fillRule="evenodd" 
              clipRule="evenodd" 
              d="M26.5399 20.5402L24.1399 21.3202C22.8199 21.7402 21.8599 22.7602 21.4399 24.0202L20.5399 26.5402C20.2999 27.0802 19.6399 27.0802 19.5799 26.5402L18.7999 24.1402C18.3799 22.8202 17.3599 21.8602 16.0999 21.4402L13.4599 20.5402C12.9199 20.3002 12.9199 19.6402 13.4599 19.5802L15.8599 18.8002C17.1799 18.3802 18.1399 17.3602 18.5599 16.1002L19.4599 13.4602C19.6999 12.9202 20.3599 12.9202 20.4199 13.4602L21.1999 15.8602C21.6199 17.1802 22.6399 18.1402 23.8999 18.5602L26.2999 19.3402C27.0799 19.7002 27.0799 20.3002 26.5399 20.5402Z" 
              fill="white"
            />
          </g>
        </g>
        <defs>
          <clipPath id="clip0_ticket">
            <rect width="40" height="40" fill="white"/>
          </clipPath>
        </defs>
      </svg>
    </div>
  );
});
