# Garde-fou de qualité

Atelier existe pour accélérer sans dégrader. La règle centrale est simple : **une tâche
n'est terminée que si sa livraison est prouvée et documentée**. Les sous-agents peuvent
échouer, se tromper ou s'arrêter ; le registre, lui, ne peut pas déclarer terminé ce qui
ne l'est pas.

## Les cinq conditions de `done`

`node .atelier/bin/atelier.mjs done <ID>` refuse la clôture si l'un de ces éléments
manque :

1. **Au moins un critère d'acceptation, tous cochés.**
2. **Au moins une preuve `pass` enregistrée.** La commande de vérification doit avoir
   été réellement exécutée, pas seulement annoncée.
3. **Au moins un document mis à jour et enregistré** (`README.md`, `CHANGELOG.md`,
   `docs/`, note de base de connaissances).
4. **Un résumé du livrable.**
5. **Des dépendances terminées.**

Le message de refus énumère précisément ce qui manque.

## Ce qu'est une preuve

Une preuve est un triplet :

- la commande exacte exécutée ;
- le résultat observé (`pass`, `fail` ou `info`) ;
- une note courte et factuelle.

```bash
node .atelier/bin/atelier.mjs evidence T-0002 --result pass \
  --command "npm test -- src/features/form" \
  --note "14 tests, 0 échec, 1 fichier"
```

Règles :

- **Exécuter avant d'enregistrer.** Un test non lancé n'est pas une preuve.
- **Enregistrer les échecs.** `--result fail` documente le parcours ; il ne bloque pas
  la clôture si une preuve `pass` ultérieure existe.
- **Une preuve par commande de vérification**, autant que nécessaire.
- **Ne jamais inventer un résultat.** Le journal conserve l'auteur et l'horodatage ; une
  preuve fabriquée est un mensonge traçable.

## Séparation des rôles

| Rôle | Peut | Ne peut pas |
|---|---|---|
| `implementer` | écrire le code, enregistrer preuves et documents, passer en `review` | cocher les critères, terminer la tâche |
| `verifier` | relancer les commandes, cocher les critères, terminer ou rouvrir | modifier le code ou la documentation |
| `planner` | créer des tâches | écrire du code, modifier les tâches existantes |
| `documenter` | écrire la documentation | modifier le code |

L'indépendance du vérificateur est ce qui empêche l'implémenteur de valider son propre
travail. Un vérificateur qui se contente de lire le rapport de l'implémenteur ne remplit
pas son rôle : il doit relancer les contrôles.

## Dérogation tracée

Dans un cas légitime — documentation hors périmètre, critère impossible à automatiser,
urgence — la clôture forcée existe :

```bash
node .atelier/bin/atelier.mjs done T-0007 \
  --force --reason "Critère visuel validé manuellement avec Oely le 2026-10-18"
```

La dérogation :

- exige une raison non vide ;
- écrit `forced: true` et `force_reason` dans la tâche ;
- reste visible dans le journal ;
- produit un **avertissement** dans `doctor`, sans faire échouer le registre.

C'est un choix assumé : la dérogation doit être possible, mais jamais silencieuse.

## `doctor`

À lancer avant de considérer un plan comme sain :

```bash
node .atelier/bin/atelier.mjs doctor
```

Il détecte :

- statuts, priorités ou types inconnus ;
- dépendances absentes ;
- cycles de dépendances ;
- tâches `done` sans résumé, sans preuve `pass`, sans documentation ou avec des critères
  non cochés ;
- dérogations (avertissement) ;
- verrous actifs sur des tâches qui ne sont ni en cours ni en revue.

## Découpage : la première garantie

Un mauvais découpage rend la vérification impossible. Une bonne tâche :

- produit **un livrable observable** ;
- touche **une à trois fichiers** ;
- se termine en **moins d'une heure** ;
- possède **un à trois critères** concrets ;
- possède **au moins une commande** de vérification ;
- déclare ses **dépendances réelles**, sans cycle.

Si une tâche ne peut pas être vérifiée par une commande, son critère doit au moins être
un fait observable et le vérificateur doit l'avoir constaté lui-même.

## Antipatterns

| Antipattern | Pourquoi c'est grave | Correction |
|---|---|---|
| Cocher un critère sans preuve | Le registre ment | Relancer la vérification, enregistrer `pass` ou `fail`. |
| Terminer avec `--force` sans raison utile | La dérogation perd son sens | Raison précise et datée, ou corriger le manque. |
| Tâche de 10 fichiers | Vérification impossible, conflits entre agents | Découper en tâches dépendantes. |
| Vérifier soi-même son code | Biais de confirmation | Passer par `atelier:verifier`. |
| Documenter une fonctionnalité non livrée | Documentation fausse, pire que rien | Documenter après preuve. |
| Modifier les critères pour les faire passer | Déplacement du but | Rouvrir la tâche et corriger le livrable. |
| Laisser un verrou actif | Bloque les autres agents | `release`, ou attendre l'expiration (2 h). |

## Auditer une tâche

```bash
node .atelier/bin/atelier.mjs show T-0003
```

La sortie contient les critères, les preuves, les documents, le résumé, la mention
éventuelle de dérogation et les huit dernières entrées du journal.
