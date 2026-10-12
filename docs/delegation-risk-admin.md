# Réglages administrateur des risques

## Ce que règle l'écran

Dans **Administration > Configurer les risques** (`/admin/risques`), un administrateur explicitement autorisé choisit un niveau pour chaque type d'action :

- **Faible** : action interne et réversible.
- **Modéré** : données de tiers ou impact limité.
- **Élevé** : exposition publique, communication externe, dépense engagée ou action difficile à annuler.

Le réglage est global à BienDecider : il s'applique à toutes les entreprises. Il classe le type d'action ; ce n'est pas le choix du niveau de délégation du dirigeant. Le mode effectif reste **Accompagner**, et aucune exécution automatique n'est activée.

## Plancher de sécurité

La règle de base est calculée en code à partir du type et de facteurs explicites. Le niveau administrateur peut **relever** le risque mais pas faire passer une action sous son plancher :

- exposition publique, communication externe, dépense ou irréversibilité : au minimum **Élevé** ;
- données d'une organisation tierce : au minimum **Modéré** ;
- type inconnu : **Élevé**.

Les options inférieures au plancher sont désactivées dans le sélecteur et refusées par l'API. Par exemple, « Faible » ne peut pas être choisi pour un email ou une publication. Les fondateurs doivent approuver la politique d'action (US #35) avant tout futur mode Déléguer. Le sélecteur ne contourne jamais la validation humaine actuelle.

## Autoriser les administrateurs

Les contrôles généraux `/admin` restent ouverts par défaut au prototype historique. Le panneau des risques, parce qu'il modifie une règle globale d'exécution, exige une liste explicite :

1. Ajouter les adresses des administrateurs dans `ADMIN_EMAILS`, séparées par des virgules, dans l'environnement Vercel Production.
2. Déployer, se reconnecter avec une adresse de cette liste et ouvrir `/admin/risques`.
3. Les autres utilisateurs voient que le réglage est réservé ; les API répondent 403 même s'ils tentent de les appeler directement.

Ne pas ouvrir ce réglage à tous les comptes connectés.

## État de la migration

`DelegationRiskSetting` est présente dans le schéma versionné et sa migration a été appliquée à la base prototype le 2026-10-11. Le baseline `0_init` y a été enregistré puis `migrate deploy` a créé la table et son index unique ; le diff final a indiqué qu'aucune différence ne restait. **Ne pas utiliser `prisma db push` et ne pas relancer `migrate resolve --applied 0_init`.**

La sauvegarde automatique n'était pas disponible sur le forfait de base ; le propriétaire a choisi d'accepter ce risque pour l'opération initiale. Avant une prochaine migration destructive, obtenir une vraie sauvegarde ou décider explicitement de ne pas poursuivre.

Pour vérifier l'état actuel sans modification, utiliser depuis une révision à jour `npx prisma migrate status` puis `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. La `DATABASE_URL` doit rester dans le terminal privé, jamais dans GitHub ou le chat.

Recharger `/admin/risques`, enregistrer un niveau permis avec un compte listé dans `ADMIN_EMAILS`, recharger pour confirmer la persistance, puis ouvrir une proposition comme utilisateur pour vérifier le niveau effectif. La table manquante ne doit plus être traitée par `db push`.

Le lecteur de risque se replie sur les règles déterministes s'il ne peut pas lire la table. La mutation admin, elle, ne prétend pas réussir si la table manque.

## Traçabilité et contrôle

Chaque enregistrement conserve le type, la valeur choisie, l'adresse admin et l'heure de mise à jour. Les décisions restent éditables dans l'interface ; les Issues et les PR consignent les changements produit et les migrations, pas de secrets.

Vérification locale sans base : `npm run test:delegation`. Avant toute mise en production du mode Déléguer, ajouter les permissions/modes par entreprise, auditer les gardeurs de **tous** les connecteurs et faire valider la politique par les deux fondateurs. Actuellement, seuls publication du site et Gmail passent par un garde d'exécution ; Google et Meta ne publient pas.