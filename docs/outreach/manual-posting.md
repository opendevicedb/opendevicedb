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
| SoapySDR / Pothos | [Groupe officiel Pothos Users](https://groups.google.com/g/pothos-users) | Rejoindre le groupe et lire ses règles avant de publier : seuls les membres peuvent envoyer des messages. Le [wiki SoapySDR](https://github.com/pothosware/SoapySDR/wiki#feedback) recommande ce canal. Proposer un petit index des modèles et modules, avec les fonctions RX/TX et dépendances ; aucun importeur ni message envoyé. |
| coreboot | [Salon Matrix officiel](https://matrix.to/#/#coreboot:matrix.org) | Discuter de la présentation des cartes et modèles déjà indexés, avec les variantes et contraintes de construction. Les [canaux officiels](https://doc.coreboot.org/community/forums.html) donnent ce salon et la liste de diffusion ; lire les règles du salon avant une introduction. Aucun message envoyé. |

## Conversations déjà ouvertes : répondre dans le fil

Ces liens permettent de lire les échanges ou d'apporter personnellement un élément utile. Il n'est pas nécessaire de publier une nouvelle introduction.

- [fwupd](https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19397020) : suggestion du mainteneur sur les identifiants dans les fichiers `.quirk`. Notre [réponse](https://github.com/fwupd/fwupd/discussions/11346#discussioncomment-19401663) renvoie à la [proposition 19](https://github.com/opendevicedb/opendevicedb/issues/19). L'importeur reste à implémenter.
- [liquidctl](https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19402109) : le mainteneur a demandé un index partagé avec leur générateur udev. La [PR 943](https://github.com/liquidctl/liquidctl/pull/943) est ouverte en brouillon et [notre réponse](https://github.com/liquidctl/liquidctl/discussions/942#discussioncomment-19402348) lui donne le lien. Attendre la revue ; aucune nouvelle introduction à publier.
- [OpenTabletDriver](https://github.com/OpenTabletDriver/OpenTabletDriver/discussions/5238) : proposition de liens entre modèles et configurations, avec les conditions de correspondance. En attente de réponse.

- [OpenHantek6022](https://github.com/OpenHantek/OpenHantek6022/discussions/481) : proposition de liens depuis les fiches 6022BE/BL déjà importées via sigrok, en distinguant les fonctions oscilloscope et analyseur logique. En attente de réponse ; aucune nouvelle introduction à publier.

- [SDRangel](https://github.com/f4exb/sdrangel/discussions/3062) : proposition d’index des modèles et plugins, en conservant les dépendances et limites. En attente de réponse ; utiliser ce fil pour tout complément utile.

- [Tuya CloudCutter](https://github.com/tuya-cloudcutter/tuya-cloudcutter/discussions/931) : présentation des liens vers les profils déjà importés, avec les limites liées aux versions de firmware. En attente de réponse ; aucune nouvelle introduction à publier.

- [Fujihack](https://github.com/orgs/fujihack/discussions/25) : présentation de l’annuaire et de la [correction proposée en PR 21](https://github.com/opendevicedb/opendevicedb/pull/21), distinguant les en-têtes de recherche des ports de débogueur documentés. La PR est testée mais reste en brouillon, sans déploiement ; aucune nouvelle introduction à publier.

- [PyMeasure](https://github.com/pymeasure/pymeasure/discussions/1587) : proposition d’index des pilotes par modèle, avec le Keithley 2400 comme exemple et les contraintes de version/adaptateur. En attente de réponse ; aucun importeur implémenté.

- [dji-firmware-tools](https://github.com/o-gs/dji-firmware-tools/discussions/498) : présentation du client Neo 2 et de sa fiche OpenDeviceDB, avec attribution à neo-control et limites de validation. Utiliser ce fil pour les retours ; aucune nouvelle introduction à publier.

## Glasgow : ne plus promouvoir le projet

Le [mainteneur a refusé ce type d'interaction assistée par IA](https://github.com/GlasgowEmbedded/glasgow/discussions/1347#discussioncomment-19398977). Le suivi est marqué `declined_do_not_contact`. Aucun nouveau contact, relance ou texte de réponse assisté par IA n'est prévu. Ce lien est conservé pour le contexte ; Glasgow ne fait pas partie des lieux recommandés pour une nouvelle publication.

## Hacker News : attendre la réponse du support

L'inscription du compte `smichea` n'a pas permis la soumission : « Sorry, your account isn't able to submit this site. » Le propriétaire a envoyé le message au support ; aucune résolution n'est confirmée.

Si le problème est résolu, utiliser [le formulaire officiel](https://news.ycombinator.com/submit), après une nouvelle recherche de doublons. Les [règles HN](https://news.ycombinator.com/newsguidelines.html) interdisent les textes générés, les commentaires générés ou modifiés par IA et les publications automatisées. Le propriétaire doit rédiger et publier lui-même avec ses propres mots. Cette page fournit des informations de suivi, pas un texte à copier dans HN.

## Suivi après publication

Ajouter le lien et la date dans [le journal](log.json), puis archiver le message public dans [messages/](messages/). Une publication ou un envoi ne prouve ni une réponse humaine ni l'adoption du projet.
