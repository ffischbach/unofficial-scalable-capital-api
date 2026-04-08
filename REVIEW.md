# Code Review Guidelines

Diese Datei wird ausschließlich beim automatischen Code Review (Claude Code Review GitHub App) gelesen. Allgemeine Projekt-Konventionen stehen in `CLAUDE.md`.

## Always check

- **Session-Handling**: Schreibzugriffe auf die Session laufen ausschließlich über `persistSession()` (atomic write, mode `0o600`). Kein direktes `fs.writeFile` auf `session.json`.
- **GraphQL-Aufrufe**: Jeder neue Call nutzt `graphqlRequest()` aus `src/scalable/client.ts` — keine eigenen `fetch`-Aufrufe gegen `de.scalable.capital`. Header `x-scacap-features-enabled: CRYPTO_MULTI_ETP,UNIQUE_SECURITY_ID` muss gesetzt sein.
- **Auth-Middleware**: Neue Routen außerhalb von `/auth/*` müssen durch das Gateway-Token-Middleware geschützt sein.
- **Error-Handler**: Express-Error-Handler verwenden die 4-Argument-Signatur `(err, req, res, next)`.
- **`savingsId`-Branches**: Routen, die `savingsAccount` lesen, geben `503` zurück, wenn `savingsId` `null` ist.
- **ESM-Imports**: Interne Imports nutzen `.ts`-Endung. Kein CommonJS, kein `__dirname` ohne `fileURLToPath`.
- **Secrets / Logs**: Keine Cookies, Tokens oder personenbezogenen IDs (`personId`, `portfolioId`) in Logs oder Fehlermeldungen.
- **WebSocket-Subscriptions**: Neue Subscriptions gehen über den `WsManager`-Singleton, öffnen keine eigene WebSocket-Verbindung.
- **Tests & Build**: Bei Logikänderungen prüfen, ob `npm run build` und `npm test` betroffen sind und passende Tests existieren.

## Style

- Frühe Returns gegenüber tief verschachtelten `if`-Blöcken bevorzugen.
- Kein toter Code, keine spekulativen Abstraktionen oder Feature-Flags ohne Bezug zur Änderung.
- Kommentare nur dort, wo die Logik nicht selbsterklärend ist.

## Skip

- Reine Formatierungs-Änderungen.
- Generierte Dateien und Lockfiles (`package-lock.json`).
- Vorschläge zu zusätzlichen Docstrings/Typen für Code, der nicht angefasst wurde.