# Rigwink — Motion Engine, spec JSON v0.4

Une consigne ("orbite autour du titre puis rapproche-toi") devient une spec JSON,
générée par un agent externe (Claude Code via le dossier-pont, sans dépense API)
et appliquée dans After Effects par le panneau ou "Rigwink Run Spec".
Tout ce que le moteur crée reste éditable : vrais calques, vrais keyframes, rig null.
Le JSON est parsé strictement (RWJSON), jamais via eval.

```json
{
  "version": 1,
  "comp": { "name": "...", "width": 1920, "height": 1080, "fps": 25, "duration": 8,
            "pixelAspect": 1, "bgColor": [0.03, 0.03, 0.04] },
  "layers": [
    { "type": "text", "name": "Title", "text": "RIGWINK", "fontSize": 180,
      "position": [960, 540, 0], "z": 0,
      "animate": [
        { "property": "Opacity", "t0": 0, "t1": 1.2, "from": 0, "to": 100, "curve": "easeOut" }
      ] },
    { "type": "solid", "name": "BG", "color": [0.1, 0.1, 0.1] }
  ],
  "camera": {
    "target": "Title",
    "distance": 1200,
    "zoom": 1200,
    "depthOfField": true, "focusDistance": 1200, "aperture": 2.8,
    "moves": [ { "type": "orbit", "t0": 0, "t1": 4, "params": { "angle": 90, "curve": "easeInOut" } } ]
  }
}
```

## Rig (Partie 5.2)

Null 3D `RW Rig` à la cible + caméra parentée, `autoOrient = NO_AUTO_ORIENT` :
l'orientation est portée par le rig. Le rig porte translations/rotations
(truck, crane, pedestal, pan, tilt, orbit, whipPan, roll, handheld, shake) ;
la caméra porte le déplacement physique (dolly/push/pull/parallax) et le zoom
optique. Jamais de mélange zoom optique / déplacement (5.1).

Parenté : la caméra est parentée AVANT de recevoir sa position locale
(AE compense le monde à l'affectation du parent — doc Adobe Layer.parent).
Les mouvements d'une même propriété sont triés par t0 avant application :
une spec désordonnée produit des clés continues, sans saut.

Jonction : quand un mouvement commence au t1 du précédent sur la même
propriété, l'ease entrant de la clé de jonction existante est préservé
(seule la sortie est écrite par le nouveau segment).

## Règles de combinaison

- Deux mouvements sur la MÊME propriété (ex. orbit + pan, truck + handheld)
  ne doivent pas se chevaucher en temps : la validation les rejette avec un
  message explicite. Les enchaîner (t0 = t1 du précédent) fonctionne : le
  mouvement suivant part de la valeur atteinte.
- Mouvements sur propriétés différentes : chevauchement libre.

## Mouvements caméra

| type | params | propriété touchée |
|------|--------|-------------------|
| dollyIn/pushIn, dollyOut/pullOut | amount (400), curve | caméra Position z |
| truck | amount (400, >0 droite) | rig Position x |
| pan / tilt | angle (30 / 15) | rig Rotate Y / X |
| orbit | angle (90) | rig Rotate Y |
| crane | amount (-300), tilt (true) | rig Position y (+ Rotate X) |
| pedestal | amount (-300) | rig Position y |
| roll | angle (10) | rig Rotate Z |
| zoomIn / zoomOut | from, to (×1.6) | caméra Zoom (focale) |
| whipPan | angle (90) | rig Rotate Y, ease asymétrique |
| parallax | amount (400), out, depths {calque: z} | caméra Position + z calques |
| handheld / shake | amplitude (6/18 px), seed | rig Position + Rotate Z |
| rackFocus | from, to | caméra Focus Distance (+PdC) |

Non implémentés (phases suivantes) : arcShot, followCamera, flyThrough,
circularCameraMotion, trackingShot latéral dédié, focusPull.

## Courbes (RWCurves, Partie 4.2)

`linear, easeIn, easeOut, easeInOut, cubic, quartic, quintic, exponential,
circular` : 2 clés + temporal ease, tableaux dimensionnés selon la propriété
(Scale 3D : 3 KeyframeEase ; Position spatiale : 1 — règle confirmée par la
doc Adobe). `back, elastic, bounce, spring` : échantillonnées en 15 clés
(overshoot réel). `custom` : influences explicites, bornées [0.1,100].

## Action Registry (Partie 9, sous-ensemble)

`project.inspect`, `comp.inspect {deep}`, `comp.create`, `motion.apply {spec}`,
`layer.animate {layer, property, t0, t1, from, to, curve}`.
Validation des paramètres (types de tous les champs comp/layer/camera/
moves), réponses {ok, tool, result|error}, undo groups. `motion.apply`
renvoie `warnings[]` (ex. `camera.target` ou `params.depths` ne désignant
aucun calque) sans bloquer la construction. Si la construction échoue :
rollback de la comp créée ET des items footage des solides créés
(limite connue : un dossier Solids vide peut rester dans le projet,
comportement d'AE lui-même).

## Accès API AE

- Propriétés par matchName (non localisé : sûr pour une interface AE en français) avec
  repli nom d'affichage ; résultat null testé explicitement (property() ne
  lève pas toujours d'exception).
- Options caméra via le groupe "Camera Options" avec repli.
- TextDocument : lire-modifier-setValue (la mutation en place est ignorée par AE).
- Keyframes : index via nearestKeyIndex, jamais numKeys-1.

## État des tests (honnête)

135 tests Node contre un mock du DOM AE volontairement plus strict que la v1 :
property() renvoie null (pas d'exception), options caméra dans le groupe
seulement, clés triées/remplacées, ease dimensionné exigé, bornes AE,
parent compensateur (affectation de parent ajuste la position comme AE),
sources de solides suivies dans le projet. Les tests de régression v0.4
reproduisent chaque sonde de la revue externe (parenté/monde, tri temporel,
canaux roll+handheld, ease de jonction, rollback solides, validation typée,
BOM, dédoublonnage). TOUS PASSENT au 26/11/2026. Ça prouve la cohérence
des appels API, PAS le rendu ni le comportement réel d'After Effects.

Reste à valider EN AE RÉEL (rien de tout cela n'est prouvé) :
- chargement/dockage du panneau, onglets, resize ;
- orientation réelle de la caméra parentée avec NO_AUTO_ORIENT (espace du POI
  non confirmé par la doc : premier point à tester) ;
- un orbit puis un pushIn sur une comp réelle, clés et overshoot visibles
  dans l'éditeur de graphe ;
- setTemporalEaseAtKey sur Position/Scale réels ;
- annulation Ctrl+Z en un pas, erreur mid-build sans comp orpheline ;
- écriture du pont avec la préférence scripts activée.
