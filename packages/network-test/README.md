# network-test

Execute agentes com `network-test agent`. O coordenador recebe uma lista JSON
`[{ "id", "region", "url", "lastSeen" }]` e mede cinco pings, jitter, download
e upload. O tamanho da amostra e o limite de 50 MB evitam abuso acidental.
