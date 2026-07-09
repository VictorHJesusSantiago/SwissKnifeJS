# e2e-flakiness

Consome o relatório JSON do Playwright, mantém uma janela histórica e calcula
flakiness usando taxa de falha e alternâncias de resultado. Configure o
Playwright com reporter `json` e passe `--report`, `--history` e `--runs`.
