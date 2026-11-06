# af-format

answerfield ist eine typisierte, deklarativ-reaktive Sprache für digitale Assessments. Dieses Repository enthält das Bundle-Format, den Vertrag zwischen Sprache und Runtime, mit der Auswertung der Ausdrücke und Konformitätsfällen.

## Pakete

| Paket | Inhalt |
|---|---|
| `@answerfield/bundle` | Bundle-Format mit dem Katalog der eingebauten Typen, Aufzählungen, Funktionen und Elemente |
| `@answerfield/expr` | Auswertung der Ausdrücke im Bundle (Bedingungen, Berechnungen, Kodierregeln) und der eingebauten Funktionen, gemeinsam für Compiler und Runtime |
| `@answerfield/conformance` | Konformitätsfälle: Bundles und Abläufe mit erwarteten Ergebnissen |

Die Pakete liegen als Dateien an den [Releases](https://github.com/answerfield/af-format/releases).

## Bauen und testen

Voraussetzung ist Node.js 22.12 oder neuer.

```sh
npm ci && npm run build && npm test
```

## Lizenzen

| Pfad | Lizenz |
|---|---|
| `packages/conformance` | CC0-1.0 |
| alles andere (Code) | Apache-2.0 |

Die Lizenz jeder Datei steht in `REUSE.toml`, die Lizenztexte liegen in `LICENSES/`.

## Mitwirken

Issues und Pull Requests sind willkommen, siehe [CONTRIBUTING.md](CONTRIBUTING.md).
