'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Send, Save } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api, apiError } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { Invoice, OmieAccount, OmieOption } from '@/types';

interface Props {
  invoice: Invoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  canLaunch: boolean;
  canEdit?: boolean;
}

interface FormState {
  account: OmieAccount;
  fornecedorNome: string;
  fornecedorDoc: string;
  numeroDocumento: string;
  valor: string;
  dataEmissao: string;
  dataVencimento: string;
  categoriaCodigo: string;
  contaCorrenteId: string;
  observacao: string;
}

function toForm(inv: Invoice): FormState {
  return {
    account: inv.account,
    fornecedorNome: inv.fornecedorNome ?? '',
    fornecedorDoc: inv.fornecedorDoc ?? '',
    numeroDocumento: inv.numeroDocumento ?? '',
    valor: inv.valor != null ? String(inv.valor) : '',
    dataEmissao: inv.dataEmissao ?? '',
    dataVencimento: inv.dataVencimento ?? '',
    categoriaCodigo: inv.categoriaCodigo ?? '',
    contaCorrenteId: inv.contaCorrenteId ?? '',
    observacao: inv.observacao ?? '',
  };
}

export function InvoiceEditDialog({ invoice, open, onOpenChange, onChanged, canLaunch, canEdit = true }: Props) {
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (invoice) setForm(toForm(invoice));
  }, [invoice]);

  const account = form?.account ?? 'SP';

  const { data: categorias, isError: catError } = useQuery<OmieOption[]>({
    queryKey: ['omie-categorias', account],
    queryFn: async () => (await api.get('/omie/categorias', { params: { account } })).data,
    enabled: open && !!form,
    retry: 0,
  });

  const { data: contas, isError: contaError } = useQuery<OmieOption[]>({
    queryKey: ['omie-contas', account],
    queryFn: async () => (await api.get('/omie/contas-correntes', { params: { account } })).data,
    enabled: open && !!form,
    retry: 0,
  });

  if (!invoice || !form) return null;

  const locked = invoice.status === 'LANCADA' || !canEdit;

  const set = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/invoices/${invoice.id}`, {
        account: form.account,
        fornecedorNome: form.fornecedorNome || undefined,
        fornecedorDoc: form.fornecedorDoc || undefined,
        numeroDocumento: form.numeroDocumento || undefined,
        valor: form.valor ? Number(form.valor) : undefined,
        dataEmissao: form.dataEmissao || undefined,
        dataVencimento: form.dataVencimento || undefined,
        categoriaCodigo: form.categoriaCodigo || undefined,
        categoriaDescricao:
          categorias?.find((c) => c.codigo === form.categoriaCodigo)?.descricao || undefined,
        contaCorrenteId: form.contaCorrenteId || undefined,
        contaCorrenteDescricao:
          contas?.find((c) => c.codigo === form.contaCorrenteId)?.descricao || undefined,
        observacao: form.observacao || undefined,
      });
      toast({ title: 'Nota salva', variant: 'success' });
      onChanged();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: apiError(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const launch = async () => {
    setLaunching(true);
    try {
      // Salva antes de lançar para garantir que os dados conferidos estão persistidos
      await save();
      await api.post(`/invoices/${invoice.id}/launch`);
      toast({ title: 'Nota lançada na Omie!', variant: 'success' });
      onChanged();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Erro ao lançar', description: apiError(e), variant: 'destructive' });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{locked ? 'Detalhes da nota' : 'Revisar e lançar nota'}</DialogTitle>
          <DialogDescription>
            {invoice.fileName}
            {locked && ' — já lançada na Omie (somente leitura)'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Conta (empresa Omie)</Label>
            <Select
              value={form.account}
              onValueChange={(v) => set({ account: v as OmieAccount, categoriaCodigo: '', contaCorrenteId: '' })}
              disabled={locked}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SP">São Paulo (SP)</SelectItem>
                <SelectItem value="RJ">Rio de Janeiro (RJ)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Fornecedor</Label>
            <Input
              className="mt-1.5"
              value={form.fornecedorNome}
              onChange={(e) => set({ fornecedorNome: e.target.value })}
              disabled={locked}
              placeholder="Razão social"
            />
          </div>
          <div>
            <Label>CNPJ / CPF</Label>
            <Input
              className="mt-1.5"
              value={form.fornecedorDoc}
              onChange={(e) => set({ fornecedorDoc: e.target.value })}
              disabled={locked}
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div>
            <Label>Número da NF</Label>
            <Input
              className="mt-1.5"
              value={form.numeroDocumento}
              onChange={(e) => set({ numeroDocumento: e.target.value })}
              disabled={locked}
            />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input
              className="mt-1.5"
              type="number"
              step="0.01"
              min="0"
              value={form.valor}
              onChange={(e) => set({ valor: e.target.value })}
              disabled={locked}
            />
          </div>

          <div>
            <Label>Data de emissão</Label>
            <Input
              className="mt-1.5"
              type="date"
              value={form.dataEmissao}
              onChange={(e) => set({ dataEmissao: e.target.value })}
              disabled={locked}
            />
          </div>
          <div>
            <Label>Data de vencimento</Label>
            <Input
              className="mt-1.5"
              type="date"
              value={form.dataVencimento}
              onChange={(e) => set({ dataVencimento: e.target.value })}
              disabled={locked}
            />
          </div>

          <div>
            <Label>Categoria</Label>
            {catError ? (
              <Input
                className="mt-1.5"
                value={form.categoriaCodigo}
                onChange={(e) => set({ categoriaCodigo: e.target.value })}
                disabled={locked}
                placeholder="Código da categoria (Omie não configurada)"
              />
            ) : (
              <Select
                value={form.categoriaCodigo}
                onValueChange={(v) => set({ categoriaCodigo: v })}
                disabled={locked}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {(categorias ?? []).map((c) => (
                    <SelectItem key={c.codigo} value={c.codigo}>
                      {c.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div>
            <Label>Conta corrente</Label>
            {contaError ? (
              <Input
                className="mt-1.5"
                value={form.contaCorrenteId}
                onChange={(e) => set({ contaCorrenteId: e.target.value })}
                disabled={locked}
                placeholder="ID da conta corrente (Omie não configurada)"
              />
            ) : (
              <Select
                value={form.contaCorrenteId}
                onValueChange={(v) => set({ contaCorrenteId: v })}
                disabled={locked}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {(contas ?? []).map((c) => (
                    <SelectItem key={c.codigo} value={c.codigo}>
                      {c.descricao}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label>Observação</Label>
            <Textarea
              className="mt-1.5"
              value={form.observacao}
              onChange={(e) => set({ observacao: e.target.value })}
              disabled={locked}
              rows={2}
            />
          </div>
        </div>

        {invoice.omieErro && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            Último erro da Omie: {invoice.omieErro}
          </div>
        )}
        {invoice.omieCodigoLancamento && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
            Lançado via integração — código {invoice.omieCodigoLancamento}
          </div>
        )}

        {!locked && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={save} disabled={saving || launching}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </Button>
            {canLaunch && (
              <Button variant="success" onClick={launch} disabled={launching || saving}>
                {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Lançar na Omie
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
