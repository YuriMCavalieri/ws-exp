/* ---------------------------------------------------------------------------
   ws-mundo-edge-function.ts — Supabase Edge Function
   Gera um ambiente navegável (Gaussian splat + colisor) a partir de fotos e
   descrição, e devolve as URLs de runtime para o WS Walkthrough.

   A chave NUNCA vive no navegador. Esta função é o lado seguro.

   POST  { nome, prompt, imagensDados[], quantidadeImagens }  -> { jobId }
   GET   ?job=<id>                                            -> { etapa, rad?, colisor?, erro? }

   deploy:  supabase functions deploy ws-mundo
   segredo: supabase secrets set MINT_API_KEY=...
--------------------------------------------------------------------------- */
const MINT = 'https://api.mint.gg/v1';
const CHAVE = Deno.env.get('MINT_API_KEY') ?? '';
const PROJETO = Deno.env.get('MINT_PROJECT_ID') ?? '';

/* etapas espelham ETAPAS[] do WS_MINT.html — o front só mostra o índice */
const ETAPA = { ENVIANDO: 0, PREVIA: 1, MUNDO: 2, POS: 3, PRONTO: 4 };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

async function mint(caminho: string, init?: RequestInit) {
  const r = await fetch(MINT + caminho, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${CHAVE}`, 'content-type': 'application/json' },
  });
  if (!r.ok) throw new Error(`Mint respondeu ${r.status}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!CHAVE) return json({ erro: 'MINT_API_KEY não configurada no servidor' }, 500);

  try {
    /* ---------- consulta de andamento ---------- */
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('job');
      if (!id) return json({ erro: 'faltou o parâmetro job' }, 400);

      const st = await mint(`/worlds/${id}`);
      if (st.status === 'failed') return json({ erro: st.failureReason ?? 'a geração falhou' });
      if (st.status !== 'succeeded') {
        const etapa = st.assetStage === 'final' ? ETAPA.POS
          : st.workflowStage === 'final_generation' ? ETAPA.MUNDO
          : ETAPA.PREVIA;
        return json({ etapa });
      }
      /* pronto: busca o manifesto com RAD e colisor */
      const man = await mint(`/worlds/${id}/manifest`);
      const r = man.runtime;
      if (!r?.runtimeUrl || !r?.collider?.runtimeUrl)
        return json({ erro: 'o manifesto veio sem o ambiente ou sem o colisor' });
      return json({
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
      return json({ erro: 'envie ao menos uma foto ou uma descrição' }, 400);

    /* sobe as fotos e recolhe as URLs públicas que o gerador aceita */
    const refs: string[] = [];
    for (const dado of imagens) {
      const up = await mint('/uploads/reference-image', {
        method: 'POST', body: JSON.stringify({ dataUrl: dado }),
      });
      if (up?.url) refs.push(up.url);
    }

    const job = await mint('/worlds', {
      method: 'POST',
      body: JSON.stringify({
        projectId: PROJETO || undefined,
        displayNameHint: corpo.nome ?? 'Ambiente White Stone',
        prompt: corpo.prompt ?? '',
        sourceImages: refs,
        mode: 'auto',
      }),
    });

    return json({ jobId: job.assetId ?? job.id, etapa: ETAPA.PREVIA });
  } catch (e) {
    return json({ erro: (e as Error).message }, 502);
  }
});
