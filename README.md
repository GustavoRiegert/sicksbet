# SicksBET

Brincadeira: "O John Sick vem hoje?". Cada pessoa palpita **vem / não vem** e, se vem, **a que horas**, apostando pontos do próprio saldo. O admin informa a hora real e os pontos saem pela proximidade.

## Pontuação
Todo mundo começa com **100 pontos** e aposta quanto quiser do próprio saldo (um palpite por rodada, editável até o admin fechar).
- Horário exato: **5x** o valor apostado
- Senão: até **3x**, caindo até 0 quando o erro chega a 90 min
- Cravou "não vem" e ele furou: **2,5x**
- Errou vem/não vem: perde o valor apostado
- **Banco do Sicks:** com menos de 20 pontos dá para pegar 50 emprestados e devolver 60 (dívida máxima 150). O ranking desconta a dívida.

## Como funciona
- `index.html`: jogadores. `admin.html`: admin (resultado, fechar apostas, nova rodada).
- Os dados ficam em CSV neste repositório (`data/*.csv`).
- Os amigos **não precisam de token**: o navegador chama `/api/*` (funções do Vercel) e é o servidor que grava no GitHub.
- `lib/game.js` tem as regras e é usado tanto pelo navegador quanto pelo servidor, que valida tudo (saldo, apostas fechadas, PIN do admin).

## Variáveis de ambiente (Vercel → Settings → Environment Variables)
| Nome | Para quê |
|---|---|
| `GITHUB_TOKEN` | Token fine-grained só deste repositório, com **Contents: Read and write** |
| `ADMIN_PIN` | PIN da página admin (fica só no servidor) |
| `GH_OWNER`, `GH_REPO`, `GH_BRANCH` | Opcionais (padrão: `GustavoRiegert`, `sicksbet`, `main`) |

Depois de mudar variáveis, faça um novo deploy.

## Testar localmente
Servindo a pasta em `localhost` o site usa um **modo local** (dados só no navegador, PIN `1234`), sem precisar do servidor.
