// WS ATELIER — Edge Function: foto → móvel 3D (Meshy)
// Supabase (Deno). A CHAVE NUNCA VAI PARA O NAVEGADOR.
//
// Deploy:
//   supabase secrets set MESHY_API_KEY=msy_...
//   supabase secrets set ORIGENS_PERMITIDAS=https://app.whitestone.living,https://camadas.whitestone.living
//   supabase functions deploy ws-atelier
//
// No WS Studio:  window.WS_MESHY_ENDPOINT = 'https://<projeto>.functions.supabase.co/ws-atelier'
//
// ═══════════════════════════════════════════════════════════════════════════
// O QUE MUDOU
//
// 1. `--no-verify-jwt` saiu do deploy. Com ele, a função era pública.
//
// 2. `usuario_id` NÃO vem mais do corpo da requisição. Vinha — e quem manda o
//    corpo é o cliente, então qualquer um cobrava a geração na conta de
//    qualquer outro. A identidade agora sai do JWT, que o cliente não forja.
//
// 3. O débito de tokens existe de verdade. Antes havia um `TODO produção` e a
//    resposta já devolvia `tokens_debitados: 12` — a função afirmava ter
//    cobrado algo que nunca cobrou. Um relatório de consumo construído sobre
//    esse campo estaria errado desde o primeiro dia.
//
// 4. CORS com origem exata e idempotência por chave, como na ws-mundo.
//
// Tabelas e funções de crédito: 04-servidor/SCHEMA-COBRANCA.sql
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const MESHY = 'https://api.meshy.ai/openapi/v1';
const CUSTO_TOKENS = 12;          // cobrado do saldo do usuário
const TETO_DIARIO = 20;           // por usuário, trava de custo

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function cors(req: Request): Record<string, string> {
  const origem = req.headers.get('origin') ?? '';
  return {
    ...(ORIGENS.includes(origem) ? { 'Access-Control-Allow-Origin': origem } : {}),
    'Access-Control-Allow-Headers': 'authorization, content-type, x-idempotency-key',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}
const json = (req: Request, o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: cors(req) });

async function meshy(path: string, init: RequestInit = {}) {
  const r = await fetch(MESHY + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${Deno.env.get('MESHY_API_KEY')}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`meshy ${r.status}: ${await r.text()}`);
  return r.json();
}

async function usuarioDoPedido(req: Request, admin: SupabaseClient) {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });

  const origem = req.headers.get('origin');
  if (origem && !ORIGENS.includes(origem)) return json(req, { erro: 'origem não autorizada' }, 403);
  if (!SUPABASE_URL || !SERVICE_ROLE) return json(req, { erro: 'servidor sem credenciais de banco' }, 500);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const usuario = await usuarioDoPedido(req, admin);
  if (!usuario) return json(req, { erro: 'não autenticado' }, 401);

  try {
    const { imagem, nome, largura, profundidade } = await req.json();

    if (!imagem || !imagem.startsWith('data:image/'))
      return json(req, { erro: 'imagem inválida' }, 400);
    if (imagem.length > 14_000_000)
      return json(req, { erro: 'imagem acima do limite' }, 413);

    /* ---- idempotência: clique duplo não gera dois móveis nem duas cobranças ---- */
    const chaveIdem = req.headers.get('x-idempotency-key')?.trim() || '';
    if (chaveIdem) {
      const { data: anterior } = await admin
        .from('geracao_moveis')
        .select('glb_url, task_id')
        .eq('usuario_id', usuario.id).eq('idempotency_key', chaveIdem).maybeSingle();
      if (anterior?.glb_url)
        return json(req, { glb_url: anterior.glb_url, task_id: anterior.task_id,
          nome, largura, profundidade, tokens_debitados: CUSTO_TOKENS, repetido: true });
    }

    /* ---- teto diário ---- */
    const desde = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await admin.from('geracao_moveis')
      .select('id', { count: 'exact', head: true })
      .eq('usuario_id', usuario.id).gte('criado_em', desde);
    if ((count ?? 0) >= TETO_DIARIO)
      return json(req, { erro: `limite de ${TETO_DIARIO} móveis por dia atingido` }, 429);

    /* ---- debitar ANTES de chamar o fornecedor ---- */
    const referencia = chaveIdem || crypto.randomUUID();
    const { data: deb, error: errDeb } = await admin.rpc('debitar_creditos', {
      p_usuario: usuario.id, p_creditos: CUSTO_TOKENS,
      p_referencia: referencia, p_motivo: 'movel_atelier',
    });
    if (errDeb) return json(req, { erro: 'falha ao debitar: ' + errDeb.message }, 500);
    if (deb?.ok === false) return json(req, { erro: deb.motivo ?? 'créditos insuficientes' }, 402);

    const estornar = async () => {
      const { error } = await admin.rpc('estornar_creditos', {
        p_usuario: usuario.id, p_referencia: referencia,
      });
      if (error) console.error('[ws-atelier] ESTORNO FALHOU', { u: usuario.id, referencia, e: error.message });
    };

    try {
      // 1 · cria a tarefa image-to-3D
      const criar = await meshy('/image-to-3d', {
        method: 'POST',
        body: JSON.stringify({
          image_url: imagem,            // aceita data URI
          ai_model: 'meshy-5',
          topology: 'quad',
          target_polycount: 12000,
          should_texture: true,
          enable_pbr: true,
          symmetry_mode: 'auto',
        }),
      });
      const taskId = criar.result || criar.id;

      // 2 · polling com teto de tempo
      const limite = Date.now() + 170_000;
      let task: any = null;
      while (Date.now() < limite) {
        await new Promise((r) => setTimeout(r, 4000));
        task = await meshy(`/image-to-3d/${taskId}`);
        if (task.status === 'SUCCEEDED' || task.status === 'FAILED') break;
      }
      if (!task || task.status !== 'SUCCEEDED') {
        await estornar();
        return json(req, { erro: 'geração não concluída', status: task?.status,
          tokens_estornados: CUSTO_TOKENS }, 504);
      }

      const glb = task.model_urls?.glb;
      if (!glb) {
        await estornar();
        return json(req, { erro: 'sem glb', tokens_estornados: CUSTO_TOKENS }, 502);
      }

      await admin.from('geracao_moveis').insert({
        task_id: taskId, usuario_id: usuario.id,
        idempotency_key: chaveIdem || null, referencia_credito: referencia,
        creditos: CUSTO_TOKENS, nome: nome ?? null, glb_url: glb,
      });

      // 3 · produção: baixar, otimizar (optimize_assets.mjs), subir ao storage e devolver URL própria.
      //    Aqui devolvemos a URL do Meshy (expira) — suficiente para o piloto.
      return json(req, {
        glb_url: glb,
        task_id: taskId,
        nome, largura, profundidade,
        tokens_debitados: CUSTO_TOKENS,   // agora verdade: o débito acima aconteceu
        aviso: 'URL temporária do provedor — em produção, republicar no storage White Stone',
      });
    } catch (e) {
      await estornar();
      throw e;
    }
  } catch (e) {
    console.error(e);
    return json(req, { erro: 'interno' }, 500);
  }
});
