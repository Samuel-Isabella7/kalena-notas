'use client';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Upload, FileBox, Trash2, ExternalLink, Inbox } from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { PhysicalNote, PhysicalNoteMeta } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { formatDateTime, formatFileSize } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}/${y}`;
}

export default function NotasFisicasPage() {
  const { user, can } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mesF, setMesF] = useState<string>('TODOS');
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [observacao, setObservacao] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canView = can('CRIADOR', 'ADMIN', 'ADMIN_ICMS', 'BALANCO');
  const canAttach = can('CRIADOR', 'ADMIN');

  const { data: notas, isLoading } = useQuery<PhysicalNote[]>({
    queryKey: ['physical-notes', mesF],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (mesF !== 'TODOS') params.mes = mesF;
      return (await api.get('/physical-notes', { params })).data;
    },
    enabled: canView,
  });

  const { data: meta } = useQuery<PhysicalNoteMeta>({
    queryKey: ['physical-notes-meta'],
    queryFn: async () => (await api.get('/physical-notes/meta')).data,
    enabled: canView,
  });

  if (!canView) {
    return (
      <div className="max-w-2xl mx-auto rounded-lg border bg-card p-10 text-center text-muted-foreground">
        Você não tem acesso às notas físicas.
      </div>
    );
  }

  const meses = meta?.meses ?? [];
  const total = meta?.total ?? 0;
  const canDelete = (n: PhysicalNote) => n.uploadedById === user?.id || can('CRIADOR');

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['physical-notes'] });
    queryClient.invalidateQueries({ queryKey: ['physical-notes-meta'] });
  };

  const submit = async () => {
    if (!nome.trim()) {
      toast({ title: 'Informe o nome da nota', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'Selecione um arquivo', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('nome', nome.trim());
      if (observacao.trim()) fd.append('observacao', observacao.trim());
      await api.post('/physical-notes', fd);
      toast({ title: 'Nota física anexada', variant: 'success' });
      setOpen(false);
      setNome('');
      setObservacao('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      refetch();
    } catch (e) {
      toast({ title: 'Erro ao anexar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (n: PhysicalNote) => {
    if (n.driveLink) {
      window.open(n.driveLink, '_blank');
      return;
    }
    // Fallback (sem Drive): baixa pelo endpoint autenticado
    setBusyId(n.id);
    try {
      const res = await api.get(`/physical-notes/${n.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = n.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: 'Erro ao abrir arquivo', description: apiError(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (n: PhysicalNote) => {
    if (!confirm(`Excluir a nota física "${n.nome}"? O arquivo também será removido do Drive.`)) return;
    setBusyId(n.id);
    try {
      await api.delete(`/physical-notes/${n.id}`);
      toast({ title: 'Nota física excluída', variant: 'success' });
      refetch();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: apiError(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notas físicas</h1>
          <p className="text-sm text-muted-foreground">
            Documentos em papel anexados manualmente (com nome e observação). Vão para o Google Drive.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-xs text-muted-foreground">Mês</label>
            <Select value={mesF} onValueChange={setMesF}>
              <SelectTrigger className="w-40 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos os meses</SelectItem>
                {meses.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {canAttach && (
            <Button onClick={() => setOpen(true)}>
              <Upload className="w-4 h-4" /> Anexar nota física
            </Button>
          )}
        </div>
      </div>

      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          {total.toLocaleString('pt-BR')} nota(s) física(s) no total
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (notas ?? []).length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <Inbox className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma nota física neste filtro.
            {canAttach && ' Clique em "Anexar nota física" para adicionar.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Anexado em</th>
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Observação</th>
                <th className="px-4 py-2 font-medium">Por</th>
                <th className="px-4 py-2 font-medium">Arquivo</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {(notas ?? []).map((n) => (
                <tr key={n.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(n.createdAt)}</td>
                  <td className="px-4 py-2 font-medium">{n.nome}</td>
                  <td className="px-4 py-2 text-muted-foreground max-w-xs">{n.observacao || '-'}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                    {n.uploadedByName || '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <button
                      onClick={() => openFile(n)}
                      disabled={busyId === n.id}
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline disabled:opacity-50"
                      title={`${n.fileName} (${formatFileSize(n.fileSize)})`}
                    >
                      {busyId === n.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      Abrir
                    </button>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-right">
                    {canDelete(n) && (
                      <button
                        onClick={() => remove(n)}
                        disabled={busyId === n.id}
                        className="inline-flex items-center gap-1 text-rose-600 hover:underline disabled:opacity-50"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Diálogo de anexo */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileBox className="w-5 h-5" /> Anexar nota física
            </DialogTitle>
            <DialogDescription>
              Informe um nome e uma observação do que se trata. O arquivo será salvo no Drive.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Recibo aluguel galpão"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="obs">Observação</Label>
              <Textarea
                id="obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Do que se trata a nota..."
                className="mt-1"
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor="file">Arquivo *</Label>
              <Input
                id="file"
                type="file"
                ref={fileRef}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="mt-1"
              />
              {file && (
                <p className="text-xs text-muted-foreground mt-1">
                  {file.name} ({formatFileSize(file.size)})
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Anexar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
