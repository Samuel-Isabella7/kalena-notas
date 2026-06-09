'use client';
import { useEffect, useState } from 'react';

type Variant = 'default' | 'destructive' | 'success';

interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: Variant;
}

let toasts: Toast[] = [];
let listeners: ((t: Toast[]) => void)[] = [];

function emit() {
  for (const l of listeners) l([...toasts]);
}

export function toast(opts: Omit<Toast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, ...opts }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 5000);
}

export function create() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    listeners.push(setList);
    return () => {
      listeners = listeners.filter((l) => l !== setList);
    };
  }, []);

  return {
    toasts: list,
    dismiss: (id: string) => {
      toasts = toasts.filter((t) => t.id !== id);
      emit();
    },
  };
}
