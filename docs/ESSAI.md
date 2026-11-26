# Premier essai de Rigwink

**Statut : Rigwink n'a jamais encore été exécuté dans After Effects.** Ce
premier essai sert précisément à le vérifier. Il a été testé uniquement
contre une simulation logicielle de l'API AE (141 tests), pas dans le vrai
programme.

## Étape 1 — sans rien installer

1. Dans After Effects : menu **After Effects > Settings (ou Preferences) >
   Scripting & Expressions**, coche **"Allow Scripts to Write Files and
   Access Network"**, OK.
2. Menu **File > Scripts > Run Script File...**, choisis
   **Rigwink Run Spec.jsx**, puis le fichier **orbit-text.json**.
3. Une comp "Rigwink — orbit titre" doit apparaître : un titre qui arrive
   en ease, un null "RW Rig", une caméra qui orbite de 90° puis rapproche.

Si ça marche, ça confirme cette brique précise (lecture d'une spec et
construction d'une comp), pas encore tout le moteur : les autres mouvements
et le panneau restent à éprouver.

Ce que tu peux me rapporter (une phrase suffit) : la comp s'est-elle créée ?
La caméra orbite-t-elle autour du titre ou ailleurs ? Un message d'erreur ?

## Étape 2 — le panneau (optionnel)

1. Copie **Rigwink.jsx** dans le dossier AE :
   `Applications/Adobe After Effects <version>/Scripts/ScriptUI Panels/`
2. Redémarre AE, menu **Window > Rigwink.jsx** : le panneau se dock.
3. Il ajoute l'application d'une spec, l'inspection de la comp active et le
   dossier-pont `~/Rigwink-bridge/` pour la boucle avec Claude Code
   (détails dans claude-code-bridge.md, inclus dans ce zip).

## À savoir

- **Cmd+Z** annule toute la construction en un seul pas.
- Rigwink n'est pas encore l'assistant IA complet : sans agent externe qui
  écrit des specs, il applique des specs existantes. La boucle langage
  naturel passe par le pont (étape 2 + Claude Code).
- Tout ce que Rigwink crée est éditable : calques, keyframes, courbes.
