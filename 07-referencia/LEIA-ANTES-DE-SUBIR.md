# Antes de subir — o erro a evitar

As duas tentativas anteriores falharam pelo mesmo motivo, e agora ele está
identificado com precisão.

## O que aconteceu

Os arquivos foram enviados a partir da pasta **Downloads**, não da pasta
extraída deste zip. A prova está no repositório anterior: havia arquivos
chamados `download` e `download (3)` — nomes que só o navegador cria.

Quando isso acontece, a estrutura de pastas some e os nomes se descolam do
conteúdo. No repositório `ws-experience`, o arquivo chamado `README.md`
continha, na verdade, os 741.100 bytes do `WS_STUDIO.html`. E o `LICENSE`
continha um texto de leia-me.

## O que mudou neste pacote

Antes havia **quatro arquivos chamados `LEIA-ME.md`** em pastas diferentes.
Ao achatar tudo numa pasta só, eles colidiam e o navegador renomeava para
`LEIA-ME (1).md`, `LEIA-ME (2).md` — e o pareamento entre nome e conteúdo
se perdia.

**Agora todos os 41 arquivos têm nomes únicos.** Mesmo que a estrutura se
perca de novo, nada mais colide.

## Como subir

1. **Extraia este zip na Área de Trabalho** — não deixe em Downloads.
2. Crie o repositório no GitHub **vazio**, sem README.
3. Clique em **"uploading an existing file"**.
4. Abra a pasta `ws-plataforma` extraída. **Entre nela.**
5. `Ctrl + A` para selecionar o conteúdo.
6. **Arraste** para a área de upload. Não use o botão "choose your files" —
   ele achata as pastas.
7. Confira que a lista mostra **41 arquivos** antes de commitar.

## Como saber se deu certo

A página do repositório precisa mostrar oito pastas:

```
00-LEIA-PRIMEIRO  01-portal  02-camadas  03-contrato
04-servidor       05-testes  06-assets   07-referencia
```

E o teste decisivo: **`02-camadas/studio-3d/WS_STUDIO.html` com 741.100 bytes.**

Se aparecer qualquer arquivo chamado `download`, ou o `README.md` estiver com
centenas de KB, a origem do upload estava errada. Apague e refaça.

## O caminho que não erra

`SUBIR-NO-GITHUB.bat`, na pasta ENTREGÁVEIS. Duplo clique. Ele usa git, que
preserva tudo por construção e não depende de arrastar nada.
