# Facebook Group Extractor

Extracteur de posts de groupes Facebook **publics**, inspiré du contrat d'entrée/sortie de `apify/facebook-groups-scraper`.

> Statut : phase de spécification. Le code n'est pas encore implémenté. Voir [SPEC.md](SPEC.md).

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

## Utilisation prévue (CLI)

```bash
fbgroups --url https://www.facebook.com/groups/<slug> --limit 20 --sort CHRONOLOGICAL --since "2 days" --format jsonl --out out/
```

Configuration proxy via la variable d'environnement `PROXY_URL`. Des proxies résidentiels sont nécessaires en pratique pour éviter les blocages.

## Architecture

TypeScript, Node ≥ 20, Playwright, Crawlee, Zod, Vitest.

```
src/
  input/     validation Zod, parseur de dates
  facebook/  url, session, feed, extract, comments
  model/     types Post, Comment, Media
  output/    writers JSON, JSONL, CSV, XLSX, HTML, XML
  cli.ts
  api.ts
tests/fixtures/
```

## Feuille de route

Plan par étapes et critères d'acceptation : sections 6 et 7 de [SPEC.md](SPEC.md).

## Limites

- Groupes privés ou inexistants : erreur explicite par URL, sans arrêt global.
- Médias et OCR : schéma à établir par observation.
- Endpoints et mécanismes anti-bot de Facebook : à déterminer pendant l'implémentation.
