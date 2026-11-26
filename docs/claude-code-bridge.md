# Pont Claude Code <-> After Effects (v0.4, sans dépense API)

Le panneau n'embarque pas d'IA. Le cerveau est le Claude Code existant de
l'utilisateur (abonnement, pas de coût API).

1. Consigne tapée dans le panneau (onglet CHAT) ->
   `~/Rigwink-bridge/in/consigne-<ts>.json`.
2. Claude Code lit la consigne, génère une spec conforme à docs/SPEC.md.
   ÉCRITURE ATOMIQUE OBLIGATOIRE : écrire d'abord dans
   `~/Rigwink-bridge/out/spec-<ts>.json.tmp`, puis renommer en
   `spec-<ts>.json`. Le panneau ignore les fichiers `.tmp` et une lecture
   pendant l'écriture donnerait un JSON tronqué.
3. "Appliquer la dernière spec du pont" dans le panneau (ou Run Spec en
   fichier). Le moteur construit la comp éditable. Dédoublonnage : une spec
   `spec-<ts>.json` dont le `result-spec-<ts>.json` existe déjà est
   ignorée (la plus récente non traitée est choisie). Conséquence :
   pour RETENTER une spec qui a échoué, l'enregistrer sous un NOUVEAU
   nom (nouveau timestamp) — son ancien result-*.json la marque comme
   traitée et elle serait ignorée.
4. Résultat écrit, succès OU erreur détaillée -> pour une spec du pont,
   `~/Rigwink-bridge/out/result-spec-<ts>.json` (même base que la spec :
   c'est ce qui permet le dédoublonnage) ; pour une spec choisie par le
   dialogue fichier, `result-<ts>.json`. Claude Code le lit et peut
   corriger la spec : aller-retour complet. Les avertissements
   non bloquants (cible inconnue, depths inconnues) sont dans
   `result.warnings`.
5. "Inspecter la comp active" -> état courant en JSON dans in/ pour que
   Claude Code raisonne sur le vrai projet (Partie 8).

Sécurité : la spec est parsée en JSON strict (RWJSON), jamais eval — un
fichier spec ne peut pas exécuter de code. Une éventuelle BOM UTF-8 en
tête est tolérée.

Prérequis AE : préférence "Allow Scripts to Write Files and Access Network"
activée ; le panneau nomme cette préférence si l'écriture échoue.

Installation : UN SEUL fichier généré `dist/Rigwink.jsx` à copier dans
`Scripts/ScriptUI Panels/` (modules inclus, aucun include à résoudre).
`dist/Rigwink Run Spec.jsx` s'utilise via File > Scripts > Run Script File.

Limites v0.x : pas de polling automatique (bouton manuel), pas d'historique,
pas de chat dans le panneau. La boucle repose sur un agent externe lancé
manuellement ; ce n'est pas encore l'intégration IA complète de la phase 2.
Alternative à évaluer sur machine réelle : Claude Code lance le script via
`osascript` (DoScriptFile) et lit le fichier résultat, sans panneau.
