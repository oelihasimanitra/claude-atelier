# Manuel d'utilisation

Ce manuel décrit la façon de travailler avec Atelier au quotidien : planifier, exécuter,
vérifier, documenter et reprendre. Il suppose le plugin installé ; sinon, commencez par
[QUICKSTART.md](QUICKSTART.md).

## 1. Les concepts en cinq minutes

### Le registre

Chaque projet possède un dossier `.atelier/`, versionné avec le code. Il contient les
tâches, le plan lisible, les notes de connaissance et les preuves. Il n'y a ni serveur,
ni compte, ni synchronisation : le registre voyage avec le dépôt Git.

### La tâche

Une tâche est un livrable petit et vérifiable :

- un titre à l'impératif ;
- un type (`task`, `bug`, `ticket`, `research`, `docs`, `chore`) ;
- une priorité (`P0` à `P3`) et une épopée facultative ;
- des **critères d'acceptation** observables ;
- une ou plusieurs **commandes de vérification** ;
- des **dépendances** explicites.

### Les trois preuves

Une tâche ne se termine pas sur une déclaration, mais sur trois traces :

1. **critères cochés** — chacun a été constaté ;
2. **preuve d'exécution** — la commande a réellement tourné, avec son résultat ;
3. **documentation enregistrée** — le document concerné a été mis à jour.

S'y ajoutent un résumé du livrable et des dépendances terminées.

### Les rôles

| Qui | Fait | Ne fait pas |
|---|---|---|
| Vous | donne l'objectif, arbitre, débloque | — |
| Agent principal | orchestre, garde le contexte mince | ne code pas chaque tâche lui-même |
| `planner` | découpe en tâches | n'écrit pas de code |
| `implementer` | exécute **une** tâche, prouve, documente | ne termine pas la tâche |
| `verifier` | relance les contrôles, termine ou rouvre | ne modifie pas le code |
| `researcher` | enquête et écrit une note sourcée | ne modifie pas le code |
| `documenter` | aligne la documentation | ne modifie pas le code |

### Les statuts

```text
todo → in_progress → review → done
         │              │
         ├─ blocked ────┤
         └─ dropped     └─ reopen → in_progress
```

## 2. Installer et activer

L'installation au niveau **user** rend Atelier disponible dans tous les projets :

```bash
cd ~/Documents/claude-atelier
./install.sh            # macOS, Linux, Git Bash
powershell -ExecutionPolicy Bypass -File .\install.ps1   # Windows
```

Redémarrez Claude Code. Vérifiez avec `claude plugin details atelier` : 9 skills,
5 agents, 2 hooks. Détails et dépannage : [INSTALL.md](INSTALL.md).

Pour désactiver Atelier dans un projet sans le désinstaller :

```bash
claude plugin disable atelier --scope project
```

## 3. Démarrer un projet

### Nouveau projet

```bash
mkdir ~/projets/cafe-app && cd ~/projets/cafe-app
git init -b main
claude
```

```text
/atelier:init Café App
/atelier:plan Créer la page d'accueil et le formulaire de commande
```

### Projet existant

Ouvrez Claude Code à la racine du dépôt et lancez `/atelier:init`. Atelier détecte :

- les commandes de vérification (`npm run check`, `npm test`, `cargo test`, `pytest`) ;
- la documentation présente (`README.md`, `docs/`, `CHANGELOG.md`, `CONTRIBUTING.md`) ;
- le nom du projet (`package.json` ou nom du dossier).

`init` ne modifie aucun fichier du projet : il ne crée que `.atelier/`. Il est
idempotent et rafraîchit la copie locale du CLI si vous le relancez après une mise à
jour.

### Sous-dossier et monorepo

Par défaut, le registre est créé à la **racine Git**. Lancer `init` depuis un
sous-dossier place donc le registre à la racine du dépôt, ce qui est le comportement
attendu dans un monorepo.

Pour forcer un autre emplacement :

```bash
node .atelier/bin/atelier.mjs init --root ~/projets/mon-app --name "Mon App"
```

## 4. Planifier

```text
/atelier:plan <objectif>
```

Le skill délègue à `atelier:planner`. Le planificateur lit `CLAUDE.md`, le README, les
manifestes, les documents d'architecture et l'état Git, puis crée les tâches avec le
CLI. Il ne code pas.

### Ce qui fait une bonne tâche

| Critère | Bon | Mauvais |
|---|---|---|
| Taille | 1 à 3 fichiers, moins d'une heure | « Refondre l'authentification » |
| Critère | « Un courriel invalide affiche un message » | « Corriger le formulaire » |
| Vérification | `npm test -- formulaire` | aucun contrôle |
| Dépendances | explicites, sans cycle | implicites |
| Parallélisme | tâches indépendantes | tout en chaîne |

Le planificateur plafonne à **12 nouvelles tâches par passe**. Pour un projet plus
vaste, planifiez la première étape, exécutez-la, puis replanifiez.

### Ce que vous recevez

Un résumé de quinze lignes : identifiants et titres par épopée, chemin critique, nombre
de tâches parallélisables, risques, prochaine commande. Le plan complet est dans
`.atelier/plan.md`.

### Ajouter une tâche à la main

```bash
node .atelier/bin/atelier.mjs new "Ajouter le bouton d'annulation" \
  --priority P2 --epic E-02 \
  --accept "Le bouton annule la commande en cours" \
  --verify "npm test -- annulation" \
  --depends T-0004
```

## 5. La boucle de travail

### Voir l'état

```text
/atelier:status
```

ou :

```bash
node .atelier/bin/atelier.mjs status
node .atelier/bin/atelier.mjs status --line
node .atelier/bin/atelier.mjs status --json
```

Le tableau de bord affiche la progression, les tâches en cours avec leur agent, les
tâches en revue, les tâches prêtes et les blocages.

### Exécuter une vague

```text
/atelier:work
/atelier:work 2              # deux tâches au maximum
/atelier:work T-0003 T-0004  # uniquement ces tâches, si elles sont prêtes
```

Déroulement :

1. lecture de `status --json` et `next --limit 8 --json` ;
2. sélection de tâches **indépendantes** (aucune dépendance commune, aucun fichier
   commun en cas de doute) ;
3. réservation de chaque tâche (`claim`) ;
4. lancement d'un `implementer` par tâche, en parallèle ;
5. chaque implémenteur code, teste, enregistre preuves et documentation, puis passe en
   `review` ;
6. lancement d'un `verifier` par tâche, en parallèle ;
7. chaque vérificateur relance les contrôles et termine ou rouvre ;
8. un `documenter` pour la vague ;
9. `render`, puis rapport.

Par défaut : **3 tâches en parallèle**, **5 au maximum**. Une tâche = un agent.

### Répéter

Après une vague, relancez `/atelier:status`. Les tâches prêtes apparaissent ; relancez
`/atelier:work` jusqu'à ce que le plan soit terminé. Les tâches rouvertes repartent en
`in_progress` et seront reprises à la vague suivante.

### Travailler une seule tâche

Pour une vérification ciblée : `/atelier:verify T-0007`. Pour suivre une tâche à la
main, utilisez le CLI :

```bash
node .atelier/bin/atelier.mjs show T-0007
node .atelier/bin/atelier.mjs claim T-0007 --agent moi
# ... travail ...
node .atelier/bin/atelier.mjs review T-0007 --summary "..."
node .atelier/bin/atelier.mjs accept T-0007 --all
node .atelier/bin/atelier.mjs evidence T-0007 --result pass --command "npm test" --note "18 tests"
node .atelier/bin/atelier.mjs doc T-0007 --path README.md --note "section ajoutée"
node .atelier/bin/atelier.mjs done T-0007 --summary "..."
```

En équipe d'un seul agent, vous pouvez cumuler les rôles. La séparation reste
recommandée : elle évite de valider son propre travail sans le relire.

## 6. Tickets et bugs

```text
/atelier:ticket Le bouton de paiement reste grisé (défaut reproductible)
/atelier:ticket Ajouter l'export CSV des commandes
```

Le skill qualifie l'entrée et distingue :

- un **bug** : comportement observé contraire au comportement attendu ;
- un **ticket** : demande, amélioration, tâche de support.

Sévérités : `critical` et `blocker` → `P0`, `high` → `P1`, `medium` → `P2`,
`low` → `P3`.

Un bug sans sévérité est `P1` ; un ticket sans sévérité est `P2`.

En ligne de commande :

```bash
node .atelier/bin/atelier.mjs bug "Le bouton reste grisé" --severity high \
  --accept "Le bouton s'active quand le panier est non vide" \
  --verify "npm test -- panier"
```

Un ticket ou un bug suit exactement la même boucle qu'une tâche : critères, preuve,
documentation, vérification indépendante.

## 7. Recherche

```text
/atelier:research Quelle stratégie de cache pour les images générées ?
```

Le skill découpe la question en **2 à 4 axes**, lance un `researcher` par axe en
parallèle, puis synthétise. Chaque chercheur :

- vérifie dans le dépôt puis dans des sources primaires ;
- cite les chemins (`fichier:ligne`) ou les URL ;
- distingue faits, hypothèses et incertitudes ;
- écrit une note de type `research` dans `.atelier/kb/`.

La synthèse est enregistrée comme note, puis seules les conclusions qui demandent un
changement concret deviennent des tâches. Une curiosité ne crée pas de tâche.

## 8. Base de connaissances

Trois types :

| Type | Usage | Emplacement |
|---|---|---|
| `note` | convention, piège, mode d'emploi | `.atelier/kb/notes/` |
| `decision` | choix durable, ADR | `.atelier/kb/decisions/` |
| `research` | enquête sourcée | `.atelier/kb/notes/` |

Créer une note :

```bash
printf '# Convention\n\nLes messages utilisateur passent par i18n.\n' | \
  node .atelier/bin/atelier.mjs kb add "Messages et i18n" \
    --kind note --tags convention,i18n --stdin
```

Créer une décision :

```bash
node .atelier/bin/atelier.mjs kb add "Choisir SQLite pour le cache" \
  --kind decision --tags base-de-donnees --text "Contexte, options, décision, conséquences."
```

Consulter :

```bash
node .atelier/bin/atelier.mjs kb list
node .atelier/bin/atelier.mjs kb list --kind decision
node .atelier/bin/atelier.mjs kb list --tag i18n
node .atelier/bin/atelier.mjs kb search i18n
```

Le skill `/atelier:learn` sert à consigner une connaissance durable pendant le travail :
il vérifie les doublons, écrit la note et l'indexe. À utiliser quand une décision risque
d'être oubliée, pas pour résumer une session.

## 9. Parallélisme et contexte

Atelier est conçu pour que l'agent principal ne porte pas les détails :

- le planificateur ne rend qu'un résumé ;
- chaque implémenteur ne voit qu'une tâche ;
- chaque vérificateur ne voit qu'une tâche et son diff ;
- le documenteur travaille sur la vague, pas sur l'historique complet.

Conséquences pratiques :

- **3 tâches en parallèle** est le bon défaut ; au-delà de 5, la coordination coûte plus
  qu'elle ne rapporte ;
- choisissez des tâches sans fichiers communs ;
- si deux tâches se disputent un fichier, sérialisez-les avec `--depends` ;
- ne demandez pas à l'agent principal de relire tous les fichiers : le registre et les
  rapports suffisent.

## 10. Blocages, reprises et dérogations

### Bloquer

Quand une tâche ne peut pas avancer :

```bash
node .atelier/bin/atelier.mjs block T-0005 --reason "Décision produit attendue"
```

Le verrou est libéré, la raison est enregistrée, la tâche sort des tâches prêtes.
`/atelier:status` l'affiche.

### Débloquer

```bash
node .atelier/bin/atelier.mjs unblock T-0005
```

### Rouvrir

Après un échec de vérification ou une régression :

```bash
node .atelier/bin/atelier.mjs reopen T-0005 --reason "Test de régression en échec"
```

### Abandonner

```bash
node .atelier/bin/atelier.mjs drop T-0005 --reason "Obsolète après la décision X"
```

### Déroger

Si un critère ne peut pas être automatisé ou si la documentation est hors périmètre :

```bash
node .atelier/bin/atelier.mjs done T-0005 \
  --force --reason "Critère visuel validé manuellement le 2026-10-18"
```

La dérogation est enregistrée dans la tâche et signalée par `doctor`. Elle ne doit
jamais servir à masquer un test en échec. Voir [QUALITY.md](QUALITY.md).

## 11. Audit et entretien

```bash
node .atelier/bin/atelier.mjs doctor     # intégrité du registre
node .atelier/bin/atelier.mjs render     # régénère plan.md, status.json, kb/index.md
node .atelier/bin/atelier.mjs show T-0003
```

`doctor` vérifie les statuts, priorités, types, dépendances, cycles et tâches terminées
incomplètes. Il sort en erreur (`1`) si le registre est incohérent.

Le journal d'une tâche conserve les huit dernières actions : création, prise, preuves,
critères, documents, résumé, clôture, dérogation.

## 12. Barre de statut

Le hook `Stop` et chaque commande du CLI écrivent `.atelier/status.json`. Un segment
compact peut afficher :

```text
/cafe-app | ▣ 4/9 · 2 en cours | Claude Sonnet 4.5 | ctx [████░░░░░░] 42%
```

Le câblage du script de barre de statut est décrit dans
[INSTALL.md](INSTALL.md#barre-de-statut). Le plugin ne peut pas modifier lui-même le
`statusLine` principal.

## 13. Bonnes pratiques

1. **Planifiez par petites étapes.** Un plan de 12 tâches est plus utile qu'un plan de
   40 tâches illisibles.
2. **Écrivez des critères observables.** Le vérificateur doit pouvoir trancher sans
   interpréter.
3. **Une commande de vérification par tâche, au minimum.** Sans commande, la preuve
   devient une opinion.
4. **Ne mélangez pas deux tâches dans un agent.** Le périmètre flou produit des diffs
   ingérables.
5. **Documentez dans le même mouvement.** Une fonctionnalité livrée sans documentation
   ne passera pas `done`.
6. **Laissez les preuves échouer.** Un `fail` enregistré est une information ; un
   `pass` inventé est un mensonge.
7. **Relancez `doctor` avant de changer de machine ou de branche.**
8. **Committez le registre avec le code.** `.atelier/` fait partie du projet.

## 14. FAQ

### Le projet n'a aucun test, comment vérifier ?

Choisissez une commande observable : un script de contrôle, un `curl` local, une
compilation, un lint. Si aucun contrôle automatique n'est possible, le critère doit
décrire un fait que le vérificateur peut constater (sortie de commande, fichier produit,
capture). Documentez la limite.

### Une tâche dépasse une heure, que faire ?

Ne la terminez pas telle quelle. Créez des sous-tâches dépendantes et abandonnez ou
réduisez la tâche d'origine avec `drop --reason`. Mieux vaut trois tâches vérifiables
qu'une tâche floue.

### Deux agents ont modifié le même fichier

Le registre ne fusionne pas les changements. Si les deux tâches touchaient le même
fichier, la seconde vague peut produire un conflit Git. Sérialisez avec `--depends` ou
déclarez `--files` pour que le skill `work` évite les collisions.

### Puis-je utiliser Atelier sans Claude Code ?

Oui. `.atelier/bin/atelier.mjs` est autonome ; il ne nécessite que Node 20+. Les skills
et les agents, eux, appartiennent à Claude Code.

### Le registre est-il envoyé quelque part ?

Non. Aucun appel réseau, aucun secret lu, aucun service. Tout est dans `.atelier/`.

### Que se passe-t-il si je change de machine ?

Clonez le dépôt : le registre suit. Relancez `init` pour rafraîchir la copie locale du
CLI, puis `doctor`. `status.json` est régénéré localement, il n'est pas versionné.

### Puis-je avoir plusieurs registres dans un même dépôt ?

Non, par conception. Un dépôt = un registre à sa racine. Pour un monorepo, utilisez les
épopées pour distinguer les paquets.

### Un agent est resté bloqué, le verrou persiste

Un verrou expire au bout de deux heures. Pour libérer immédiatement :

```bash
node .atelier/bin/atelier.mjs release T-0005
```

### Comment repartir d'un plan propre ?

Les tâches ne se suppriment pas : abandonnez-les avec `drop --reason`. L'historique
reste lisible. Pour un nouveau projet, créez un nouveau dépôt ou supprimez `.atelier/`
en connaissance de cause.

## 15. Désinstaller

```bash
claude plugin uninstall atelier@oely-atelier --scope user
claude plugin marketplace remove oely-atelier --scope user
```

Les registres restent dans les projets. Pour les retirer aussi, supprimez `.atelier/`
dans chaque dépôt concerné.
