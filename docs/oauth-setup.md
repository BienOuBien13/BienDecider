# Démarches OAuth — Google Business Profile & Meta (Facebook/Instagram)

Depuis le 2026-10-09, le nom public est **BienDecider** (anciennement Pepito). Le dépôt et le projet Vercel gardent leur nom. Pour la bascule du domaine et du contact, voir [domain-email-setup.md](domain-email-setup.md).

## Qui fait quoi (point souvent confondu)

Ce document décrit une démarche **à faire une seule fois par le CEO**, pas par les entreprises clientes.

| | Qui | Quand | Quoi |
|---|---|---|---|
| **Enregistrer l'app BienDecider** | Vous (CEO) | Une fois pour toute la plateforme | Ce document : créer un projet Google Cloud + une app Meta qui représentent "BienDecider" auprès de ces plateformes, et récupérer des identifiants (`CLIENT_ID`/`CLIENT_SECRET`) à mettre dans `.env`. |
| **Connecter sa fiche/page** | Chaque entrepreneur client | À chaque nouvelle entreprise, autant de fois que nécessaire | Clic sur "Connecter" dans `/connexions` → redirection vers l'écran **officiel** Google ou Meta → il se connecte avec **son propre compte existant** → il autorise BienDecider. Aucune notion technique, aucun identifiant à saisir, juste un clic. C'est exactement le flux "Se connecter avec Google" que tout le monde connaît déjà. |

Autrement dit : vous ne créez l'app qu'une fois ; ensuite, chaque entreprise (vous compris, pour vos tests) se connecte individuellement avec son propre compte Google/Meta via l'écran de consentement standard — c'est ce qui permet à BienDecider d'agir sur sa fiche/page spécifique sans jamais voir son mot de passe.

Le code du flux "Connecter" est déjà prêt ([backlog.md #2quater](backlog.md)) pour les entrepreneurs. Ce qui manque est uniquement l'étape CEO ci-dessous — entièrement externe, à faire dans les consoles Google et Meta. Aucune de ces étapes ne peut être automatisée depuis le code.

## 1. Google (fiche Google Business Profile)

**Ne pas confondre avec Gmail** : les variables `GOOGLE_OAUTH_*`, le callback `/api/oauth/google/callback` et `business.manage` concernent GBP uniquement. Le flux Gmail est indépendant, décrit plus bas, et n'est pas soumis au prérequis GBP des 60 jours.

**Statut au 2026-10-09 (déclaré par le CEO)** : domaine opérationnel, compte Google, fiche créée/vérifiée et projet Cloud créé. **Project Number : `915822663727`** (identifiant public, pas une clé). La fiche gérée actuellement a moins de 60 jours : demande d'accès API en attente d'éligibilité. Date exacte à renseigner ; aucune échéance calculée sans cette date.

### Prérequis et demande d'accès : avant l'activation des APIs

Google exige de gérer une fiche **vérifiée et active depuis 60 jours ou plus**, avec un site représentant l'entreprise renseigné sur cette fiche. Cette fiche peut être celle du demandeur **ou d'un client qu'il gère**. Une fiche cliente déjà éligible peut donc permettre de déposer plus tôt, sans contourner les conditions Google.

1. Vérifier ces conditions et que le compte demandeur est **propriétaire ou gestionnaire** de la fiche.
2. Ouvrir le [formulaire GBP](https://support.google.com/business/contact/api_default), choisir **Application for Basic API Access**, fournir le Project Number **`915822663727`** et les informations demandées.
3. Attendre la décision de Google. Les quotas GBP donnent un indicateur : **0 QPM = non approuvé**, **300 QPM = approuvé** selon la documentation des prérequis. L'âge de la fiche ne garantit pas l'approbation.
4. Après approbation, activer les APIs Business Profile selon le [guide Basic setup](https://developers.google.com/my-business/content/basic-setup), dont Account Management et Business Information pour identifier comptes et établissements. L'approbation GBP et la vérification de l'application OAuth sont **deux démarches distinctes**.

Source : [prérequis Google](https://developers.google.com/my-business/content/prereqs).

### Préparer OAuth maintenant, tester GBP après approbation

Le branding OAuth, la propriété du domaine et les documents publics peuvent être préparés pendant l'attente ; cela ne donne pas l'accès GBP.

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com/) et créer un nouveau projet (ex: "BienDecider"), ou conserver le projet existant.
2. Vérifier la propriété de `biendecider.com` via Search Console et le domaine autorisé dans Google Auth Platform. Accueil : `https://www.biendecider.com`, confidentialité : `https://www.biendecider.com/confidentialite`, CGU : `https://www.biendecider.com/cgu`. Les pages existent et sont liées depuis l'accueil, mais les documents restent des brouillons juridiques à compléter/valider.
3. Menu **API et services → Écran de consentement OAuth** :
   - Type d'utilisateur : *Externe*.
   - Nom de l'application : "BienDecider". Sélectionner un email de support disponible dans la console ; une simple redirection `contact@biendecider.com` vers Gmail ne rend pas forcément cette adresse sélectionnable. Valider la réception et l'éligibilité de l'adresse, sinon utiliser le compte Google gestionnaire pour ce champ. Logo final à préparer.
   - Champs d'application (scopes) : ajouter `https://www.googleapis.com/auth/business.manage`.
   - Tant que l'app est en statut **Test**, seuls les comptes Google que vous ajoutez explicitement comme "utilisateurs test" peuvent se connecter — suffisant pour le pilote, pas besoin de validation Google immédiatement.
4. Menu **API et services → Identifiants** → **Créer des identifiants → ID client OAuth** :
   - Type d'application : *Application Web*.
   - URI de redirection autorisée : `https://www.biendecider.com/api/oauth/google/callback` (et `http://localhost:3000/api/oauth/google/callback` pour tester en local). Domaine autorisé de l'écran de consentement : `biendecider.com`.
5. Récupérer le **Client ID** et le **Client Secret**, les mettre dans `.env` :
   ```
   GOOGLE_OAUTH_CLIENT_ID="..."
   GOOGLE_OAUTH_CLIENT_SECRET="..."
   ```
6. En production, ajouter `GOOGLE_OAUTH_CLIENT_ID` et `GOOGLE_OAUTH_CLIENT_SECRET` dans **Vercel > bien-decider > Settings > Environment Variables > Production**, puis redéployer. Ne jamais les envoyer dans un chat, les commiter ou les afficher dans des logs. En local, utiliser `.env` (ignoré par Git).
7. Tester `/connexions` avec un compte test autorisé. Le code actuel échange le code OAuth et enregistre un jeton ; il **ne liste pas encore les fiches, ne sélectionne pas d'établissement et ne publie pas**. Ne pas considérer cette seule étape comme une connexion métier validée.

En mode OAuth **Testing**, les autorisations avec des scopes comme `business.manage` et les refresh tokens sont limités à **7 jours** : prévoir une réautorisation pendant le pilote. Le renouvellement du jeton d'accès ne supprime pas cette limite. [Durée des autorisations Google](https://support.google.com/cloud/answer/15549945).

**Pour sortir du mode Test** (accepter n'importe quel utilisateur, pas seulement les comptes test ajoutés manuellement) : revenir à l'écran de consentement OAuth et cliquer *Publier l'application*. Pour un scope sensible comme `business.manage`, Google peut demander une **vérification** (quelques jours) avant la mise en production réelle à grande échelle — mais le mode Test suffit largement pour le pilote à 5 entreprises.

## Gmail : envoi manuel, indépendant de GBP

Le CEO a confirmé l'usage **envoyer des emails depuis Gmail**, pas la connexion GBP ni le login Google. Callback implémenté : **`https://www.biendecider.com/api/oauth/gmail/callback`**. Démarrage : `/api/oauth/gmail/start`, depuis `/connexions`.

### À configurer hors du chat

1. **Révoquer/remplacer le secret OAuth divulgué**, dans Google Cloud > Google Auth Platform > Clients. Ne pas le réutiliser, le consigner dans le dépôt ou transmettre son remplaçant au chat.
2. Dans le projet Cloud existant, activer **Gmail API** (indépendant de Business Profile), configurer l'audience External et ajouter le compte Gmail aux utilisateurs test si l'application est en Testing.
3. Ajouter le scope **`https://www.googleapis.com/auth/gmail.send`** au consentement. Les scopes standard **`openid` et `email`** identifient le compte expéditeur (signature du jeton d'identité vérifiée côté serveur). Aucun scope de lecture, de suppression de messages ni `business.manage` n'est demandé par ce flux. Gmail send est un scope sensible : la vérification OAuth de production reste nécessaire selon les exigences Google.
4. Conserver l'URI autorisée exacte **`https://www.biendecider.com/api/oauth/gmail/callback`**. Ajouter séparément un callback localhost si souhaité ; lancer et terminer OAuth sur le même hôte afin de conserver les cookies de session et de state.
5. Dans **Vercel > bien-decider > Settings > Environment Variables > Production**, saisir directement :

   ```text
   GMAIL_OAUTH_CLIENT_ID=<identifiant du client web Google>
   GMAIL_OAUTH_CLIENT_SECRET=<nouveau secret non divulgué>
   OAUTH_TOKEN_ENCRYPTION_KEY=<clé aléatoire de 32 octets, encodée en 64 caractères hexadécimaux>
   ```

   Générer la clé **dans votre terminal privé**, puis la saisir dans Vercel sans la partager : `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Conserver cette clé dans un gestionnaire de secrets. Ne pas utiliser `SESSION_SECRET` ni une clé d'exemple. Changer cette clé sans migration rend les jetons existants illisibles : déconnecter/réautoriser ou prévoir une migration de rotation.
6. Redéployer après modification des variables. En local, utiliser `.env` ignoré par Git avec une clé propre à l'environnement. Les noms `GOOGLE_OAUTH_*` continuent à servir uniquement GBP.
   Avant ouverture aux clients externes, restreindre aussi `ADMIN_EMAILS` : l'administration reste ouverte aux utilisateurs connectés si cette variable est absente (décision du pilote), avec visibilité sur les entreprises et possibilité de suppression.
7. Ouvrir **`https://www.biendecider.com/connexions`**, **Autoriser Gmail**, choisir le compte expéditeur et accepter l'envoi. Ouvrir **Écrire un email**, renseigner le destinataire, l'objet et le texte, confirmer puis envoyer. Commencer par un message à une adresse de test que vous contrôlez.

### Fonctionnement livré et limites

- Autorisation avec state lié à l'entreprise, cookie HTTP-only de 10 minutes et PKCE ; contrôle serveur du scope accordé. Un retour sans nouveau refresh token est refusé plutôt que de risquer de réutiliser celui d'un autre compte.
- Jetons Gmail chiffrés AES-256-GCM, liés à l'entreprise. Renouvellement par la bibliothèque Google avant l'envoi ; aucun jeton envoyé au navigateur, à Anthropic ou dans les logs applicatifs.
- Envoi texte manuel via Gmail API, confirmation obligatoire, un seul destinataire, sans pièce jointe ni lecture de la boîte. Les permissions n'installent pas un alias expéditeur `contact@biendecider.com` : l'expéditeur est le compte choisi chez Google.
- Chaque demande possède un identifiant unique enregistré avant l'appel Gmail ; un double clic avec le même identifiant ne renvoie pas l'email. Après résultat incertain, vérifier les messages envoyés dans Gmail avant de refaire une demande. Pas de retry automatique de l'appel d'envoi.
- Objet, destinataire et message enregistrés dans l'historique des productions ; réussite confirmée par Gmail tracée comme exécution. L'acceptation par Gmail ne prouve pas la livraison au destinataire.
- Déconnexion : tentative de révocation Google, puis suppression locale des jetons. Si la révocation échoue, l'interface invite à retirer l'accès depuis le compte Google. Google peut révoquer les autres scopes du même projet : confirmation explicite requise.
- Aucun envoi autonome des rapports ou du funnel de prospection, aucun remplacement de `OUTREACH_EMAIL_PROVIDER_API_KEY`. Ces parcours doivent être branchés et validés séparément. Le pilote OAuth Testing peut nécessiter une nouvelle autorisation après 7 jours.

Tests : `npm run test:gmail` (sans réseau) et `npm run test:ux` (refus/callback/UI sans appel Google). L'autorisation et la livraison réelles restent à valider avec le nouveau secret dans l'environnement cible.

Sources : [scopes Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [envoi Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send), [OAuth serveur Google](https://developers.google.com/identity/protocols/oauth2/web-server).

## 2. Meta (Facebook + Instagram)

**Priorité externe pendant l'attente Google. Choix retenu : Facebook Login**, cohérent avec l'intégration déjà codée et le besoin Facebook + Instagram professionnel lié à une Page. Pas d'ajout d'Instagram Login en parallèle : les flux et permissions diffèrent. BienDecider sert plusieurs entreprises : scénario **Tech Provider**, **Advanced Access et App Review requis** pour les permissions concernées.

Préparer un Business Portfolio, relier l'app BienDecider et compléter la Business Verification selon les exigences du dashboard Meta. Préparer également identité légale, support testé, icône finale (1024 × 1024 pour le dossier), politique publique validée et procédure de suppression des données. Ne pas demander de permissions de publication avant de pouvoir démontrer leur usage réel de bout en bout : l'exécution n'est pas encore implémentée.

Source : [App Review Instagram](https://developers.facebook.com/documentation/instagram-platform/app-review/). Les menus Meta peuvent varier selon les cas d'usage et le type d'app proposés par la console.

**Durée estimée : 1-2h de configuration, puis plusieurs jours à plusieurs semaines d'attente pour l'App Review — hors de notre contrôle.**

1. Aller sur [developers.facebook.com](https://developers.facebook.com/) → **Mes apps → Créer une app** → type "Entreprise".
2. Ajouter le produit **Facebook Login** (sidebar → Ajouter un produit).
3. Dans **Facebook Login → Paramètres** : ajouter l'URI de redirection `https://www.biendecider.com/api/oauth/meta/callback`. Nom public de l'app : BienDecider ; domaine : `biendecider.com` ; confidentialité : `https://www.biendecider.com/confidentialite`.
4. Récupérer **App ID** et **App Secret** (menu Paramètres → Général), les mettre dans `.env` :
   ```
   META_APP_ID="..."
   META_APP_SECRET="..."
   ```
5. **Mode développement** : tant que l'app n'est pas passée en App Review, seuls les comptes ayant un rôle sur l'app (admin, développeur, testeur — à ajouter dans Rôles de l'app) peuvent se connecter. Suffisant pour tester vous-même et avec vos 5 entreprises pilotes *si vous les ajoutez comme testeurs*.
6. **Pour publier réellement sur Instagram/Facebook au nom d'un vrai client externe** (pas juste vous) : demander en **App Review** les permissions `pages_manage_posts` et `instagram_content_publish` (menu *Vérification de l'app → Autorisations et fonctionnalités*). Il faut fournir :
   - Une démonstration vidéo du flux d'usage réel dans BienDecider.
   - Une politique de confidentialité publique (URL).
   - Une justification métier claire de l'usage de chaque permission.
   - Compter plusieurs jours à plusieurs semaines de délai, et un refus possible si le dossier est incomplet.
7. Le compte Instagram du client doit être un **compte professionnel ou créateur**, lié à une Page Facebook — sinon `instagram_content_publish` échoue même une fois l'app validée.

## Ce que je peux faire dès que vous avez les identifiants

Les variables rendent le démarrage OAuth disponible ; elles ne suffisent pas à finaliser l'intégration. Le callback Meta enregistre aujourd'hui le même jeton pour Facebook et Instagram **sans vérifier la Page ni le compte Instagram associé**. Il reste à découvrir et sélectionner les ressources de chaque entreprise, vérifier les permissions effectivement accordées, sécuriser et renouveler les jetons, gérer la révocation et implémenter l'exécution validée avant un dossier App Review.

Le stockage actuel des tokens est en clair dans les champs de la base (pas de chiffrement applicatif), sans renouvellement automatique ni déconnexion applicative. `/connexions` distingue maintenant autorisation enregistrée, expirée et erreur, sans prétendre confirmer une fiche ou une Page. Ces limites sont des tâches prioritaires, pas des fonctionnalités livrées.

Pour les scopes Meta, vérifier le nom exact et les dépendances dans la documentation du flux choisi : le code utilise actuellement `instagram_content_publish`, alors que la documentation App Review actuelle mentionne `instagram_content_publishing`. Confirmer le contrat de la version Graph cible avant activation ; ne pas mélanger les permissions `instagram_business_*` d'Instagram Login avec Facebook Login.
