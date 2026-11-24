Spécification : clone de apify/facebook-groups-scraper
Source : pages publiques apify.com/apify/facebook-groups-scraper (README, Input, API), consultées le 2026-11-24. Méthode : analyse boîte noire de l'interface publique (contrat d'entrée/sortie, tarification, limites). Le code interne de l'Actor n'est pas observé.

1. Statut des informations
Catégorie	Contenu
Observé	Schéma d'entrée, exemple de sortie, tarification, FAQ, limites déclarées
Déduit	Architecture cible (section 5)
Inconnu	Endpoints/GraphQL Facebook utilisés, gestion des anti-bots, stratégie de pagination, rotation de proxies résidentiels, mécanisme OCR
Les inconnus doivent être déterminés par observation directe de facebook.com (groupes publics, sans connexion) pendant l'implémentation. Ils ne sont pas déductibles de la page Apify.

2. Contraintes légales et de périmètre
Groupes publics uniquement. Pas de connexion, pas de cookies de compte, pas de contournement d'authentification (l'original l'exclut explicitement : « private group scraping would require login credentials, which goes against Facebook's Terms of Service »).
Le scraping automatisé viole les conditions d'utilisation de Facebook. Risque de blocage IP, mise en demeure, responsabilité civile. Les données contiennent des données personnelles (nom, ID, photo de profil, texte de commentaires) : RGPD applicable. Exiger une base légale documentée avant usage.
Ne pas distribuer le service comme API payante sans avis juridique.
Avertissement à inclure dans le README du nouveau repo.
3. Contrat d'entrée (observé)
Champ	Type	Requis	Défaut	Description
startUrls	array d'objets {url}	oui	-	URLs de groupes publics. Ex. https://www.facebook.com/groups/874728723021553 ou .../groups/<slug>/
resultsLimit	integer, min 1	non	illimité	Nombre max de posts (par URL, à confirmer par test)
viewOption	string enum	non	CHRONOLOGICAL	CHRONOLOGICAL, RECENT_ACTIVITY, TOP_POSTS, CHRONOLOGICAL_LISTINGS (BuySell uniquement)
onlyPostsNewerThan	string	non	-	Date absolue YYYY-MM-DD, ISO complet ou partiel (UTC), ou relatif (1 days, 2 months, 3 years, 1 hour, 2 minutes). S'applique uniquement à CHRONOLOGICAL
Exemple :

{
  "startUrls": [{ "url": "https://www.facebook.com/groups/874728723021553" }],
  "resultsLimit": 20,
  "viewOption": "CHRONOLOGICAL",
  "onlyPostsNewerThan": "2024-01-01"
}
Règles de validation à implémenter : URL hôte facebook.com + chemin /groups/<id|slug>; resultsLimit >= 1; onlyPostsNewerThan parsé en un seul module (absolu ou relatif), ignoré avec avertissement si viewOption != CHRONOLOGICAL.

4. Contrat de sortie (observé)
Un item de dataset par post :

{
  "facebookUrl": "https://www.facebook.com/groups/<slug>",
  "url": "https://www.facebook.com/groups/<slug>/permalink/<legacyId>/",
  "time": "2025-12-10T04:37:15.000Z",
  "user": { "id": "...", "name": "..." },
  "text": "...",
  "topReactionsCount": 2,
  "feedbackId": "<base64 feedback:<legacyId>>",
  "reactionLikeCount": 10,
  "reactionLoveCount": 2,
  "id": "<base64>",
  "legacyId": "1223750702961359",
  "likesCount": 12,
  "sharesCount": 0,
  "commentsCount": 34,
  "topComments": [
    {
      "commentUrl": ".../permalink/<legacyId>/?comment_id=<id>",
      "id": "<base64 comment:<postId>_<commentId>>",
      "feedbackId": "<base64>",
      "date": "2025-12-10T04:38:44.000Z",
      "text": "...",
      "profileUrl": "...",
      "profilePicture": "...",
      "profileId": "...",
      "profileName": "...",
      "likesCount": "1",
      "threadingDepth": 0
    }
  ],
  "facebookId": "<group numeric id>",
  "groupTitle": "...",
  "inputUrl": "<url fournie en entrée>",
  "pageAdLibrary": { "is_business_page_active": false, "id": "..." }
}
Notes :

Champs optionnels observés : pageAdLibrary, profileUrl (absent sur certains commentaires), reaction*Count (présents seulement si > 0 ; autres types : haha, wow, sad, angry, care).
likesCount des commentaires est une chaîne, celui des posts un nombre. Cloner tel quel ou normaliser et documenter l'écart.
Les id / feedbackId sont du base64 de chaînes feedback:<id> et comment:<postId>_<commentId>; les décoder et vérifier par test.
Médias annoncés dans le README (attachments, images, vidéos, miniatures, dimensions, texte OCR) : structure non montrée dans l'échantillon. Schéma à établir par observation.
Formats d'export annoncés : JSON, JSONL, CSV, Excel, HTML, XML.
5. Architecture cible (déduite)
Stack recommandée : TypeScript + Node >= 20, Playwright, Crawlee, Zod, Vitest. Alternative Python : Playwright + Pydantic.

src/
  input/        parse + validation Zod du contrat section 3; parseur de dates relatives/absolues
  facebook/
    url.ts      normalisation URL de groupe -> {id|slug}
    session.ts  contexte navigateur, proxy, cookies de consentement (pas de compte)
    feed.ts     chargement du flux, défilement/pagination, tri selon viewOption
    extract.ts  extraction post -> modèle brut (réponses réseau GraphQL interceptées en priorité, DOM en repli)
    comments.ts topComments
  model/        types Post, Comment, Media (source unique de vérité du schéma de sortie)
  output/       dataset writer: JSON, JSONL, CSV, XLSX, HTML, XML
  cli.ts        point d'entrée
  api.ts        serveur HTTP optionnel (POST /runs, GET /runs/:id/dataset)
tests/
  fixtures/     réponses Facebook enregistrées (anonymisées)
Principes :

Un seul propriétaire par interprétation : extract.ts produit le modèle, les autres couches ne relisent pas le HTML brut.
Interception des réponses réseau (JSON structuré) plutôt que parsing DOM fragile.
Reprise : état persisté (curseur de pagination, IDs vus) pour dédoublonnage et reprise après échec.
Arrêt dès que resultsLimit atteint ou qu'un post plus ancien que onlyPostsNewerThan apparaît (en tri chronologique).
Concurrence bornée, délais aléatoires, backoff sur blocage; proxy configurable (PROXY_URL). L'original utilise des proxies résidentiels : sans eux, le blocage est probable.
Journaliser les groupes en échec (privé, inexistant, bloqué) sans interrompre les autres.
6. Plan d'implémentation par étapes
Initialiser le repo : package.json, TypeScript strict, ESLint, Vitest, CI.
Implémenter input/ avec tests (dates relatives, URLs invalides, combinaisons viewOption).
Prototype facebook/ sur un groupe public : charger sans connexion, identifier les requêtes réseau portant les posts, enregistrer des fixtures.
Implémenter extract.ts et model/ ; test d'égalité de forme avec la section 4.
Pagination, tri (viewOption), filtre de date, limite.
topComments (profondeur 0 ; threadingDepth pour les réponses).
Médias, puis OCR (Tesseract ou service tiers) en option.
Writers d'export.
CLI : fbgroups --url <url> --limit 20 --sort CHRONOLOGICAL --since "2 days" --format jsonl --out out/.
README : usage, avertissement légal, limites, configuration proxy.
7. Critères d'acceptation
Entrée section 3 valide -> sortie conforme section 4 sur 3 groupes publics de tailles différentes.
500 posts en un temps du même ordre que l'original (< 2 min annoncées, avec proxies résidentiels).
Groupe privé/inexistant : erreur explicite par URL, sans arrêt global.
Relance idempotente : aucun doublon d'id.
Tests sur fixtures sans accès réseau.
8. Tarification de référence (original)
~2,60 à 5 USD / 1000 posts selon le plan Apify ; 1000 posts gratuits sur le plan Free. Le coût dominant d'un clone est le proxy résidentiel, pas le calcul.

