# LinkedIn : connexion du profil personnel

Refs #147 et #148. La Page entreprise (#150, #151, #152) reste en attente : l'association de l'application a la Page ne remplace pas l'approbation Community Management ni ses conditions legales.

## Application et produits

- Application BienDecider : 266613272 ; Client ID public : 781t74u1bqbdb1.
- Page associee : 146728939, association declaree Verified le 13 octobre 2026.
- Produits ajoutes selon les captures : Share on LinkedIn et Sign In with LinkedIn using OpenID Connect.
- Verifier dans Auth que les scopes `openid`, `profile` et `w_member_social` sont accordes. Le connecteur ne demande ni email ni scope organisation.
- URI de retour exacte : `https://www.biendecider.com/api/oauth/linkedin/callback`. Pour une recette sur un autre hote, ajouter son URI complete et demarrer/terminer sur le meme hote. Preferer un domaine stable aux URLs de deploiements ephemeres.

## Variables serveur

Dans Vercel > bien-decider > Settings > Environment Variables > Production :

```text
LINKEDIN_CLIENT_ID
LINKEDIN_CLIENT_SECRET
LINKEDIN_TOKEN_ENCRYPTION_KEY
```

Le secret appartient au meme client que le Client ID. La cle de chiffrement LinkedIn est dediee : 32 octets aleatoires encodes en 64 caracteres hexadecimaux. La generer dans un terminal prive et la saisir directement dans Vercel, sans message, capture ou commit :

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Ne pas reutiliser ou changer `OAUTH_TOKEN_ENCRYPTION_KEY` de Gmail. Conserver les secrets dans un gestionnaire adapte. Redeployer apres configuration des variables et appliquer la migration versionnee par le deploiement habituel. Le bouton LinkedIn reste indisponible si une variable requise manque.

## Fonctionnement et limites

OAuth serveur avec state aleatoire, cookie HTTP-only, demande serveur liee a l'entreprise, au cookie de session et au callback, valable dix minutes. Une nouvelle demande remplace la demande precedente pour cette entreprise. Les demandes expirees sont nettoyees au demarrage d'un nouveau flux ; elles ne contiennent aucun jeton fournisseur.

Le callback controle la signature OIDC RS256, issuer, audience, expiration, age et nonce avec jose et les cles officielles LinkedIn. Le sujet de userinfo doit correspondre au token d'identite. Les permissions requises doivent etre presentes dans la reponse OAuth. Le resultat est chiffre AES-256-GCM, avec authentification liee a `linkedin:<companyId>`. Seuls nom, etat et expiration sont transmis a l'interface.

Le state est consomme atomiquement avec la sauvegarde de la connexion. Deux callbacks ne peuvent pas enregistrer deux resultats ; une deconnexion invalide les demandes en attente. Une erreur ou un refus conserve la connexion precedente. Une reautorisation reussie remplace entierement l'identite et les jetons precedents, jamais un refresh token d'un autre compte.

L'expiration vient de `expires_in`. Aucun renouvellement programmatique n'est presume : LinkedIn le reserve a certaines applications. Cette livraison utilise la reautorisation, sans conserver de refresh token.

Le retrait efface localement les jetons et les demandes en attente. Il ne pretend pas revoquer l'autorisation chez LinkedIn : l'utilisateur doit aussi retirer BienDecider dans Preferences et confidentialite > Confidentialite des donnees > Autres applications (libelles susceptibles de varier).

Aucune publication personnelle ou Page, aucun message, scraping, commentaire ou action autonome dans #148. Le scope de publication prepare #149 ; aucune route de publication n'est ajoutee.

## Rotation et retour arriere

Pour changer le Client Secret, creer le remplacement chez LinkedIn, mettre a jour Vercel, redeployer puis retirer l'ancien secret. Ne pas publier les valeurs.

Pour changer la cle de chiffrement, ne jamais l'ecraser tant que des connexions LinkedIn sont utilisees. Dans un environnement controle, suspendre le connecteur, retirer les connexions LinkedIn via l'application ou migrer les enveloppes par entreprise avec ancienne et nouvelle cle dans un outil prive, puis remplacer la variable, redeployer et faire reautoriser les profils. Le choix simple du pilote est retrait puis reautorisation ; aucune migration en clair de jetons. Ne pas changer les connexions Gmail.

La migration SQL est additive. Un retour arriere du code peut laisser la table de demandes en place ; aucun retour arriere destructif automatise.

## Verification

`npm run test:linkedin` couvre signatures et claims invalides, absence d'email, scopes incomplets, incoherence d'identite, chiffrement/alteration/isolation, routes et retrait local avec base jetable. Les fetch fournisseur sont simules et les identifiants CI sont fictifs. Aucun test ne doit ecrire sur Production.

Recette manuelle : autoriser un profil pilote choisi, verifier le nom et l'expiration, recharger, annuler une reautorisation, verifier la conservation du profil precedent, retirer localement et chez LinkedIn puis reautoriser. Ne pas envoyer de code OAuth, token ou secret dans l'Issue. Relever seulement les etats et le resultat.

Sources : [OAuth](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow), [OIDC](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2), [Community Management](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review).