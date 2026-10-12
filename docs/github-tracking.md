# Repartir le travail avec GitHub Issues

## Une source de verite

Le suivi courant est dans [les Issues BienDecider](https://github.com/groupebienoubien/BienDecider/issues), pas dans deux listes de cases a maintenir en parallele. [backlog.md](backlog.md) conserve le contexte, les decisions et l'historique des livraisons. Les anciens elements livres ne sont pas recrees comme des US ouvertes.

Chaque US contient le besoin utilisateur, des criteres d'acceptation, les dependances, la verification et le perimetre. Une US = un resultat livrable ; si elle est trop grosse, la decouper avant de la prendre.

## Vues utiles sans outil supplementaire

- [US ouvertes](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Atype%3Aus).
- [Sans responsable](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Atype%3Aus%20no%3Aassignee).
- [Pretes a prendre](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Aready).
- [Mon travail](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20assignee%3A%40me).
- [A relire](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Areview).
- [Bloquees](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Astatus%3Ablocked).
- [P0](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Apriority%3Ap0).
- [Délégation P1](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Adomaine%3Adelegation%20label%3Apriority%3Ap1).
- [Relectures differees, PR ouvertes ou fermees](https://github.com/groupebienoubien/BienDecider/pulls?q=is%3Apr%20label%3Areview-deferred).

Pas de GitHub Project obligatoire : les Issues et les filtres suffisent a deux. Un tableau Project pourra etre ajoute plus tard sans dupliquer les US.

## Statuts et priorites

| Label | Signification |
|---|---|
| `status:backlog` | A prioriser, preciser ou debloquer avant de commencer |
| `status:ready` | Criteres clairs, dependances levees, travail disponible |
| `status:in-progress` | Un responsable travaille dessus |
| `status:review` | PR ouverte pour validation |
| `status:blocked` | Attente explicite, avec raison et prochaine action dans un commentaire |
| Issue fermee | Livree ; la recette/deploiement est confirme ou l'Issue sera rouverte en cas d'echec |
| `priority:p0` | Bloquant avant ouverture externe, notamment securite/conformite |
| `priority:p1` | Prochain travail prioritaire |
| `priority:p2` | Plus tard, ne pas prendre avant les priorites convenues |
| `priority:p3` | Non planifie, garde pour memoire |
| `area:dev` / `area:external` | Code ou demarche console/fournisseur/CEO |
| `domaine:*` | Un des douze domaines fonctionnels, decrits dans [domaines.md](domaines.md) |

Focus produit du 2026-10-10 : **délégation P1**, avec décision fondatrice #35 en premier ; voir l'ordre et les dépendances dans [domaines.md](domaines.md#focus-actuel--délégation-p1). Les trois P2 de ce domaine restent hors focus.

La première tranche de l'US #39 est livrée : classification statique et affichage du risque ; l'Issue passe en cours jusqu'à validation des règles complètes et de leur application serveur au futur mode Déléguer. Voir la tranche et ses limites dans [domaines.md](domaines.md#tranche-del-5-livrée-le-2026-10-10).

Réglages admin dynamiques (P1) : procédure de rôle explicite, table et déploiement du schéma dans [delegation-risk-admin.md](delegation-risk-admin.md). Ce réglage global ne lève pas la validation humaine et ne remplace pas la décision fondatrice #35.

**Un seul label `status:*` par Issue ouverte.** Retirer l'ancien en changeant d'etape. Les priorites et le statut initial de l'import sont un point de depart, a ajuster ensemble. Une date d'eligibilite fournisseur ne doit pas etre inventee.

## Routine quotidienne a deux

### Répartition sans fichiers partagés

Répartition de départ à confirmer ensemble, avec un seul pilote par Issue :

| Responsable | Prend en charge | Propriété de fichiers habituelle |
|---|---|---|
| RemiJolivalt (Remi) | Décisions produit, UX, contenu/documentation produit, démarches externes et consoles fournisseur (`area:external`) | `src/app/` hors `src/app/api/`, `src/components/`, styles, pages et docs produit |
| samirt-hue (Samir) | Implémentation API/backend, sécurité, connecteurs, base, CI/CD et déploiement (`area:dev` technique) | `src/app/api/`, `src/lib/`, `prisma/`, `scripts/`, `.github/`, configuration de déploiement |

Une US transverse reçoit un pilote unique qui possède l'Issue et la PR ; l'autre n'ouvre pas de changement concurrent sur les mêmes fichiers. Si le travail peut réellement être séparé, découper en deux Issues/PR avec un contrat d'API ou d'interface convenu avant le codage. Pour les fichiers de [CODEOWNERS](../.github/CODEOWNERS), le propriétaire non-auteur relit et approuve toujours. Ne pas déduire une assignation uniquement du tableau : confirmer la disponibilité puis renseigner **Assignees** sur l'Issue.

Le filtre [US ouvertes sans responsable](https://github.com/groupebienoubien/BienDecider/issues?q=is%3Aissue%20is%3Aopen%20label%3Atype%3Aus%20no%3Aassignee) permet de faire le tri. Les US `backlog` ne sont pas toutes à assigner immédiatement : attribuer le propriétaire quand une US P0/P1 passe à `ready` et avant `in-progress`. Ne jamais laisser une US `in-progress` sans responsable.

1. Choisir ensemble les deux prochaines US, selon priorite et dependances. Mettre a jour les criteres si necessaire. Chacun commence par une seule US active.
2. Dans **Assignees**, assigner une personne responsable. Ne pas affecter silencieusement une US a l'autre ; confirmer qu'elle est disponible. Un second participant peut etre mentionne dans le corps.
3. Avant de coder, passer a `status:in-progress` et nommer la branche `feat/<numero>-description` ou `fix/<numero>-description`. Pour une demarche externe, le responsable suit la console et note la decision dans l'Issue.
4. Ouvrir la PR vers `main`, ajouter `Closes #numero` si elle livre tous les criteres, sinon `Refs #numero`. Passer l'US a `status:review`, demander la relecture et activer **Auto-merge**. GitHub fusionne en squash uniquement quand l'approbation exigée, `Checks` et les autres protections sont satisfaits ; un push qui invalide l'approbation ou relance les checks suspend la fusion.
5. Apres la fusion, l'auteur confirme Vercel et la recette dans l'Issue ; retirer le label de statut devenu inutile. Si le deploiement ou les criteres echouent, rouvrir et noter le probleme.
6. Si bloque, mettre `status:blocked`, expliquer le blocage, qui peut agir et la prochaine verification. Repasser a ready quand les dependances sont levees ; ce changement n'est pas automatise sur une simple fermeture d'Issue dependante.

Petit point de 10 minutes une fois par semaine : trier P0/P1, revoir les blocages, retirer les US obsoletes avec une raison et traiter les relectures `review-deferred`. Mettre a jour le contexte Markdown seulement quand une decision produit/architecture change.

## Import initial et nouvelles US

Le workflow [Backlog Issues](../.github/workflows/backlog.yml) lit [github-backlog.json](github-backlog.json). Le catalogue initial contenait 18 US de travail restant ; 103 US classees par domaine ont ete ajoutees le 2026-10-10 (voir [domaines.md](domaines.md)) ; l'absence d'approbation fournisseur n'est pas marquee comme une fonctionnalite livree.

L'import s'execute sur `main` quand le catalogue, le script ou son workflow change ; il peut aussi etre relance via **Actions > Backlog Issues > Run workflow**. Il utilise le token natif GitHub Actions avec `issues: write`, aucun PAT ni secret externe. Les PR de branches ne creent pas d'Issues par ce workflow.

Le script recherche un identifiant stable `<!-- biendecider-us:... -->` dans les Issues ouvertes **et fermees**. S'il existe, il ne modifie ni titre, ni corps, ni statut, ni priorite, ni responsable. Conserver cet identifiant dans les US importees. Les dependances des nouvelles US sont liees aux numeros GitHub apres creation. Une interruption peut laisser certaines references sous forme d'identifiants : les completer manuellement sans recreer l'US.

**Pour une nouvelle US ordinaire :** GitHub > Issues > New issue > User story. Choisir le responsable et les labels apres discussion. Le champ Priorite du formulaire ne remplace pas le label `priority:*` : l'ajouter explicitement. Pas besoin de modifier le catalogue pour chaque changement de statut.

**Pour un lot de nouvelles US :** ajouter des entrees avec IDs uniques au catalogue dans une PR ; l'import ne cree que les absentes apres fusion. Ne pas attendre qu'une edition du catalogue synchronise une Issue deja creee : editer cette Issue directement. Les bugs peuvent utiliser une Issue libre avec un titre et des criteres de verification.

## Limites et droits

- Si le workflow n'a pas le droit de creer les Issues, un administrateur doit autoriser GitHub Actions et les permissions demandees, puis relancer. Les logs affichent les liens crees, jamais de secret.
- L'import ne devine pas le login des developpeurs et n'assigne personne automatiquement. Les deux collaborateurs choisissent le responsable dans Assignees ; l'auto-merge n'attribue pas de responsable et ne remplace pas une approbation.
- Aucun statut ne prouve un resultat fournisseur : l'envoi Gmail accepte n'est pas une preuve de livraison, OAuth n'est pas une publication, et une PR fusionnee peut encore echouer au deploiement.
- Le depot est public : aucun secret, donnees client, adresse personnelle de destination ou identifiant de reviewer prive dans les Issues. Partager les acces via le gestionnaire de secrets, pas le ticket.

Tests de l'import sans reseau : `node --test scripts/sync-backlog.test.cjs`. Ces tests sont inclus dans Checks et dans le workflow d'import.