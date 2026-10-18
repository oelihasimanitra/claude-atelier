---
name: learn
description: Consigne dans la base de connaissances Atelier une décision, une convention, un piège ou une connaissance durable issue de la conversation. Utiliser quand l'utilisateur demande de retenir, documenter une décision ou capitaliser sur ce qui vient d'être appris.
when_to_use: "retiens ça, note cette décision, documente ce choix, garde cette convention, capitalise, ajoute à la base de connaissances"
argument-hint: "[sujet à consigner]"
allowed-tools: Read, Grep, Glob, Bash, Write
---

Sujet : **$ARGUMENTS** (si vide, identifie toi-même la connaissance durable la plus
utile de la conversation).

## 1. Choisir quoi consigner

Ne consigne que ce qui restera vrai après la session :

- une décision d'architecture ou un compromis, avec sa raison ;
- une convention de code ou d'outillage ;
- un piège réellement rencontré, avec sa cause racine ;
- un fait externe vérifié (API, tarif, limite).

Ne consigne pas : l'état transitoire des tâches, ce que le dépôt documente déjà, une
supposition non vérifiée, ni aucun secret, jeton ou donnée personnelle.

## 2. Vérifier les doublons

```bash
node .atelier/bin/atelier.mjs kb search "<mots-clés>"
```

Si une note proche existe, mets-la à jour plutôt que d'en créer une seconde.

## 3. Écrire

Rédige la note dans `.atelier/tmp/kb-note.md` avec l'outil Write, au format :

```markdown
# <titre>

## Décision / constat
...

## Raison
...

## Conséquences
...

## Sources
- fichier:ligne ou URL
```

Puis :

```bash
node .atelier/bin/atelier.mjs kb add "<titre>" \
  --kind <decision|note|research> \
  --tags <tag1,tag2> \
  --file .atelier/tmp/kb-note.md
```

Utilise `--kind decision` pour un choix durable (ADR), `note` pour une convention ou un
piège, `research` pour une enquête. Ajoute `--task <ID>` si la connaissance est liée à
une tâche précise.

## 4. Répondre

Indique le chemin du fichier créé, le type et les tags, en trois lignes maximum.
