# Facebook Group Extractor

Extracteur de posts de groupes Facebook **publics**, inspiré du contrat d'entrée/sortie de `apify/facebook-groups-scraper`.

> Statut : toute la chaîne est implémentée (entrée, flux, extraction, exports, CLI, API HTTP) et testée sur fixtures, **sauf le parseur des réponses GraphQL de Facebook**. Sans connexion, Facebook redirige vers sa page de connexion (observé le 2026-11-24 depuis un datacenter) : le format réel n'a pas pu être observé. Le CLI échoue donc par groupe avec `LOGIN_REQUIRED`. Voir [SPEC.md](SPEC.md).

## Avertissement légal

- Groupes publics uniquement. Aucune connexion, aucun cookie de compte, aucun contournement d'authentification.
- Le scraping automatisé enfreint les conditions d'utilisation de Facebook. Risques : blocage d'IP, mise en demeure, responsabilité civile.
- Les données collectées contiennent des données personnelles (nom, identifiant, photo de profil, texte de commentaires). Le RGPD s'applique. Une base légale documentée est requise avant tout usage.
- Ne pas distribuer comme API payante sans avis juridique.

## Entrée

| Champ | Type | Requis | Défaut | Description |
|---|---|---|---|---|
| `startUrls` | `[{url}]` | oui | - | URLs de groupes publics (`https://www.facebook.com/groups/<id\|slug>`) |
| `resultsLimit` | entier ≥ 1 | non | illimité | Nombre maximal de posts |
| `viewOption` | enum | non | `CHRONOLOGICAL` | `CHRONOLOGICAL`, `RECENT_ACTIVITY`, `TOP_POSTS`, `CHRONOLOGICAL_LISTINGS` (groupes BuySell) |
| `onlyPostsNewerThan` | chaîne | non | - | Date absolue (`YYYY-MM-DD`, ISO) ou relative (`2 days`, `3 months`). Uniquement avec `CHRONOLOGICAL` |

```json
{
  "startUrls": [{ "url": "https://www.facebook.com/groups/874728723021553" }],
  "resultsLimit": 20,
  "viewOption": "CHRONOLOGICAL",
  "onlyPostsNewerThan": "2024-01-01"
}
```

## Sortie

Un item par post : `facebookUrl`, `url`, `time`, `user`, `text`, compteurs de réactions, `likesCount`, `sharesCount`, `commentsCount`, `topComments`, `facebookId`, `groupTitle`, `inputUrl`. Schéma complet : section 4 de [SPEC.md](SPEC.md).

Formats d'export prévus : JSON, JSONL, CSV, XLSX, HTML, XML.

## Utilisation

```bash
npm ci
npm run build
node dist/cli.js --url https://www.facebook.com/groups/<slug> --limit 20 --sort CHRONOLOGICAL --since "2 days" --format jsonl --out out/
```

Options : `--url` (répétable), `--input fichier.json`, `--limit`, `--sort`, `--since`, `--format json|jsonl|csv|xlsx|html|xml`, `--out`, `--resume` (état persisté, aucun doublon entre exécutions), `--concurrency`, `--proxy`. Code de sortie : 0 succès, 1 au moins un groupe en échec, 2 entrée invalide.

Proxy : option `--proxy` ou variable `PROXY_URL`. Des proxies résidentiels sont nécessaires en pratique pour éviter les blocages.

### API HTTP

`createApi(sourceFactory)` (`src/api.ts`) expose `POST /runs`, `GET /runs/:id` et `GET /runs/:id/dataset?format=`. Les runs sont conservés en mémoire.

### Brancher le parseur Facebook

`PlaywrightSource` intercepte les réponses réseau pendant le défilement et les convertit via un `GraphqlParser` injecté (`(body) => RawPage | null`, `RawPost` défini dans `src/model/post.ts`). Ce parseur reste à écrire sur des fixtures réelles. Il en va de même pour les cookies de consentement, le tri selon `viewOption` et le schéma exact des médias (`attachments`, provisoire). L'OCR est une interface (`OcrProvider`) : aucun moteur n'est fourni.

## Architecture

TypeScript, Node ≥ 20, Playwright, Crawlee, Zod, Vitest.

```
src/
  input/     validation Zod, parseur de dates
  facebook/  url, session, source, feed, extract
  model/     schémas Post, Comment, Attachment et types bruts
  output/    writers JSON, JSONL, CSV, XLSX, HTML, XML
  run.ts     orchestration (erreurs par groupe, reprise, backoff, concurrence)
  ocr.ts     interface OCR
  cli.ts
  api.ts
tests/
```

## Tests

```bash
npm test
```

Aucun accès réseau externe requis.

## Limites

- Groupes privés ou inexistants : erreur explicite par URL, sans arrêt global.
- Critères d'acceptation de SPEC §7 sur groupes réels (3 groupes, 500 posts en moins de 2 minutes) : non vérifiés, faute de parseur Facebook.
