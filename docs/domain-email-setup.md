# BienDecider : domaine OVH, Vercel et contact

Décision du 2026-10-09 : marque BienDecider, URL de référence `https://www.biendecider.com`, contact `contact@biendecider.com`. Depuis le 2026-10-11, le dépôt est `groupebienoubien/BienDecider` et le projet Vercel `bien-decider`.

## Statut

**Vérification du 2026-10-12 : le domaine personnalisé ne passe toujours pas HTTPS.** Les résolveurs publics `1.1.1.1` et `8.8.8.8` renvoient `203.191.35.125` pour `biendecider.com` et `www.biendecider.com`; les deux noms échouent à la validation du certificat (`SEC_E_WRONG_PRINCIPAL`). Le domaine `bien-decider.vercel.app` répond, donc le défaut observé concerne le DNS/certificat du domaine personnalisé. La capture OVH montrait des valeurs nouvelles, mais elles ne sont pas encore publiées par les DNS interrogés. La réception de `contact` et les callbacks OAuth restent à tester séparément.

## 1. Relier le domaine à Vercel

1. Dans Vercel, ouvrir l'équipe **groupe-bienou-bien**, le projet **bien-decider**, puis **Settings > Domains**. Vérifier que `www.biendecider.com` et `biendecider.com` sont tous deux assignés à Production. La carte de chaque nom donne la valeur DNS attendue : utiliser ces valeurs comme source de vérité.
2. Dans la carte Vercel de `biendecider.com`, relever l'A record exact. La capture OVH fournie montre `216.198.79.1`, et cet A est cohérent avec le projet si la carte Vercel affiche bien cette même IP. Le DNS publié répond encore `203.191.35.125`; il faut donc remplacer l'ancien A `@` par `216.198.79.1` après confirmation dans Vercel.
3. Dans la carte Vercel de `www.biendecider.com`, relever le CNAME exact. Dans OVH, supprimer l'enregistrement `A` de `www` et créer à sa place un `CNAME` nommé `www` vers cette cible, avec le point final si OVH le demande. La cible `1a866c5be6c27cb7.vercel-dns-017.com.` montrée pour `*` est une cible de wildcard : **ne l'utiliser pour `www` que si la carte Vercel de `www.biendecider.com` affiche exactement cette même cible**. Ne pas créer l'enregistrement `*` pour corriger `www`.
4. Dans OVHcloud, ouvrir **Web Cloud > Noms de domaine > biendecider.com > Zone DNS**. Modifier uniquement les hôtes web concernés :

	| Sous-domaine OVH | Type | Valeur attendue |
	|---|---|---|
	| `@` (ou champ vide) | `A` | `216.198.79.1`, uniquement si confirmé dans la carte Vercel de l'apex |
	| `www` | `CNAME` | Cible exacte affichée dans la carte Vercel de `www.biendecider.com` |

	Avant d'ajouter le CNAME `www`, supprimer tout `A`, `AAAA`, autre `CNAME` et le TXT `www` associé à l'ancienne redirection OVH (la capture montrait `3|welcome`) : un CNAME ne peut coexister avec aucun autre type d'enregistrement au même nom. Désactiver également toute redirection HTTP OVH encore configurée pour l'apex ou `www`; faire la redirection `biendecider.com` vers `www.biendecider.com` dans **Vercel > Settings > Domains**. Si le TXT `@` `1|www.biendecider.com` est toujours présent et correspond à cette ancienne redirection OVH, le retirer également.
5. Ne pas réinitialiser la zone et ne pas changer les serveurs DNS OVH (`dns111.ovh.net` / `ns111.ovh.net`). **Conserver tous les MX et les TXT email SPF, DKIM et DMARC**, ainsi que les autres enregistrements non liés au web. Ne pas supprimer un TXT sans vérifier son usage.
6. Enregistrer/publier la zone dans OVH. Attendre la propagation, puis vérifier que les deux serveurs autoritaires OVH et `1.1.1.1`/`8.8.8.8` renvoient les nouvelles valeurs. Dans Vercel, attendre **Valid Configuration** et l'émission du certificat HTTPS. Tester enfin `https://www.biendecider.com`, `https://biendecider.com` et une URL avec chemin ; aucun contournement en désactivant la validation TLS.

Vercel gère le certificat et HTTPS. Aucun transfert du domaine hors OVH ni nouvel hébergement OVH n'est nécessaire. Ne pas imposer dans Next.js de redirection globale vers la production : le local et les previews Vercel doivent continuer à fonctionner.

## 2. Recevoir contact dans Gmail

La destination est le Gmail personnel communiqué par le propriétaire ; elle n'est volontairement pas enregistrée dans ce dépôt public.

1. Dans OVHcloud, ouvrir **Web Cloud > MX Plan**, sélectionner le service lié à **biendecider.com** et vérifier sa technologie dans **Informations générales**.
2. Pour **MX Plan Roundcube / OWA / Redirect**, ouvrir **Emails > Gestion des redirections > Ajouter une redirection**.
3. Source : **contact@biendecider.com**. Destination : **le Gmail indiqué par le propriétaire**. Pour un simple transfert, choisir **Ne pas conserver de copie du mail**, puis valider. Choisir une copie locale seulement si une vraie boîte OVH existe et que sa conservation est souhaitée.
4. Si aucun service email n'est attaché au domaine, vérifier l'offre gratuite **Redirect** (OVH indique qu'elle est disponible pour les domaines sans offre email). Ne commander une boîte payante que si elle est réellement nécessaire.
5. Si l'offre utilise **Zimbra**, créer/ouvrir la boîte et configurer le transfert dans les paramètres du webmail selon le guide OVH. Les menus diffèrent selon l'offre ; ne pas appliquer la procédure MX Plan à une offre Zimbra dédiée.
6. Préserver les MX de l'offre utilisée. Envoyer un message test depuis **une autre adresse que le Gmail destinataire**, vérifier réception et spam, et contrôler qu'il n'y a ni boucle ni erreur de livraison. Tester aussi avec un second expéditeur.

Ce transfert ne donne pas la capacité de répondre en tant que `contact@biendecider.com`. Pour cela, il faut une boîte/fournisseur SMTP autorisé puis configurer **Envoyer des emails en tant que** dans Gmail et valider SPF/DKIM/DMARC avec ce fournisseur. Sans ce réglage, les réponses partent du Gmail personnel. Ne jamais ajouter un deuxième SPF concurrent ni communiquer de mot de passe à un agent.

La réception du contact est indépendante du fournisseur d'envoi des rapports et de la prospection : le transfert ne débloque aucune de ces fonctionnalités applicatives.

## 3. Adapter Google et Meta

- Nom de l'application : **BienDecider** ; email de support : `contact@biendecider.com` une fois sa réception confirmée.
- Domaine autorisé : `biendecider.com` ; accueil : `https://www.biendecider.com`.
- Confidentialité : `https://www.biendecider.com/confidentialite` ; CGU : `https://www.biendecider.com/cgu` (toujours des brouillons à valider juridiquement).
- Google callback : `https://www.biendecider.com/api/oauth/google/callback`.
- Meta callback : `https://www.biendecider.com/api/oauth/meta/callback`.
- Conserver les callbacks locaux pour le développement. Les URI doivent correspondre exactement à l'origine utilisée ; ne pas commencer un flux sur le domaine nu si son callback n'est pas autorisé. Voir [oauth-setup.md](oauth-setup.md).

Les sessions existantes sur `vercel.app` ne sont pas transférables au nouveau domaine : chaque utilisateur se reconnecte avec son compte existant. Ne changer ni les mots de passe ni `SESSION_SECRET` pour cette bascule.

## 4. Recette avant annonce

- [ ] `http://www.biendecider.com` aboutit en HTTPS ; domaine nu redirigé vers www, chemins conservés.
- [ ] Landing et login affichent BienDecider ; titre navigateur et langue française corrects.
- [ ] Connexion avec un compte existant ; données et plan conservés.
- [ ] Connexions OAuth : callbacks et autorisations corrects si les providers sont actifs.
- [ ] Site publié accessible sous `/site/<slug>` sur le nouveau domaine.
- [ ] `contact@biendecider.com` reçu dans le Gmail depuis deux expéditeurs distincts.
- [ ] Mentions légales complétées, confidentialité revue et `ADMIN_EMAILS` restreint avant ouverture publique.

## Références officielles

- [Vercel : ajouter et configurer un domaine](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
- [OVHcloud : alias et redirections email](https://docs.ovhcloud.com/fr/guides/web-cloud/email-and-collaborative-solutions/common-email-features/feature-redirections).