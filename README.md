# SicksBET

Brincadeira: "O John Sick vem hoje?". Cada pessoa palpita **vem / não vem** e, se vem, **a que horas**. O admin informa a hora real e os pontos saem pela proximidade.

## Pontuação
Todo mundo começa com **100 pontos** e aposta quanto quiser do próprio saldo (um palpite por rodada, editável até o admin fechar).
- Horário exato: **5x** o valor apostado
- Senão: até **3x**, caindo até 0 quando o erro chega a 90 min
- Cravou "não vem" e ele furou: **2,5x**
- Errou vem/não vem: perde o valor apostado

O saldo é calculado a partir do CSV (100 − apostas + retornos). O ranking é por saldo.

## Páginas
- `index.html`: jogadores (apostar, ranking, meus palpites)
- `admin.html`: admin (PIN em `config.js`): resultado, fechar apostas, nova rodada

## Dados (CSV)
- `data/rodadas.csv` e `data/apostas.csv`, lidos e gravados pela API do GitHub.

## Publicar no GitHub
1. Crie um repositório (público) e suba todos os arquivos.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Em `config.js`, preencha `owner` e `repo` e troque o `adminPin`.
4. Crie um token: Settings → Developer settings → Fine-grained tokens → só este repositório → Contents: **Read and write**.
5. Abra `admin.html`, cole o token em "Chave de acesso". Passe o mesmo token para os amigos (WhatsApp); o site pede na primeira aposta e guarda no aparelho. **Nunca coloque o token no repositório.**

Sem `owner`/`repo`, o site roda em modo local (dados só no navegador), bom para testar.
