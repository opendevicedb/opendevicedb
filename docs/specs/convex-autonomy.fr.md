# Moteur UC5-2S : API mémoire

Le moteur utilise la même bibliothèque Rust pour Linux et WebAssembly.
L’hôte assure USB, affichage et enregistrement ; le traitement reçoit des octets
en mémoire et retourne les images PNG. Aucun accès réseau n’est effectué par le moteur.

L’API `Session` accepte un profil en mémoire. Une session de reconstruction
ne produit pas de commandes de configuration. Le profil d’affichage optionnel
`linear-gray-v1` applique une échelle linéaire ; son contraste diffère de la référence.

Les profils doivent indiquer leurs réglages pris en charge. Une configuration
hors de ce domaine doit être refusée. Les rejeux comparent les commandes octet
par octet et mesurent séparément les différences d’image entre Linux et WASM.
Les preuves techniques détaillées sont conservées dans le projet de recherche.

`ImageProfile` décrit seulement les valeurs utilisées par un réglage d’image.
Le mode sans rehaussement conserve le réarrangement et la corrélation temporelle
sans charger de banques spatiales inactives. Les réglages sont validés avant calcul.

L’adaptateur `createProbeDecoder(wasm)` initialise sans fichier un runtime qui
expose explicitement un profil intégré (`odb_builtin_profile()==1`, opération7).
L’artefact de base du registre utilise l’opération6 et nécessite un profil en mémoire.
L’absence de profil intégré est refusée ; aucun téléchargement implicite n’est effectué.


L’API Rust propose aussi `allow_continuous`, `push_rgba`, `finish_rgba` et
`advance`. La durée de vie n’est alors plus bornée par le nombre de groupes
ou le cumul d’octets ; les tailles des blocs et buffers restent bornées.
`advance` met à jour tout l’historique DSP sans reconstruire un raster : l’hôte
peut omettre un affichage en retard sans omettre les données temporelles.
Le cache des coordonnées DSC conserve les opérations et la précision d’origine.

Un runtime embarqué peut annoncer `odb_live_api()==1`. L’adaptateur accepte
alors `{continuous:true}` (opération8), `pushRgba`/`finishRgba` (9/10),
`encodePng` (11) et `advance` (12). L’artefact de base du registre n’annonce pas
ce profil optionnel. L’hôte WebUSB accepte explicitement `seconds:null` pour
rester connecté jusqu’à l’arrêt manuel ou au débranchement. Aucun redémarrage
ou envoi de configuration périodique n’est nécessaire.
