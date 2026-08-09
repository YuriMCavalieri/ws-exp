-- ---------------------------------------------------------------------------
-- SCHEMA-COBRANCA.sql — tabelas e funções que as Edge Functions exigem.
--
-- Por que débito e estorno são FUNÇÕES SQL e não código na Edge Function:
-- "ler saldo → conferir → gravar saldo" a partir da função é uma corrida
-- garantida. Dois cliques simultâneos leem o mesmo saldo, os dois passam pela
-- conferência, e o usuário gera dois mundos pagando um. `update … where saldo
-- >= custo` resolve isso numa instrução só, sob a trava da própria linha.
--
-- aplicar:  supabase db execute --file 04-servidor/SCHEMA-COBRANCA.sql
-- ---------------------------------------------------------------------------

-- ─────────────────────────────────────────────────────── saldo de créditos
create table if not exists creditos_saldo (
  usuario_id   uuid primary key references auth.users(id) on delete cascade,
  saldo        integer not null default 0 check (saldo >= 0),
  atualizado_em timestamptz not null default now()
);

-- razão contábil: toda movimentação vira linha, nada é sobrescrito.
-- É isto que permite responder "por que o saldo dele é esse?" seis meses depois.
create table if not exists creditos_movimento (
  id           bigserial primary key,
  usuario_id   uuid not null references auth.users(id) on delete cascade,
  creditos     integer not null,             -- negativo = débito, positivo = estorno
  motivo       text    not null,
  referencia   text    not null,
  criado_em    timestamptz not null default now()
);

-- a referência é única por usuário: é ela que impede débito duplo e
-- estorno duplo, no banco, sem depender de disciplina do lado do código
create unique index if not exists creditos_movimento_unico
  on creditos_movimento (usuario_id, referencia, (creditos < 0));

-- ─────────────────────────────────────────────────── gerações de ambiente
create table if not exists geracao_mundos (
  id                 uuid primary key default gen_random_uuid(),
  job_id             text unique not null,
  usuario_id         uuid not null references auth.users(id) on delete cascade,
  idempotency_key    text,
  referencia_credito text not null,
  creditos           integer not null,
  nome               text,
  rad                text,
  estornado          boolean not null default false,
  criado_em          timestamptz not null default now(),
  concluido_em       timestamptz
);

create unique index if not exists geracao_mundos_idem
  on geracao_mundos (usuario_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists geracao_mundos_teto
  on geracao_mundos (usuario_id, criado_em desc);

-- ─────────────────────────────────────────────────── gerações de móvel
create table if not exists geracao_moveis (
  id                 uuid primary key default gen_random_uuid(),
  task_id            text unique not null,
  usuario_id         uuid not null references auth.users(id) on delete cascade,
  idempotency_key    text,
  referencia_credito text not null,
  creditos           integer not null,
  nome               text,
  glb_url            text,
  criado_em          timestamptz not null default now()
);

create unique index if not exists geracao_moveis_idem
  on geracao_moveis (usuario_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists geracao_moveis_teto
  on geracao_moveis (usuario_id, criado_em desc);

-- ───────────────────────────────────────────── autoria do walkthrough
-- O grafo de cômodos que o WS_MINT.html emite em ws:walkthrough-modelo.
-- Antes isto só existia na memória do iframe: o corretor ligava sala →
-- cozinha → suíte, nomeava e precificava os móveis, e perdia tudo no F5.
create table if not exists walkthrough_modelos (
  id          uuid primary key default gen_random_uuid(),
  imovel_id   text not null,
  autor_id    uuid references auth.users(id),
  versao      integer not null default 1,
  -- { v, ambientes[], passagens[{de,para,x,y,z}], pinos[{ambiente,x,y,z,movel}] }
  modelo      jsonb not null,
  criado_em   timestamptz not null default now(),
  unique (imovel_id, versao)
);

create index if not exists walkthrough_modelos_atual
  on walkthrough_modelos (imovel_id, versao desc);

-- ═════════════════════════════════════════════════════════════ funções

-- Debita numa instrução só. Devolve {ok:false, motivo} em vez de erro quando
-- o saldo é insuficiente: falta de crédito é resposta de negócio, não exceção.
create or replace function debitar_creditos(
  p_usuario    uuid,
  p_creditos   integer,
  p_referencia text,
  p_motivo     text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
begin
  if p_creditos <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'valor de débito inválido');
  end if;

  -- já debitado com esta referência? devolve sucesso sem cobrar de novo.
  if exists (
    select 1 from creditos_movimento
     where usuario_id = p_usuario and referencia = p_referencia and creditos < 0
  ) then
    select saldo into v_saldo from creditos_saldo where usuario_id = p_usuario;
    return jsonb_build_object('ok', true, 'saldo', coalesce(v_saldo, 0), 'repetido', true);
  end if;

  update creditos_saldo
     set saldo = saldo - p_creditos,
         atualizado_em = now()
   where usuario_id = p_usuario
     and saldo >= p_creditos
  returning saldo into v_saldo;

  if v_saldo is null then
    return jsonb_build_object('ok', false, 'motivo', 'créditos insuficientes');
  end if;

  insert into creditos_movimento (usuario_id, creditos, motivo, referencia)
  values (p_usuario, -p_creditos, p_motivo, p_referencia);

  return jsonb_build_object('ok', true, 'saldo', v_saldo);
end;
$$;

-- Estorna o débito daquela referência. Idempotente: chamar duas vezes devolve
-- crédito uma vez só — é o índice único que garante, não a boa vontade.
create or replace function estornar_creditos(
  p_usuario    uuid,
  p_referencia text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debito integer;
  v_saldo  integer;
begin
  select -creditos into v_debito
    from creditos_movimento
   where usuario_id = p_usuario and referencia = p_referencia and creditos < 0
   limit 1;

  if v_debito is null then
    return jsonb_build_object('ok', false, 'motivo', 'não há débito com esta referência');
  end if;

  if exists (
    select 1 from creditos_movimento
     where usuario_id = p_usuario and referencia = p_referencia and creditos > 0
  ) then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  update creditos_saldo
     set saldo = saldo + v_debito, atualizado_em = now()
   where usuario_id = p_usuario
  returning saldo into v_saldo;

  insert into creditos_movimento (usuario_id, creditos, motivo, referencia)
  values (p_usuario, v_debito, 'estorno', p_referencia);

  update geracao_mundos set estornado = true
   where usuario_id = p_usuario and referencia_credito = p_referencia;

  return jsonb_build_object('ok', true, 'saldo', v_saldo);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ RLS
-- As Edge Functions usam a service role e passam por cima disto. As políticas
-- existem para o acesso direto do front, que é onde o dado de um usuário pode
-- vazar para outro.
alter table creditos_saldo       enable row level security;
alter table creditos_movimento   enable row level security;
alter table geracao_mundos       enable row level security;
alter table geracao_moveis       enable row level security;
alter table walkthrough_modelos  enable row level security;

drop policy if exists movel_proprio on geracao_moveis;
create policy movel_proprio on geracao_moveis
  for select using (usuario_id = auth.uid());

drop policy if exists saldo_proprio on creditos_saldo;
create policy saldo_proprio on creditos_saldo
  for select using (usuario_id = auth.uid());

drop policy if exists movimento_proprio on creditos_movimento;
create policy movimento_proprio on creditos_movimento
  for select using (usuario_id = auth.uid());

drop policy if exists geracao_propria on geracao_mundos;
create policy geracao_propria on geracao_mundos
  for select using (usuario_id = auth.uid());

-- O modelo do walkthrough é leitura pública (o visitante precisa dele para
-- caminhar) e escrita só de quem autenticou.
drop policy if exists walkthrough_leitura on walkthrough_modelos;
create policy walkthrough_leitura on walkthrough_modelos
  for select using (true);

drop policy if exists walkthrough_escrita on walkthrough_modelos;
create policy walkthrough_escrita on walkthrough_modelos
  for insert with check (auth.uid() is not null);
