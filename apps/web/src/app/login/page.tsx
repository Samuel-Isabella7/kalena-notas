'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { GoogleButton } from '@/components/auth/google-button';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { api, apiError } from '@/lib/api';

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await login(data.email, data.password);
    } catch (e) {
      toast({ title: 'Erro ao entrar', description: apiError(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async (credential: string) => {
    try {
      await loginWithGoogle(credential);
    } catch (e) {
      toast({ title: 'Erro no login com Google', description: apiError(e), variant: 'destructive' });
    }
  };

  const sendForgot = async () => {
    setForgotLoading(true);
    try {
      const { data } = await api.post('/auth/forgot-password', { email: forgotEmail });
      if (data?.devLink) {
        // Modo teste (sem SMTP): mostramos o link para uso interno
        toast({
          title: 'Modo teste: link gerado',
          description: 'O envio de e-mail não está configurado. Use o link no console/aviso.',
        });
        // eslint-disable-next-line no-console
        console.log('Link de redefinição:', data.devLink);
        window.prompt('Link de redefinição (copie e abra):', data.devLink);
      } else {
        toast({
          title: 'Verifique seu e-mail',
          description: 'Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha.',
          variant: 'success',
        });
      }
      setForgotOpen(false);
      setForgotEmail('');
    } catch (e) {
      toast({ title: 'Erro', description: apiError(e), variant: 'destructive' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center knf-gradient p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold tracking-tight text-white">KALENA</h1>
          <p className="text-sm tracking-[0.35em] text-emerald-300 mt-2">NOTAS FISCAIS</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-2xl font-semibold mb-1">Bem-vindo</h2>
          <p className="text-sm text-muted-foreground mb-6">Acesse o sistema de notas fiscais</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" {...register('email')} className="mt-1.5" />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Senha</Label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-xs text-slate-500 hover:text-slate-900 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
              <Input id="password" type="password" placeholder="••••••••" {...register('password')} className="mt-1.5" />
              {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
            </div>

            <Button type="submit" className="w-full mt-6" disabled={loading} size="lg">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Entrar'}
            </Button>
          </form>

          <GoogleButton onCredential={onGoogle} />
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          Kalena Foods © {new Date().getFullYear()} — Sistema Interno
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Esqueci minha senha</DialogTitle>
            <DialogDescription>
              Informe seu e-mail cadastrado. Enviaremos um link para você criar uma nova senha.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="forgot-email">E-mail</Label>
            <Input
              id="forgot-email"
              type="email"
              className="mt-1.5"
              placeholder="seu@email.com"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForgotOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={sendForgot} disabled={forgotLoading || !forgotEmail.includes('@')}>
              {forgotLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
