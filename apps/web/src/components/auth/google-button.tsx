'use client';
import { useEffect, useRef } from 'react';

interface Props {
  onCredential: (credential: string) => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/**
 * Renderiza o botão oficial "Entrar com Google".
 * Só aparece se NEXT_PUBLIC_GOOGLE_CLIENT_ID estiver configurado.
 */
export function GoogleButton({ onCredential }: Props) {
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID) return;

    const init = () => {
      if (!window.google || !divRef.current) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (resp: { credential: string }) => onCredential(resp.credential),
      });
      window.google.accounts.id.renderButton(divRef.current, {
        theme: 'outline',
        size: 'large',
        width: 320,
        text: 'signin_with',
        locale: 'pt-BR',
      });
    };

    const existing = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = init;
      document.body.appendChild(script);
    }
  }, [onCredential]);

  if (!CLIENT_ID) return null;

  return (
    <div className="mt-4">
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-muted-foreground">ou</span>
        </div>
      </div>
      <div ref={divRef} className="flex justify-center" />
    </div>
  );
}
