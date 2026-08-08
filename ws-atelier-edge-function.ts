// WS ATELIER — Edge Function: foto → móvel 3D (Meshy)
// Supabase (Deno). A CHAVE NUNCA VAI PARA O NAVEGADOR.
//
// Deploy:
//   supabase secrets set MESHY_API_KEY=msy_...
//   supabase functions deploy ws-atelier --no-verify-jwt
//
// No WS Studio:  window.WS_MESHY_ENDPOINT = 'https://<projeto>.functions.supabase.co/ws-atelier'

const MESHY = "https://api.meshy.ai/openapi/v1";
const CUSTO_TOKENS = 12;          // cobrado do saldo do usuário
const TETO_DIARIO = 20;           // por usuário, trava de custo

async function meshy(path: string, init: RequestInit = {}) {
  const r = await fetch(MESHY + path, {
    ...init,
    headers: {
      "Authorization": `Bearer ${Deno.env.get("MESHY_API_KEY")}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`meshy ${r.status}: ${await r.text()}`);
  return r.json();
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Content-Type": "application/json",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { imagem, nome, largura, profundidade, usuario_id } = await req.json();

    if (!imagem || !imagem.startsWith("data:image/"))
      return new Response(JSON.stringify({ erro: "imagem inválida" }), { status: 400, headers: cors });
    if (imagem.length > 14_000_000)
      return new Response(JSON.stringify({ erro: "imagem acima do limite" }), { status: 413, headers: cors });

    // TODO produção: debitar CUSTO_TOKENS do saldo e checar TETO_DIARIO por usuario_id.

    // 1 · cria a tarefa image-to-3D
    const criar = await meshy("/image-to-3d", {
      method: "POST",
      body: JSON.stringify({
        image_url: imagem,            // aceita data URI
        ai_model: "meshy-5",
        topology: "quad",
        target_polycount: 12000,
        should_texture: true,
        enable_pbr: true,
        symmetry_mode: "auto",
      }),
    });
    const taskId = criar.result || criar.id;

    // 2 · polling com teto de tempo
    const limite = Date.now() + 170_000;
    let task: any = null;
    while (Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 4000));
      task = await meshy(`/image-to-3d/${taskId}`);
      if (task.status === "SUCCEEDED" || task.status === "FAILED") break;
    }
    if (!task || task.status !== "SUCCEEDED")
      return new Response(JSON.stringify({ erro: "geração não concluída", status: task?.status }), { status: 504, headers: cors });

    const glb = task.model_urls?.glb;
    if (!glb) return new Response(JSON.stringify({ erro: "sem glb" }), { status: 502, headers: cors });

    // 3 · produção: baixar, otimizar (optimize_assets.mjs), subir ao storage e devolver URL própria.
    //    Aqui devolvemos a URL do Meshy (expira) — suficiente para o piloto.
    return new Response(JSON.stringify({
      glb_url: glb,
      task_id: taskId,
      nome, largura, profundidade,
      tokens_debitados: CUSTO_TOKENS,
      aviso: "URL temporária do provedor — em produção, republicar no storage White Stone",
    }), { headers: cors });

  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ erro: "interno" }), { status: 500, headers: cors });
  }
});
