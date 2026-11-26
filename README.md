# Rigwink

Prototype d'assistant motion design pour After Effects : une consigne en
langage naturel devient une spec JSON (via un agent externe, ex. Claude Code,
sans coût API) qu'un script AE applique en vrais calques, keyframes et rig
caméra éditables.

**Statut honnête : prototype, jamais encore exécuté dans After Effects.**
141 tests Node valident la cohérence des appels API contre un mock du DOM AE,
pas le rendu réel. Première étape = essai dans AE (voir docs/ESSAI.md).

## Contenu

- `dist/Rigwink.jsx` — panneau ScriptUI dockable (un seul fichier, tout inclus)
- `dist/Rigwink Run Spec.jsx` — applique une spec JSON sans installer le panneau
- `examples/orbit-text.json` — spec d'exemple prête à l'emploi
- `docs/ESSAI.md` — mode d'emploi du premier essai
- `docs/SPEC.md` — format de la spec, mouvements, règles, limites connues
- `docs/claude-code-bridge.md` — boucle consigne <-> spec par dossier-pont
- `src/`, `test/`, `build.js` — modules, suite de 141 tests, assemblage des bundles

## Sécurité

La spec JSON est parsée strictement (RWJSON), jamais via eval : un fichier
spec ne peut pas exécuter de code.
