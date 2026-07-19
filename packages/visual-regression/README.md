# visual-regression

Compara PNGs pixel a pixel, aceita limiar de cor e proporção máxima de mudança,
gera uma imagem diff destacada e encerra com código 1 em regressões.

## CLI

```
visual-regression compare <baseline.png> <actual.png> [--diff diff.png] [--threshold .1] [--max-ratio 0]
  [--regions regions.json] [--viewports "desktop:1440x900,mobile:375x667"]

visual-regression approve <manifest.json> [--threshold .1] [--max-ratio 0]

visual-regression report <manifest.json> [--out visual-report.html] [--threshold .1] [--max-ratio 0]
```

`manifest.json` é um array de `{ "name", "baseline", "actual", "diff"? }`.

`regions.json` é um array de regiões `{ x, y, width, height, ignore?, threshold? }` para
ignorar áreas dinâmicas (relógios, ads) ou aplicar um limiar de diferença próprio a uma
sub-área da imagem.

## Módulos

- `regionTolerance.ts` — tolerância de diferença por região retangular (ignorar ou ajustar threshold).
- `interactiveApproval.ts` — aprovação/rejeição de baseline via CLI interativa (readline nativo).
- `htmlReport.ts` — relatório HTML autocontido com baseline/atual/diff embutidos em base64.
- `viewports.ts` — múltiplos viewports no mesmo teste, com baselines organizadas por viewport.
