'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { api, apiError } from '@/lib/api';

function InviteForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') || '';

  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    api
      .get('/auth/invite', { params: { token } })
      .then(({ data }) => {
        setEmail(data.email);
        setValid(true);
      })
      .catch(() => setValid(false))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast({ title: 'Informe seu nome', variant: 'destructive' });
      return;
    }
    if (password.length < 6) {
      toast({ title: 'Senha muito curta', description: 'Mínimo 6 caracteres.', variant: 'destructive' });
      return;
    }
    if (password !== confirm) {
      toast({ title: 'As senhas não conferem', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/accept-invite', { token, name, password });
      setDone(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (e) {
      toast({ title: 'Não foi possível criar o cadastro', description: apiError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return <Loader2 className="w-5 h-5 animate-spin mx-auto" />;
  }

  if (!token || !valid) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Convite inválido ou expirado. Peça ao criador um novo convite.</p>
        <Link href="/login" className="text-sm text-slate-900 underline mt-3 inline-block">
          Ir para o login
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center">
        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
        <p className="mt-3 font-medium">Cadastro criado!</p>
        <p className="text-sm text-muted-foreground">Redirecionando para o login...</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>E-mail</Label>
        <Input className="mt-1.5 bg-slate-50" value={email} readOnly />
      </div>
      <div>
        <Label htmlFor="name">Seu nome</Label>
        <Input id="name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input id="password" type="password" className="mt-1.5" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="confirm">Confirmar senha</Label>
        <Input id="confirm" type="password" className="mt-1.5" placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Criar cadastro'}
      </Button>
    </form>
  );
}

export default function CriarCadastroPage() {
  return (
    <div className="min-h-screen flex items-center justify-center knf-gradient p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold tracking-tight text-white">KALENA</h1>
          <p className="text-sm tracking-[0.35em] text-emerald-300 mt-2">NOTAS FISCAIS</p>
        </div>
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-semibold mb-1">Criar cadastro</h2>
          <p className="text-sm text-muted-foreground mb-6">Defina seu nome e senha para acessar o sistema.</p>
          <Suspense fallback={<Loader2 className="w-5 h-5 animate-spin mx-auto" />}>
            <InviteForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
