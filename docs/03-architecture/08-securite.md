# Open Keys — Architecture : Sécurité

[← Sommaire](./README.md)

- Cookies `httpOnly`, `Secure`, `SameSite=Lax`, avec vérification de l'en-tête `Origin` sur les requêtes qui modifient des données.
- **Mots de passe** : argon2id (`node:crypto`, 64 Mio, 3 passes), stockés au format PHC. Pour un identifiant inconnu, le mot de passe est quand même vérifié contre un hash factice, pour que le temps de réponse ne révèle pas quels comptes existent. Le message d'erreur est identique dans les deux cas.
- **Limite de connexion** : 5 échecs par 15 minutes et par (IP, identifiant), puis 429 avec `Retry-After`. L'IP vient de `X-Forwarded-For` seulement si `TRUST_PROXY=true` (derrière Traefik).
- **Sessions** : jeton aléatoire de 256 bits ; seul son SHA-256 est stocké. Expiration glissante de 90 jours, prolongée au plus une fois par jour. Cookie `httpOnly`, `SameSite=Lax`, `Secure` en production. Purge des sessions expirées par la maintenance.
- **Micro** (V1.5) : `Permissions-Policy: microphone=(self)` (auparavant interdit). Le son n'est ni enregistré ni envoyé : il est analysé dans la page.
- **Comptes et invitations** (D29) : pas d'inscription ouverte. Un compte se crée uniquement par un lien de l'administrateur : jeton aléatoire de 192 bits dont seul le SHA-256 est stocké, à usage unique (marqué utilisé avant le calcul du hash du mot de passe, pour que deux requêtes simultanées ne l'utilisent pas deux fois), valable 7 jours, révocable. Mots de passe de 10 caractères minimum. Un compte désactivé reçoit la même réponse qu'un mauvais mot de passe, et ses sessions sont supprimées. Rôle vérifié à chaque requête (lu avec la session).
- **Import d'enregistrements** (D34) :
  - **Envoi** : réservé aux comptes connectés. Les fichiers sont limités à 40 Mo (`bodyLimit`) et aux extensions audio, avec au plus 3 en attente par personne.
  - **Stockage** : le fichier est rangé sous son SHA-256, jamais sous le nom envoyé, et supprimé dès la tâche finie.
  - **Service `transcriber`** : il n'a pas de domaine et n'est joignable que par l'API, sur le réseau du compose. Il tourne sous un utilisateur non root.
  - **Lecture de l'audio** : ffmpeg lit les octets sur son entrée standard, sans chemin de fichier fourni par l'utilisateur. La durée est plafonnée à 15 min.
  - **Modèle** : il est vérifié par son SHA-256 au build et chargé en mode `weights_only` : des poids, pas de code exécuté.
  - **Accès aux transcriptions** : elles sont personnelles. Celle d'un autre compte répond 404.
- **Enregistrements d'une autre app** (D35) :
  - **Sources autorisées** : seules les origines de `AUDIO_SOURCES` sont téléchargées (avec `safeFetch` : pas d'adresse privée, taille limitée) ou relayées au lecteur. Une origine retirée de la liste n'est plus servie.
  - **Relais** : le navigateur ne parle qu'à Open Keys. La CSP reste inchangée, et l'autre app n'a pas besoin d'accepter le cross-origin.
  - **API d'intégration** : clé de 32 caractères au moins, comparée en temps constant (empreintes SHA-256). Elle n'existe que si la clé est configurée, agit au nom d'un seul compte, et ne lance que des transcriptions de sources autorisées.
- **Routes protégées par préfixe** (voir `06-api.md`). L'identifiant d'une ressource créée côté client (boucle, session) qui appartient à un autre utilisateur est traité comme introuvable : jamais écrasé, jamais révélé.
- Import par URL (`shared/http/safe-fetch.ts`) : seulement http/https sans identifiants dans l'URL, 3 redirections au plus (chacune revalidée), délai maximal de 10 s, 2 Mo maximum (contrôlés aussi pendant le téléchargement). **Seules les adresses unicast publiques sont autorisées**, et elles sont vérifiées **au moment de la connexion** (`lookup` de l'`Agent` undici), ce qui couvre aussi le DNS rebinding. Les IP écrites en dur dans l'URL sont vérifiées avant. Testé contre `127.0.0.1`, `localhost`, `::1`, `169.254.169.254`, `10.x`, `fd00::`, `::ffff:127.0.0.1` et un DNS truqué.
- Les URL de couverture passent par le même `safe-fetch`, avec 10 Mo maximum en entrée. sharp valide le format (JPEG, PNG, WebP, AVIF) et **ré-encode** toujours l'image : aucun fichier d'origine n'est servi, et les métadonnées EXIF sont supprimées.
- Appels à MusicBrainz : `User-Agent` identifiant l'app (`OpenKeys/<version> ( <MUSICBRAINZ_CONTACT> )`, contact fourni par variable d'environnement), 1 requête par seconde maximum, résultats mis en cache.
- Fichiers stockés sous le nom de leur hash : aucun chemin fourni par l'utilisateur n'est utilisé.
- En-têtes de sécurité : CSP stricte (nginx, pour les pages). `img-src` doit autoriser `coverartarchive.org`, `*.archive.org`, `upload.wikimedia.org` et `thumb.wikimedia.org` (vignettes Wikimedia depuis 2026) : les vignettes des suggestions de couverture sont chargées directement par le navigateur (`referrerpolicy=no-referrer`), et `secureHeaders()` de Hono sur l'API (`X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, etc.).
- La CSP n'autorise ni `unsafe-eval` ni script inline (voir [déploiement](./07-deploiement.md#web-nginx)). Les deux conteneurs tournent avec un utilisateur non root.
- Les erreurs inattendues ne renvoient jamais leur message ni leur pile au client. Le détail ne figure que dans les logs, retrouvable grâce au `requestId`.
