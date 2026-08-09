/* ---------------------------------------------------------------------------
   ws-mundo-edge-function.ts — Supabase Edge Function
   Gera um ambiente navegável (Gaussian splat + colisor) a partir de fotos e
   descrição, e devolve as URLs de runtime para o WS Walkthrough.

   A chave NUNCA vive no navegador. Esta função é o lado seguro.

   POST  { nome, prompt, imagensDados[], quantidadeImagens }  -> { jobId }
   GET   ?job=<id>                                            -> { etapa, rad?, colisor?, erro? }

   deploy:  supabase functions deploy ws-mundo
   segredos:
     supabase secrets set MINT_API_KEY=...
     supabase secrets set MINT_PROJECT_ID=...
     supabase secrets set ORIGENS_PERMITIDAS=https://app.whitestone.living,https://camadas.whitestone.living

   ═══════════════════════════════════════════════════════════════════════════
   O QUE MUDOU E POR QUÊ

   A versão anterior tinha a chave no servidor — o que estava certo — e mais
   nada. Sem autenticação, sem CORS fechado, sem limite e sem cobrança. Como
   `Access-Control-Allow-Origin` era '*' e nenhuma identidade era exigida,
   qualquer pessoa que descobrisse a URL gerava mundos na conta White Stone,
   em laço, a US$ 1,20 cada. Isso não é risco teórico: é a fatura.

   Quatro coisas foram acrescentadas, nesta ordem de importância:

   1. AUTENTICAÇÃO. Sem usuário identificado não há chamada. É o pré-requisito
      dos outros três — não dá para limitar nem cobrar quem não se sabe quem é.

   2. COBRANÇA NA ORDEM CERTA. Debitar ANTES de chamar o fornecedor e estornar
      se ele falhar. Debitar depois cria a janela em que o usuário recebe e não
      paga; debitar sem estorno cria a janela em que paga e não recebe. A
      segunda vira reclamação pública.

   3. IDEMPOTÊNCIA. Clique duplo não pode virar cobrança dupla. A chave vem do
      cliente e a primeira resposta fica gravada — repetir devolve a mesma.

   4. LIMITE POR USUÁRIO. Teto por janela de tempo. Não protege contra fraude;
      protege contra laço acidental, que é o caso comum e igualmente caro.

   As tabelas de apoio estão em 04-servidor/SCHEMA-COBRANCA.sql.
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MINT = 'https://api.mint.gg/v1';
const CHAVE = Deno.env.get('MINT_API_KEY') ?? '';
const PROJETO = Deno.env.get('MINT_PROJECT_ID') ?? '';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/* Origem exata, nunca curinga. Sem variável configurada não há origem liberada:
   falhar fechado é o padrão correto para uma função que gasta dinheiro. */
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const CUSTO_CREDITOS = 1500;       /* espelha CUSTO_MUNDO do WS_MINT.html */
const TETO_POR_HORA = 10;          /* geração de mundo é ação cara e rara */

/* etapas espelham ETAPAS[] do WS_MINT.html — o front só mostra o índice */
const ETAPA = { ENVIANDO: 0, PREVIA: 1, MUNDO: 2, POS: 3, PRONTO: 4 };

/* ------------------------------------------------------------------- CORS -- */
function cors(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') ?? '';
  const liberada = ORIGENS.includes(origem);
  return {
    ...(liberada ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type, x-idempotency-key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (req: Request, o: unknown, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { ...cors(req), 'content-type': 'application/json' },
  });

/* ---------------------------------------------------------------- fornecedor */
async function mint(caminho: string, init?: RequestInit) {
  const r = await fetch(MINT + caminho, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${CHAVE}`,
      'content-type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`Mint respondeu ${r.status}`);
  return r.json();
}

/* -------------------------------------------------------------- identidade -- */
/** Devolve o usuário do JWT, ou null. O token vem do cliente Supabase do front. */
async function usuarioDoPedido(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/* ------------------------------------------------------------------ crédito --
   Débito e estorno vivem em funções SQL para serem atômicos. Fazer
   "ler saldo → conferir → gravar saldo" daqui é corrida garantida: dois cliques
   simultâneos leem o mesmo saldo e ambos passam. Ver SCHEMA-COBRANCA.sql.      */
async function debitar(admin: SupabaseClient, usuarioId: string, ref: string) {
  const { data, error } = await admin.rpc('debitar_creditos', {
    p_usuario: usuarioId, p_creditos: CUSTO_CREDITOS, p_referencia: ref, p_motivo: 'mundo_walkthrough',
  });
  if (error) throw new Error('falha ao debitar créditos: ' + error.message);
  if (data?.ok === false) throw new Error(data.motivo ?? 'créditos insuficientes');
  return data;
}
async function estornar(admin: SupabaseClient, usuarioId: string, ref: string) {
  const { error } = await admin.rpc('estornar_creditos', {
    p_usuario: usuarioId, p_referencia: ref,
  });
  /* Estorno que falha não pode derrubar a resposta de erro para o usuário, mas
     não pode sumir: vira alerta, porque é dinheiro parado no lugar errado. */
  if (error) console.error('[ws-mundo] ESTORNO FALHOU', { usuarioId, ref, erro: error.message });
}

/* ------------------------------------------------------------------- limite -- */
async function acimaDoTeto(admin: SupabaseClient, usuarioId: string) {
  const desde = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await admin
    .from('geracao_mundos')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .gte('criado_em', desde);
  if (error) return false;         /* indisponibilidade do limite não bloqueia o produto */
  return (count ?? 0) >= TETO_POR_HORA;
}

/* =========================================================================== */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });

  const origem = req.headers.get('origin');
  if (origem && !ORIGENS.includes(origem))
    return json(req, { erro: 'origem não autorizada' }, 403);

  if (!CHAVE) return json(req, { erro: 'MINT_API_KEY não configurada no servidor' }, 500);
  if (!SUPABASE_URL || !SERVICE_ROLE)
    return json(req, { erro: 'servidor sem credenciais de banco' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const usuario = await usuarioDoPedido(req, admin);
  if (!usuario) return json(req, { erro: 'não autenticado' }, 401);

  try {
    /* ---------- consulta de andamento ----------
       Só leitura, não custa nada — mas ainda exige usuário, e só devolve job
       que pertença a ele. Sem esse filtro, um id adivinhado expõe o mundo
       gerado por outra pessoa. */
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('job');
      if (!id) return json(req, { erro: 'faltou o parâmetro job' }, 400);

      const { data: dono } = await admin
        .from('geracao_mundos')
        .select('id, usuario_id, estornado')
        .eq('job_id', id).maybeSingle();
      if (!dono || dono.usuario_id !== usuario.id)
        return json(req, { erro: 'job não encontrado' }, 404);

      const st = await mint(`/worlds/${id}`);

      if (st.status === 'failed') {
        /* o fornecedor desistiu: devolve o crédito antes de contar a má notícia */
        if (!dono.estornado) await estornar(admin, usuario.id, id);
        return json(req, { erro: st.failureReason ?? 'a geração falhou',
          creditosEstornados: CUSTO_CREDITOS });
      }
      if (st.status !== 'succeeded') {
        const etapa = st.assetStage === 'final' ? ETAPA.POS
          : st.workflowStage === 'final_generation' ? ETAPA.MUNDO
          : ETAPA.PREVIA;
        return json(req, { etapa });
      }

      const man = await mint(`/worlds/${id}/manifest`);
      const r = man.runtime;
      if (!r?.runtimeUrl || !r?.collider?.runtimeUrl) {
        if (!dono.estornado) await estornar(admin, usuario.id, id);
        return json(req, { erro: 'o manifesto veio sem o ambiente ou sem o colisor',
          creditosEstornados: CUSTO_CREDITOS });
      }

      await admin.from('geracao_mundos')
        .update({ concluido_em: new Date().toISOString(), rad: r.runtimeUrl })
        .eq('job_id', id);

      return json(req, {
        etapa: ETAPA.PRONTO,
        rad: r.runtimeUrl,
        colisor: r.collider.runtimeUrl,
        capa: man.artifacts?.find((a: any) => a.role === 'preview_image')?.downloadUrl ?? '',
        bytes: r.byteSize ?? 0,
      });
    }

    /* ---------- início da geração ---------- */
    const corpo = await req.json();
    const imagens: string[] = Array.isArray(corpo.imagensDados) ? corpo.imagensDados.slice(0, 6) : [];
    if (!corpo.prompt?.trim() && !imagens.length)
      return json(req, { erro: 'envie ao menos uma foto ou uma descrição' }, 400);

    /* --- idempotência: mesma chave, mesma resposta, uma cobrança só --- */
    const chaveIdem = req.headers.get('x-idempotency-key')?.trim() || '';
    if (chaveIdem) {
      const { data: anterior } = await admin
        .from('geracao_mundos')
        .select('job_id')
        .eq('usuario_id', usuario.id)
        .eq('idempotency_key', chaveIdem)
        .maybeSingle();
      if (anterior) return json(req, { jobId: anterior.job_id, etapa: ETAPA.PREVIA, repetido: true });
    }

    if (await acimaDoTeto(admin, usuario.id))
      return json(req, { erro: `limite de ${TETO_POR_HORA} gerações por hora atingido` }, 429);

    /* --- a ordem que importa: debitar, chamar, estornar se falhar --- */
    const referencia = chaveIdem || crypto.randomUUID();
    await debitar(admin, usuario.id, referencia);

    let job: any;
    try {
      const refs: string[] = [];
      for (const dado of imagens) {
        const up = await mint('/uploads/reference-image', {
          method: 'POST', body: JSON.stringify({ dataUrl: dado }),
        });
        if (up?.url) refs.push(up.url);
      }
      job = await mint('/worlds', {
        method: 'POST',
        body: JSON.stringify({
          projectId: PROJETO || undefined,
          displayNameHint: corpo.nome ?? 'Ambiente White Stone',
          prompt: corpo.prompt ?? '',
          sourceImages: refs,
          mode: 'auto',
        }),
      });
    } catch (e) {
      await estornar(admin, usuario.id, referencia);
      return json(req, { erro: (e as Error).message, creditosEstornados: CUSTO_CREDITOS }, 502);
    }

    const jobId = job.assetId ?? job.id;
    await admin.from('geracao_mundos').insert({
      job_id: jobId,
      usuario_id: usuario.id,
      idempotency_key: chaveIdem || null,
      referencia_credito: referencia,
      creditos: CUSTO_CREDITOS,
      nome: corpo.nome ?? null,
    });

    return json(req, { jobId, etapa: ETAPA.PREVIA });
  } catch (e) {
    return json(req, { erro: (e as Error).message }, 502);
  }
});
