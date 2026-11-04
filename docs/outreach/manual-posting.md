# Où publier personnellement

Liens vérifiés le 4 novembre 2026. Cette liste indique des canaux officiels et des sujets pertinents ; elle ne constitue pas une autorisation des modérateurs. Aucun message n'a été publié dans les nouveaux canaux ci-dessous.

## Premier choix : OpenRGB sur Lemmy

- **Lien : [communauté OpenRGB](https://lemmy.today/c/OpenRGB).** Cliquer sur « Create a post » après connexion. La communauté est également accessible depuis une autre instance Lemmy avec `!OpenRGB@lemmy.today`.
- **Sujet possible :** comment retrouver le travail OpenRGB à partir d'un modèle de périphérique. Présenter une fiche réellement importée dans OpenDeviceDB, son lien vers la source et ses limites ; demander si cette présentation aide les utilisateurs et ce qu'il faudrait corriger.
- **Pourquoi ce canal :** le [site officiel](https://openrgb.org/) et la barre latérale de la communauté se renvoient l'un vers l'autre. Le mainteneur y publie les annonces du projet. Le dépôt GitHub est un miroir ; ne pas y créer une issue promotionnelle.
- **Avant publication :** lire les règles actuelles, rechercher une éventuelle introduction existante et annoncer clairement être le créateur d'OpenDeviceDB. Choisir un seul canal ; ne pas dupliquer simultanément sur Discord.

## Autres pistes à examiner

| Communauté | Où aller | Sujet concret et étape préalable |
| --- | --- | --- |
| Klipper | [Forum officiel](https://community.klipper3d.org/) | Montrer comment l'import des configurations permet de découvrir Klipper depuis un modèle d'imprimante, avec les révisions et adaptations nécessaires. La [documentation officielle](https://www.klipper3d.org/Contact.html) confirme ce forum. Les catégories et règles n'ont pas pu être consultées anonymement : les lire après connexion et choisir une catégorie adaptée avant de publier. |
| Gadgetbridge | [Salon Matrix officiel](https://matrix.to/#/#gadgetbridge:matrix.org) | Demander d'abord si une courte discussion sur la présentation des appareils Gadgetbridge dans OpenDeviceDB est bienvenue. Le [README officiel](https://github.com/Freeyourgadget/Gadgetbridge/blob/master/README.md#community) donne ce salon et précise que les issues ne servent pas de forum. Lire les règles du salon ; ce n'est pas une invitation à une annonce générale. |
| AsteroidOS | [Salon Matrix officiel](https://matrix.to/#/#Asteroid:matrix.org) | Présenter les liens vers les pages de montres déjà importées, avec les variantes, codenames et fonctions partielles. La [page de contact officielle](https://asteroidos.org/contact/) réserve les discussions à ce salon ; lire ses règles et demander si la présentation est bienvenue. Aucun message envoyé. |
| OpenKinect | [Groupe officiel](https://groups.google.com/g/openkinect) | Demander l’adhésion et lire les règles actuelles avant une introduction : seuls les membres peuvent publier. Le [README libfreenect2](https://github.com/OpenKinect/libfreenect2/blob/master/README.md) recommande ce groupe. Distinguer Kinect v1/libfreenect1 et Kinect v2/libfreenect2, avec les contraintes USB et de plateforme. Aucun message ou demande d’adhésion envoyé. |
| OpenPnP | [Groupe officiel](https://groups.google.com/g/openpnp) | Rejoindre le groupe et lire les règles avant une introduction : seuls les membres peuvent publier, et les nouveaux membres sont modérés. Le [site officiel](https://openpnp.org/) invite à s’y présenter. Proposer un petit index des machines et contrôleurs en conservant les configurations nécessaires ; un pilote G-code générique ne prouve pas la compatibilité d’une machine entière. Aucun message ou importeur. |
| SoapySDR / Pothos | [Groupe officiel Pothos Users](https://groups.google.com/g/pothos-users) | Rejoindre le groupe et lire ses règles avant de publier : seuls les membres peuvent envoyer des messages. Le [wiki SoapySDR](https://github.com/pothosware/SoapySDR/wiki#feedback) recommande ce canal. Proposer un petit index des modèles et modules, avec les fonctions RX/TX et dépendances ; aucun importeur ni message envoyé. |
| Marlin | [Discord officiel](https://discord.gg/marlin-firmware-461605380783472640), [forum RepRap](https://forums.reprap.org/list.php?415) | Lire les règles puis demander si une discussion sur les liens vers les exemples de configuration est bienvenue. Le [README](https://github.com/MarlinFirmware/Marlin#marlin-discord) confirme ces canaux ; le lien « Discussions » de la page d’accueil renvoie à une page inexistante. Ne pas confondre une configuration d’exemple avec un firmware prêt à flasher pour toute variante. Aucun message envoyé. |
| LineageOS | [Subreddit officiel](https://reddit.com/r/lineageos) | Lire les règles actuelles puis demander si une discussion sur l’index existant est bienvenue. Les [canaux officiels](https://github.com/LineageOS/www/blob/main/_data/community.yml) confirment Reddit et IRC/Discord. Conserver modèle exact, variante et état de maintenance ; ne pas utiliser les soumissions de ports ou le suivi de bugs comme annonce. Aucun message envoyé. |
| coreboot | [Salon Matrix officiel](https://matrix.to/#/#coreboot:matrix.org) | Discuter de la présentation des cartes et modèles déjà indexés, avec les variantes et contraintes de construction. Les [canaux officiels](https://doc.coreboot.org/community/forums.html) donnent ce salon et la liste de diffusion ; lire les règles du salon avant une introduction. Aucun message envoyé. |

## Conversations déjà ouvertes : répondre dans le fil

Ces liens permettent de lire les échanges ou d'apporter personnellement un élément utile. Il n'est pas nécessaire de publier une nouvelle introduction.

- [fwupd](https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19397020) : suggestion du mainteneur sur les identifiants dans les fichiers `.quirk`. Notre [dernier suivi](https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19403540) présente la [PR 25](https://github.com/opendevicedb/opendevicedb/pull/25) : un index expérimental de 104 déclarations provenant de trois plugins. Tests locaux et CI passés ; PR en brouillon, sans fusion ni déploiement. La correspondance avec les modèles physiques et la recherche côté utilisateur restent à faire dans l’[issue 19](https://github.com/opendevicedb/opendevicedb/issues/19).
- [liquidctl](https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19402109) : le mainteneur a demandé un index partagé avec leur générateur udev. La [PR 943](https://github.com/liquidctl/liquidctl/pull/943) est ouverte en brouillon et [notre réponse](https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19402348) lui donne le lien. Attendre la revue ; aucune nouvelle introduction à publier.
- [OpenTabletDriver](https://github.com/OpenTabletDriver/OpenTabletDriver/discussions/5238) : proposition de liens entre modèles et configurations, avec les conditions de correspondance. En attente de réponse.

- [OpenHantek6022](https://github.com/OpenHantek/OpenHantek6022/discussions/481) : proposition de liens depuis les fiches 6022BE/BL déjà importées via sigrok, en distinguant les fonctions oscilloscope et analyseur logique. En attente de réponse ; aucune nouvelle introduction à publier.

- [SDRangel](https://github.com/f4exb/sdrangel/discussions/3062) : proposition d’index des modèles et plugins, en conservant les dépendances et limites. En attente de réponse ; utiliser ce fil pour tout complément utile.

- [Tuya CloudCutter](https://github.com/tuya-cloudcutter/tuya-cloudcutter/discussions/931) : présentation des liens vers les profils déjà importés, avec les limites liées aux versions de firmware. En attente de réponse ; aucune nouvelle introduction à publier.

- [Fujihack](https://github.com/orgs/fujihack/discussions/25) : présentation de l’annuaire et de la [correction proposée en PR 21](https://github.com/opendevicedb/opendevicedb/pull/21), distinguant les en-têtes de recherche des ports de débogueur documentés. La PR est testée mais reste en brouillon, sans déploiement ; aucune nouvelle introduction à publier.

- [PyMeasure](https://github.com/pymeasure/pymeasure/discussions/1587) : proposition d’index des pilotes par modèle, avec le Keithley 2400 comme exemple et les contraintes de version/adaptateur. En attente de réponse ; aucun importeur implémenté.

- [dji-firmware-tools](https://github.com/o-gs/dji-firmware-tools/discussions/498) : présentation du client Neo 2 et de sa fiche OpenDeviceDB, avec attribution à neo-control et limites de validation. Utiliser ce fil pour les retours ; aucune nouvelle introduction à publier.

- [Open GoPro](https://github.com/gopro/OpenGoPro/discussions/933) : proposition d’index des caméras et de leurs interfaces selon le modèle/firmware, avec demande de la source officielle à privilégier. Aucun importeur ou nouveau test matériel ; utiliser ce fil pour les retours.

- [RealSense / librealsense](https://github.com/realsenseai/librealsense/discussions/15937) : proposition de liens par modèle de caméra, génération du SDK et firmware, en conservant les limites de plateforme. Aucun importeur ou nouveau test matériel ; utiliser ce fil pour les retours.

- [DepthAI / Luxonis](https://github.com/luxonis/depthai/discussions/1255) : proposition d’index des caméras OAK avec les noms de produit/carte, révisions et générations d’API. Aucun importeur ou nouveau test matériel ; utiliser ce fil pour les retours.

- [Espruino / Bangle.js](https://github.com/orgs/espruino/discussions/8038) : présentation de la fiche existante et de la [PR 24](https://github.com/opendevicedb/opendevicedb/pull/24) ajoutant les liens officiels du firmware et de l’App Loader. Validation locale passée, PR en brouillon sans déploiement ; utiliser ce fil pour les retours.

## ESPHome et Home Assistant : participation personnelle uniquement

La [politique de l’Open Home Foundation](https://contributors.home-assistant.io/start/ai-policy/), liée par le [guide ESPHome](https://developers.esphome.io/contributing/code/), autorise l’aide IA relue et comprise par la personne, mais interdit les agents autonomes et les contributions générées non relues. Aucune publication autonome n’est prévue. Le propriétaire peut examiner les [règles du forum](https://community.home-assistant.io/guidelines), vérifier la catégorie adaptée et participer lui-même ; les réponses aux mainteneurs doivent venir de lui. Aucun message envoyé.

## Valetudo : pas de démarche promotionnelle

Le mainteneur [demande de ne pas faire de promotion ou de contenu sur Valetudo](https://valetudo.cloud/pages/general/media/) et ne recherche pas davantage d’utilisateurs ou de collaborateurs. Ne pas proposer de publication ou de sollicitation dans cette campagne. Aucun message envoyé.

## Glasgow : ne plus promouvoir le projet

Le [mainteneur a refusé ce type d'interaction assistée par IA](https://github.com/GlasgowEmbedded/glasgow/discussions/1347#discussioncomment-19398977). Le suivi est marqué `declined_do_not_contact`. Aucun nouveau contact, relance ou texte de réponse assisté par IA n'est prévu. Ce lien est conservé pour le contexte ; Glasgow ne fait pas partie des lieux recommandés pour une nouvelle publication.

## Nura/postmarketOS : pas de publication assistée par IA

Le [code de conduite](https://docs.nura.eco/policies-and-processes/community/code-of-conduct.html) et la [politique IA](https://docs.nura.eco/policies-and-processes/development/ai-policy.html) interdisent les contributions créées entièrement ou partiellement avec une IA générative et la promotion de ces outils. Aucune présentation, contribution ou approche directe d’un mainteneur ne sera envoyée par cette campagne ; aucun texte généré à copier n’est proposé.

## InfiniTime : pas de communication générée par IA

L’[accord IA](https://github.com/InfiniTimeOrg/InfiniTime/blob/9ad16304f5fd526b781a760cf1313813d232645e/AI_USAGE.md) interdit les communications destinées aux personnes générées par IA et les contributions autonomes, dans toute l’organisation InfiniTime. Aucun contact ou contribution de cette campagne, ni texte généré à copier, n’est prévu. Ne pas utiliser un autre canal ou un mainteneur pour contourner cet accord.

## Hacker News : attendre la réponse du support

L'inscription du compte `smichea` n'a pas permis la soumission : « Sorry, your account isn't able to submit this site. » Le propriétaire a envoyé le message au support ; aucune résolution n'est confirmée.

Si le problème est résolu, utiliser [le formulaire officiel](https://news.ycombinator.com/submit), après une nouvelle recherche de doublons. Les [règles HN](https://news.ycombinator.com/newsguidelines.html) interdisent les textes générés, les commentaires générés ou modifiés par IA et les publications automatisées. Le propriétaire doit rédiger et publier lui-même avec ses propres mots. Cette page fournit des informations de suivi, pas un texte à copier dans HN.

## Suivi après publication

Ajouter le lien et la date dans [le journal](log.json), puis archiver le message public dans [messages/](messages/). Une publication ou un envoi ne prouve ni une réponse humaine ni l'adoption du projet.
