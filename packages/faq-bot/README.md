# faq-bot

Webhook compatível com slash commands do Slack e mensagens JSON do Teams.
Configure `FAQ_FILE`, `UNANSWERED_FILE`, `METRICS_FILE` e `PORT`. Respostas abaixo do limiar viram triagem humana.
Em produção, valide a assinatura do provedor no proxy/API gateway.

A busca usa correspondência fuzzy local (token + distância de Levenshtein), sem depender de
serviços externos de IA/embeddings, o que tolera erros de digitação e sinônimos parciais nas palavras-chave.

## Rotas

- `POST /` — pergunta em texto (Slack slash command ou JSON `{ text }`/`{ value: { text } }`).
- `GET /unanswered` — lista perguntas sem resposta segura, ordenadas por frequência.
- `POST /unanswered/promote` — body `{ id, faq: { question, answer, keywords, category? } }`, move a pergunta da fila de triagem para a FAQ oficial.
- `GET /export` — exporta a FAQ atual em Markdown (`## categoria`, `### pergunta`, resposta e `Tags:`).
- `POST /import` — recebe Markdown no mesmo formato e substitui a FAQ atual.
- `GET /metrics` — relatório com total de perguntas, taxa de resolução automática e perguntas mais frequentes.
