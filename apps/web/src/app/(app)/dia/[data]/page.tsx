'use client';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Upload,
  Loader2,
  FileText,
  ExternalLink,
  Pencil,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  UserCheck,
} from 'lucide-react';
import { api, apiError } from '@/lib/api';
import { Invoice, InvoiceKind, InvoiceStatus, OmieAccount, KIND_LABELS, STATUS_LABELS } from '@/types';
import { useAuth } from '@/hooks/use-auth';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, formatDate, formatDocument, WEEKDAY_SHORT } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InvoiceEditDialog } from '@/components/invoices/invoice-edit-dialog';

function weekdayName(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const full = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return full[wd] ?? WEEKDAY_SHORT[wd];
}

function StatusBadge({ status }: { status: Invoice['status'] }) {
  if (status === 'LANCADA')
    return (
      <Badge variant="success" className="gap-1">
        <CheckCircle2 className="w-3 h-3" /> {STATUS_LABELS.LANCADA}
      </Badge>
    );
  if (status === 'MANUAL')
    return (
      <Badge variant="info" className="gap-1">
        <UserCheck className="w-3 h-3" /> {STATUS_LABELS.MANUAL}
      </Badge>
    );
  if (status === 'ERRO')
    return (
      <Badge variant="danger" className="gap-1">
        <AlertCircle className="w-3 h-3" /> {STATUS_LABELS.ERRO}
      </Badge>
    );
  return (
    <Badge variant="warning" className="gap-1">
      <Clock className="w-3 h-3" /> {STATUS_LABELS.PENDENTE}
    </Badge>
  );
}

type KindFilter = 'TODOS' | InvoiceKind;

export default function DiaPage() {
  const params = useParams();
  const date = String(params.data);
  const { can } = useAuth();
  const canManage = can('CRIADOR', 'ADMIN'); // criador e admin: anexar, editar, lançar, excluir
  const canAttach = canManage;
  const canSeeBoth = can('CRIADOR', 'ADMIN', 'BALANCO'); // veem os dois tipos (Balanço só leitura)
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadAccount, setUploadAccount] = useState<OmieAccount>('SP');
  const [uploadKind, setUploadKind] = useState<InvoiceKind>('SERVICO');
  const [uploadStatus, setUploadStatus] = useState<InvoiceStatus>('MANUAL');
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<KindFilter>('TODOS');

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', date],
    queryFn: async () => (await api.get('/invoices', { params: { date } })).data,
  });

  const visible = useMemo(() => {
    if (!invoices) return [];
    if (filter === 'TODOS') return invoices;
    return invoices.filter((i) => i.kind === filter);
  }, [invoices, filter]);

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ['invoices', date] });
    queryClient.invalidateQueries({ queryKey: ['calendar-month'] });
    queryClient.invalidateQueries({ queryKey: ['calendar-overview'] });
  };

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('date', date);
      fd.append('account', uploadAccount);
      fd.append('kind', uploadKind);
      fd.append('status', uploadStatus);
      const { data } = await api.post('/invoices', fd);
      refetch();
      const ok = data?.extraction?.textOk;
      toast({
        title: 'Nota anexada',
        description: ok
          ? 'Dados lidos do PDF. Confira antes de lançar.'
          : 'Não foi possível ler o PDF automaticamente — preencha os campos manualmente.',
        variant: 'success',
      });
      setSelected(data.invoice);
      setDialogOpen(true);
    } catch (err) {
      toast({ title: 'Erro ao anexar', description: apiError(err), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const openInvoice = (inv: Invoice) => {
    setSelected(inv);
    setDialogOpen(true);
  };

  const viewFile = async (inv: Invoice) => {
    if (inv.driveLink) {
      window.open(inv.driveLink, '_blank');
      return;
    }
    try {
      const res = await api.get(`/invoices/${inv.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank');
    } catch (e) {
      toast({ title: 'Não foi possível abrir o arquivo', description: apiError(e), variant: 'destructive' });
    }
  };

  const remove = async (inv: Invoice) => {
    if (!confirm(`Excluir a nota "${inv.fileName}"? Esta ação remove o arquivo também.`)) return;
    try {
      await api.delete(`/invoices/${inv.id}`);
      toast({ title: 'Nota excluída', variant: 'success' });
      refetch();
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: apiError(e), variant: 'destructive' });
    }
  };

  const filters: KindFilter[] = ['TODOS', 'SERVICO', 'ICMS'];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href="/calendario" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Voltar ao calendário
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">{formatDate(date)}</h1>
          <p className="text-sm text-muted-foreground">{weekdayName(date)}</p>
        </div>

        {canAttach && (
          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={uploadKind} onValueChange={(v) => setUploadKind(v as InvoiceKind)}>
                <SelectTrigger className="w-32 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SERVICO">Serviço</SelectItem>
                  <SelectItem value="ICMS">ICMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Conta</label>
              <Select value={uploadAccount} onValueChange={(v) => setUploadAccount(v as OmieAccount)}>
                <SelectTrigger className="w-24 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SP">SP</SelectItem>
                  <SelectItem value="RJ">RJ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Situação</label>
              <Select value={uploadStatus} onValueChange={(v) => setUploadStatus(v as InvoiceStatus)}>
                <SelectTrigger className="w-40 mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">{STATUS_LABELS.MANUAL}</SelectItem>
                  <SelectItem value="PENDENTE">{STATUS_LABELS.PENDENTE}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={onFileChange}
            />
            <Button onClick={onPickFile} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Anexar nota
            </Button>
          </div>
        )}
      </div>

      {/* Filtro por tipo (apenas quem vê os dois tipos) */}
      {canSeeBoth && (
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white hover:border-slate-400',
              )}
            >
              {f === 'TODOS' ? 'Todos' : KIND_LABELS[f as InvoiceKind]}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center">
          <FileText className="w-10 h-10 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-muted-foreground">
            {canAttach
              ? 'Nenhuma nota neste dia/filtro. Clique em Anexar nota para começar.'
              : 'Nenhuma nota neste dia/filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((inv) => (
            <div key={inv.id} className="rounded-lg border bg-white p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusBadge status={inv.status} />
                  <Badge variant={inv.kind === 'SERVICO' ? 'info' : 'secondary'}>{KIND_LABELS[inv.kind]}</Badge>
                  <Badge variant="outline">{inv.account}</Badge>
                  <span className="font-medium truncate">{inv.fornecedorNome || inv.fileName}</span>
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {inv.fornecedorDoc && <span>{formatDocument(inv.fornecedorDoc)}</span>}
                  {inv.numeroDocumento && <span>NF {inv.numeroDocumento}</span>}
                  {inv.valor != null && <span className="font-medium text-foreground">{formatCurrency(inv.valor)}</span>}
                  {inv.dataVencimento && <span>Venc. {formatDate(inv.dataVencimento)}</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Anexada por {inv.uploadedByName ?? '—'}
                  {inv.launchedByName && ` · Lançada por ${inv.launchedByName}`}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => viewFile(inv)} title="Ver arquivo">
                  <ExternalLink className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => openInvoice(inv)}>
                  {canAttach && inv.status !== 'LANCADA' ? <Pencil className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {canAttach && inv.status !== 'LANCADA' ? 'Revisar' : 'Ver'}
                </Button>
                {canManage && inv.status !== 'LANCADA' && (
                  <Button variant="ghost" size="sm" onClick={() => remove(inv)} title="Excluir">
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <InvoiceEditDialog
        invoice={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onChanged={refetch}
        canLaunch={canManage}
        canEdit={canAttach}
      />
    </div>
  );
}
