'use client';
import { create } from '@/hooks/use-toast';

export function Toaster() {
  const { toasts, dismiss } = create();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`relative rounded-md border p-4 pr-8 shadow-lg bg-card text-card-foreground animate-in fade-in slide-in-from-right-4 ${
            t.variant === 'destructive' ? 'border-red-500' : t.variant === 'success' ? 'border-green-500' : 'border-border'
          }`}
        >
          {t.title && <div className="font-semibold text-sm mb-1">{t.title}</div>}
          {t.description && <div className="text-sm text-muted-foreground">{t.description}</div>}
          <button onClick={() => dismiss(t.id)} className="absolute top-2 right-2 text-sm opacity-60 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  );
}
