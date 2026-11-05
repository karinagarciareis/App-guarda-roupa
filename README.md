# Provador — guarda-roupa online (MVP)

App web (funciona no celular) para organizar o guarda-roupa e montar looks com IA.

## O que já faz

- **Onboarding com foto do corpo** — nome, foto de corpo inteiro (ex.: de biquíni) e informações como altura e manequim. Serve para a IA sugerir cortes que valorizam as proporções.
- **Guarda-roupa em duas seções** — *Já tenho* e *Quero ter* (lista de desejos, com link e preço da loja).
- **Mini-seções por categoria** — partes de cima, partes de baixo, vestidos e macacões, casacos, calçados, bolsas, acessórios.
- **Preencher com IA** — tira a foto da peça e a IA sugere nome, categoria e cor.
- **Criar look** — escolhe a ocasião (show, festa, trabalho…), descreve os detalhes, informa uma referência (artista, estética, print do Pinterest), escolhe de onde vêm as peças (tenho, quero ter ou os dois), quais seções entram e quais peças são obrigatórias. A IA devolve looks com explicação, dicas de styling, o que da lista de desejos entra no look e o que vale comprar para completar.
- **Provador virtual** — coloca o look no seu corpo:
  - **Vestir em mim (IA):** gera uma foto realista sua vestindo as peças do look, usando a IA de imagem do Google (Gemini / "Nano Banana"). Precisa de uma chave do Gemini em *Perfil → Provador virtual*. Pode rodar automaticamente sempre que os looks são criados.
  - **Montar na minha foto:** recorta o fundo das fotos das peças e deixa arrastar, girar e redimensionar sobre a sua foto. Funciona sem chave e em qualquer lugar.
- **Sorteio sem IA** — combinações aleatórias respeitando as seções, para testar sem IA.
- **Looks salvos** e botão **"Comprei!"** que move a peça de *Quero ter* para *Já tenho*.

## Privacidade

Fotos e dados ficam só no aparelho (IndexedDB do navegador). Eles só são enviados à IA quando a pessoa pede um look ou a identificação de uma peça.

## Como a IA funciona

Para mandar muitas peças de uma vez, o app monta uma "folha de contato": junta as fotos das peças numa imagem só, cada uma com um número (#1, #2…), e manda junto um catálogo em texto. A IA responde com os números das peças de cada look.

Dois jeitos de conectar:

1. **Dentro do claude.ai** (versão Artifact): usa a conta Claude de quem está usando, sem chave.
2. **Fora** (local ou GitHub Pages): em *Perfil → Inteligência artificial*, cole uma chave da API da Anthropic. Ela fica salva só no aparelho.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` publica o app a cada push. Só precisa ativar uma vez:
*Settings → Pages → Build and deployment → Source: GitHub Actions*.

A foto realista com IA (Gemini) só funciona nessa versão web (ou local). Dentro do claude.ai, o navegador bloqueia chamadas para outros serviços.

## Rodar localmente

Não precisa instalar nada. Sirva a pasta com qualquer servidor estático:

```bash
npx serve .
# ou
python3 -m http.server 8000
```

Abra `http://localhost:8000`.

## Gerar a versão de arquivo único (Artifact)

```bash
node scripts/build-artifact.mjs   # gera dist/provador.html com CSS e JS embutidos
```

## Estrutura

```
index.html              página principal
src/styles.css          visual (tema claro e escuro)
src/storage.js          armazenamento local (IndexedDB)
src/ai.js               IA (Claude) e tratamento de imagens
src/tryon.js            provador virtual (Gemini + montagem manual)
src/app.js              telas, estado e regras do app
scripts/build-artifact.mjs
```

## Próximos passos possíveis

- Remover o fundo das fotos das peças automaticamente
- Login e sincronização entre aparelhos
- Calendário de looks e histórico do que já usou
- Importar peça a partir do link da loja
