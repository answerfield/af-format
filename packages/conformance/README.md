# @answerfield/conformance

Konformitätsfälle für Runtimes des Bundle-Formats: fertige Bundles und Abläufe mit erwarteten Ergebnissen. Eine
Runtime ist konform, wenn sie jeden Ablauf mit dem Bundle seines Themas so durchläuft, wie die Erwartungen es sagen.
Jede Erwartung ist aus der Bedeutung der Sprache (`docs/semantik.md`) begründet; die `description` eines Falls nennt
den Abschnitt.

## Dateien

Je Thema in `cases/`:

| Datei | Inhalt |
|---|---|
| `<thema>.bundle.json` | Release-Bundle ohne Dev-Felder |
| `<thema>.cases.json` | Abläufe: `{ "cases": [Fall, …] }` |
| `<thema>.af` | Quelltext des Bundles, nur zum Lesen |

`probes.af` enthält Hilfskomponenten (`Num`, `Flag`, `Txt` …), deren Antwort der Wert ihres Arguments ist; so steht
jeder Ausdruck JSON-kodiert in den Antworten. Sie ist kein Thema und hat kein eigenes Bundle.

Die Typen des Pakets (`import type { CaseFile } from '@answerfield/conformance'`) beschreiben Fälle, Schritte und
Erwartungen; `THEMES` nennt die Themen, die Dateien liegen unter `@answerfield/conformance/cases/…`. Das Paket hängt
von nichts ab.

## Bundles als Formatvektoren

Die Bundles sind eingefrorene Testvektoren der Formatversion: Alle tragen dieselbe `version` (die des Bundle-Formats,
für das sie gelten) und bleiben gültig, solange sich das Format nicht ändert. Eine andere Ausgabe des Compilers oder
eine neue Standardbibliothek macht sie nicht ungültig; der Compiler prüft seine Ausgabe gegen eigene Goldens. Neu
erzeugt werden die Bundles nur bewusst: bei einer neuen Formatversion oder bei neuen oder geänderten Fällen. Nur dann
erscheint dieses Paket in einer neuen Version.

## Fall

Ein Fall startet entweder eine Aufgabe des Bundles (`item`, dazu optional `accommodations`: angefragte Anpassungen,
`params`: vom Host gewählte Fassung) oder ein Testheft (`booklet`, optional `profile`: Bedarfsprofil, z. B.
`{ "timing": { "extension": 1.5 } }`). Die Uhr beginnt bei 0 und läuft nur mit `advance`. Dann folgen die Schritte
der Reihe nach.

## Schritte

| Schritt | Bedeutung |
|---|---|
| `{ "emit": { "element": "toggle", "index": 0 }, "event": "check" }` | Ereignis am *n*-ten Atom dieser Art der aktuellen Aufgabe (Schreibreihenfolge, ab 0); bei `bind` mit `value`, gelesen nach `type` (`"Rational"`, `"Point"`) oder nach der JSON-Form (Text, Zahl, `{ "x", "y" }`) |
| `{ "page": 1 }` | Seite *n* der aktuellen Aufgabe zeigen (ab 0) |
| `{ "advance": 10000 }` | Uhr um *n* Millisekunden vorstellen, dann ein Takt |
| `{ "media": 0, "signal": "ready" }` | Meldung des Renderers für das *n*-te `media`: `ready` (geladen), `started`, `ended` |
| `{ "judge": { "c: Kriterium": true } }` | Urteile der Kodierenden ab jetzt (ID `"regel: Kriterium"`) |
| `{ "restore": true }` | Zustand speichern (als JSON), Instanz verwerfen, aus dem Gespeicherten wiederaufnehmen |
| `{ "next": true }`, `{ "previous": true }`, `{ "goTo": 1 }`, `{ "finish": true }` | Testheft: weiter, zurück, Eintrag *n* des Teils (ab 0), beenden |
| `{ "control": { "kind": "pause", "seq": 2 } }` | Befehl der Testleitung: `release`, `pause`, `resume`, `extend` (`seconds`), `end`; optional `part`; ein Befehl mit gleicher oder kleinerer `seq` wird übergangen |
| `{ "expect": { … } }` | die genannten Beobachtungen prüfen |

## Erwartungen

Verglichen werden nur die genannten Angaben, und zwar teilweise: Objekte nur in den genannten Schlüsseln, Listen
Element für Element bei gleicher Länge; `"*"` passt auf jeden vorhandenen Wert, `null` auch auf einen fehlenden.

| Angabe | Beobachtung |
|---|---|
| `responses` | Antworten der Aufgabe (semantik.md, Abschnitt 14); im Testheft je Aufgabenname |
| `coding` | Kodierergebnis der Antworten mit den bisherigen Urteilen; im Testheft je Aufgabenname |
| `state` | Speicherstand: `"/pfad.zustand"` → Wert |
| `accommodations`, `params` | wirksame Anpassungen (sortiert), Parameter der laufenden Fassung |
| `page`, `pageCount` | aktuelle Seite (ab 0), Zahl der Seiten |
| `elements` | Atome (`element`, `index`) mit ausgewerteten `args`, `variants` und gebundenem Wert `bind` |
| `shows`, `hides` | Texte, die als sichtbarer Inhalt erscheinen bzw. nicht erscheinen |
| `timers` | Zustand jedes `timer` der Aufgabe: `running`, `remaining` und `duration` in Millisekunden |
| `playing`, `heard` | ob jedes `media` spielen soll; Wert von `heard()` |
| `locked`, `navigation` | ein `flow` sperrt; alle `flow` lassen Navigation zu |
| `log` | Protokolleinträge (Ereignisname oder Teil eines Eintrags) in dieser Reihenfolge, andere dürfen dazwischen liegen |

Nur im Testheft: `position` (`part`, `entry`, ab 0), `current` (Name des Eintrags), `part` (Name des Teils),
`remaining` (Restsekunden des Teils, `null` ohne Limit), `finished`, `waiting` (wartet auf Freigabe), `paused`,
`canNext` (Weiter bleibt im Teil), `canPrevious`, `atPartEnd` (Weiter verlässt den Teil).
