---
name: status
description: Affiche l'état du projet Atelier — progression, tâches en cours, prêtes, en revue et bloquées. Utiliser quand l'utilisateur demande où en est le projet, l'avancement, le tableau de bord ou ce qu'il reste à faire.
when_to_use: "où en est le projet, avancement, tableau de bord, qu'est-ce qui reste, état des tâches, prochaine action"
argument-hint: ""
allowed-tools: Bash, Read
---

Affiche l'état du registre sans rien modifier.

```bash
node .atelier/bin/atelier.mjs status
```

Puis résume en **huit lignes maximum** :

1. progression (`faites/total`, pourcentage) ;
2. tâches en cours et leur agent ;
3. tâches en revue ;
4. tâches prêtes, avec leur priorité ;
5. tâches bloquées et la raison ;
6. prochaine action concrète (souvent `/atelier:work` ou la levée d'un blocage).

Si le registre n'existe pas, dis-le et propose `/atelier:init`. Ne crée, ne modifie et
ne termine aucune tâche dans cette commande.
