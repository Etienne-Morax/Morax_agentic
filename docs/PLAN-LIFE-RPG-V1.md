# Morax Life RPG : Plan V1.2 consolidé (iPhone)

Date : 2026-07-05. Synthèse du plan V1, du rapport d'analyse 1, du rapport d'analyse 2 (V1.1) et de la proposition d'optimisation des coûts (V2). Les recommandations contradictoires sont arbitrées ci-dessous.

Mise à jour 2026-07-05 : ajout des quêtes communes avec suivi des membres et relances sociales (arbitrage A7, étape 8).

Mise à jour 2026-07-07 : section 6 portabilité multi-plateforme et IA embarquée; Mode Focus / Station Focus pour utilisateurs ADHD (arbitrage A8, étape 9); avatar 3D vivant avec animations idle (arbitrage A9, étapes 3 et 4); positionnement produit et doctrine UX "toujours vivant, jamais exigeant" (arbitrage A10, section 2); direction visuelle "Calme Quotidien" avec trois écrans centraux (section 7).

## 1. Arbitrages (ce qui change et pourquoi)

**A1. Factures : sorties de la V1.** L'analyse 1 a raison : l'extraction de factures est hors positionnement pour un Life RPG, elle introduit des données financières sensibles, du code et des risques supplémentaires, sans contribuer à la boucle de jeu. L'analyse 2 se contente de la sécuriser au lieu de questionner sa présence. Décision : déplacée en backlog V1.5, avec les garde-fous déjà spécifiés (validation déterministe post-LLM, raw_text_hash, aucune écriture externe). L'étape libérée devient une étape dédiée aux contrôles de confidentialité.

**A2. Avatar : stylisé, pas de visage réel plaqué.** Les deux analyses convergent sur le risque uncanny valley. Décision : le selfie sert une seule fois à générer un pack d'avatar stylisé ressemblant (expressions incluses), puis il est supprimé. Fallback vectoriel automatique si la génération échoue. Bénéfice secondaire : la surface biométrique persistante diminue (aucune image du vrai visage stockée), même si le traitement initial du selfie reste couvert par la DPIA.

**A3. Modèles : la V2 confond deux plans distincts.** Il faut séparer :

- Modèles exécuteurs (qui écrivent le code, régime plan de CLAUDE.md) : coût ponctuel et marginal. Dégrader vers Haiku les étapes à fort risque (DPIA, calibration, action-policy) est une fausse économie : l'erreur y coûte beaucoup plus cher que le delta de tokens.
- Modèles runtime (appelés par l'app en production, registre YAML) : coût récurrent qui scale avec les utilisateurs. C'est ici que l'optimisation agressive est justifiée, et c'est ce que le plan V1 faisait déjà avec Gemini Flash-Lite.

Par ailleurs les références de la V2 (Claude 3.5 Haiku, Gemini 2.0 Flash) sont des générations obsolètes. Le registre doit pointer les générations courantes; les tarifs se vérifient sur les pages officielles au moment de remplir le registre, jamais codés en dur dans un plan.

**A4. HealthKit : zéro LLM.** L'analyse 1 a raison : "10 000 pas" est un chiffre lu par l'app et validé par le moteur déterministe. Instantané, gratuit, fiable. L'analyse 2 apporte la bonne contrainte iOS : lecture au lancement de l'app et pull-to-refresh, pas de background fetch en V1. L'étape passe d'Opus-complexité-élevée à une étape standard, avec revue ciblée sur action-policy-core uniquement.

**A5. UX : onboarding progressif + Optimistic UI.** Cumul des deux analyses. J1 : selfie et première quête validée par tap. J2 : preuve photo/voix. J3 : HealthKit vendu comme superpouvoir d'automatisation. Au check-in, l'UI crédite l'XP provisoirement et confirme ou annule à réception du CheckInAnalysis; timeout de 10 s vers confirmation manuelle sans casser l'XP.

**A6. Gamification : récompenses visuelles et narratives.** Scènes et tenues débloquées par l'accomplissement, courts retours narratifs positifs générés par un modèle léger. Les XP seuls ne retiennent personne au-delà de la nouveauté.

**A7. Quêtes communes : en V1, mais version resserrée et non punitive.** La responsabilité sociale est un des leviers de rétention les plus solides (parties Habitica, séries entre amis Duolingo); elle sert directement l'objectif de 40 % à J7. Décision : groupes de 2 à 8 membres par lien d'invitation, partage limité aux statuts de quête (jamais les preuves ni les données santé), relances déclenchées par un moteur déterministe quand un membre prend de l'avance, avec ton positif imposé et plafond de fréquence. Garde-fou central : la comparaison doit motiver, jamais culpabiliser; pas de classement public ni de honte de retard. Guildes, classements et boss collaboratifs à grande échelle restent en V1.5.

**A8. Mode Focus : débloqué comme récompense, pas affiché à l'onboarding.** Un mode concentration pensé pour les profils ADHD, activé après 1 ou 2 premières quêtes réussies. Deux raisons à ce placement : cohérence avec la divulgation progressive (A5), et transformer la découverte en récompense RPG ("tu as débloqué la Station Focus") plutôt qu'en réglage de plus. Position de design : ce mode retire des choix au lieu d'en ajouter. Une quête, un minuteur court, une validation simple. Les options avancées se débloquent par l'usage, jamais par un écran de réglages. Interrompre une session est neutre : aucune streak punitive, aucune culpabilisation, cohérent avec le principe fondateur. Aucun LLM au runtime en dehors du retour narratif déjà existant.

**A9. Avatar : passage au 3D vivant, personnalisé par paramètres, jamais par biométrie.** Évolution de A2 : le personnage devient une présence permanente avec animations idle en continu, façon écran de lobby de jeu vidéo. Deux conditions rendent cela tenable sur mobile : (1) pipeline d'assets mutualisé : un rig commun, une bibliothèque partagée de clips, des tenues et décors modulaires; la ressemblance de chaque utilisateur = attributs illustratifs discrets (AvatarParams) + textures stylisées, jamais de mesh généré par utilisateur; (2) garde-fous de performance : 30 fps max, boucle suspendue hors écran, dégradation en pose statique sur batterie faible. Côté données : la photo d'onboarding est supprimée après extraction; aucun embedding facial, aucun template biométrique, aucune donnée biométrique brute persistée. L'expressivité est bornée : prêt, concentré, satisfait, légèrement fatigué; jamais dégradé physiquement ni humilié.

**A10. Positionnement : compagnon de productivité ADHD-friendly, sans allégation médicale ni étiquetage des utilisateurs.** Morax n'est pas un habit tracker gamifié de plus : c'est un compagnon conçu pour les cerveaux qui ont du mal à démarrer, à tenir et à revenir après une interruption. Deux lignes rouges découlent de ce positionnement. (1) Aucune allégation de santé : le marketing et l'App Store parlent de concentration, de démarrage et de motivation, jamais de traitement, de soin ou de gestion du TDAH; les CGU et la DPIA le verrouillent (pas un dispositif médical). (2) Aucun étiquetage : le produit ne demande, n'infère ni ne stocke jamais un statut ADHD; un tel marqueur serait une donnée de santé de catégorie spéciale. On conçoit POUR ces profils, on ne les diagnostique pas. Le principe UX central qui traverse toutes les étapes : "toujours vivant, jamais exigeant".

## 2. Positionnement et résumé produit

**Positionnement.** Compagnon de productivité ADHD-friendly, pas un habit tracker gamifié. Morax accompagne, aide à démarrer et célèbre les actions réelles; il ne juge pas. RPG de la vie réelle pour adultes : objectifs, habitudes et obligations deviennent des quêtes, validées par photo, voix, HealthKit ou confirmation manuelle.

**Quatre briques différenciantes :**

1. Un avatar 3D stylisé ressemblant, vivant en continu (idle calme façon lobby), qui reflète l'état du jour sans jamais humilier (étapes 3 et 4).
2. Une progression RPG strictement non punitive : pas de punition visuelle, pas d'avatar abîmé, pas de streak honteuse; les jours manqués déclenchent des quêtes de reprise douces (étape 5).
3. Une Station Focus activable très tôt, après 1 ou 2 quêtes réussies : une quête, un timer court, des sons optionnels, des pauses guidées, une validation simple, une récompense légère (étape 9).
4. Des quêtes réelles validées par preuves du monde réel, avec preuve = indice et ambiguïté = confirmation (étapes 6 et 7).

**Principe UX central : "toujours vivant, jamais exigeant".** L'app respire même quand l'utilisateur n'a rien fait; elle ne réclame jamais. Les récompenses sont visuelles et émotionnelles (tenues, poses, décors, animations, ambiances, retours narratifs courts), la complexité est progressive : rien à configurer au départ, les options avancées apparaissent en contexte ou se débloquent par l'usage.

Principes non négociables :

- L'avatar ne punit jamais l'apparence et ne formule aucun diagnostic; aucune régression physique punitive.
- Une photo est un indice, pas une preuve; ambiguïté = confirmation utilisateur.
- Le LLM extrait et propose; un moteur déterministe exécute et attribue les récompenses.
- Les preuves visuelles sont éphémères; seules les données structurées persistent.
- L'UI est optimiste : jamais bloquée par une analyse en cours.
- La gamification repose sur scènes, tenues et narratif, pas seulement des XP.
- La comparaison sociale motive, jamais ne culpabilise : relances positives, opt-in, plafonnées, désactivables par quête.
- Le Mode Focus réduit les choix au lieu d'en ajouter : une quête, un minuteur, une validation; l'interruption est neutre.
- Toute écriture externe passe par le gate HIGH; aucune API tierce appelée directement par un LLM.

## 3. Registre des modèles runtime

Aucun modèle codé en dur hors du registre (`packages/model-core/src/models.registry.yaml`). Tarifs à vérifier sur les pages officielles au moment de l'implémentation.

| Rôle | Candidat | Justification |
|---|---|---|
| habit_evidence (photo/voix) | Gemini Flash-Lite génération courante | Multimodal natif, latence faible, coût minimal; c'est le poste de coût récurrent principal |
| task_decomposition | Sonnet (épinglé, décision existante) | Décomposition d'objectifs vagues en quêtes; ne pas dégrader sans eval comparative (critère : JSON valide 100 % + qualité) |
| narrative_generator (nouveau) | Haiku génération courante | Courts textes positifs, volume élevé, exigence faible |
| avatar_stylization (ex avatar_expression_pack) | Gemini Flash Image génération courante | Portrait stylisé + extraction d'AvatarParams; ponctuel, une fois par utilisateur |
| HealthKit / Calendrier (lecture) | Aucun modèle | Moteur déterministe uniquement |

Règle d'or : optimiser le runtime (récurrent), pas les exécuteurs (ponctuel).

Routage device/cloud : chaque rôle porte une liste de préférence ordonnée (IA embarquée si capacité disponible, sinon cloud); voir section 6.2. Les seuils de confiance sont calibrés par provider.

## 4. Interfaces principales

- **Quest** : type daily | main | side | boss, domaine, objectif, politique de preuve, XP, échéance, statut.
- **QuestTemplate / QuestInstance** : séparation récurrence / occurrence du jour, pour une gestion déterministe des séries et reprises.
- **CheckInAnalysis** : faits observables, quête associée, confiance, confirmation requise, drapeaux de sécurité, ui_state (pending | validated | rejected).
- **AvatarState** : force, énergie, soin, concentration, organisation, tenue, décor, narrative_status.
- **AvatarParams** : attributs illustratifs discrets (coiffure, pilosité, palette de peau, lunettes, morphologie stylisée) + textures stylisées. Jamais d'embedding facial ni de template biométrique.
- **IdleController** : machine d'états déterministe AvatarState -> attitude (prêt | concentré | satisfait | légèrement fatigué), avec liste interdite d'expressions (dégradation physique, humiliation) vérifiée par tests.
- **ServicePolicy** : service, capacité, mode deny | read | confirm | auto, limites.
- **ActionProposal** : action structurée, justification, annulable, clé d'idempotence, validation_hooks (règles déterministes post-LLM).
- **PartyQuest** : quête commune, 2 à 8 membres, objectif partagé ou parallèle, visibilité de progression, NudgePolicy, échéance, statut.
- **PartyMembership** : utilisateur, rôle, consentement de partage explicite, état (actif | sorti), date d'entrée.
- **ProgressEvent** : événement diffusé aux membres : statut de quête et série uniquement, jamais la preuve ni les données sous-jacentes.
- **NudgePolicy** : déclencheurs (membre termine avant toi, écart de série >= N jours), plafond de fréquence, plages horaires autorisées, opt-out par quête.
- **FocusSession** : quête liée (une seule), durée prévue, pauses guidées, ambiance sonore optionnelle, état (en cours | pause | terminée | interrompue), auto-évaluation de fin (fait | en partie | pas cette fois), récompenses attribuées.
- **FocusUnlocks** : progression de déblocage des options avancées par l'usage (ambiances, durées personnalisées, rituels de démarrage, statistiques, décor de concentration), jalons déterministes.
- Rôles registre : habit_evidence, avatar_stylization, narrative_generator; task_decomposition épinglé Sonnet.
- **Ports plateforme** (interfaces TypeScript, une implémentation par OS) : HealthPort, CalendarPort, NotificationPort, CameraPort, SpeechPort, SecureStoragePort, OnDeviceAIPort. Le code partagé ne parle qu'aux ports, jamais aux SDK natifs.
- **InferenceProvider** : contrat commun d'inférence (entrée texte/image, schéma JSON de sortie, manifeste de capacités : vision, audio, tokens max, sortie structurée fiable). Implémentations : cloud (worker actuel), Apple Foundation Models, Gemini Nano.
- InvoiceExtraction : retirée de la V1 (voir backlog).

## 5. Plan d'implémentation

### Étape 1 : Vision et protection des données
Exécuteur : Sonnet pour la rédaction; Opus uniquement pour la matrice de risques DPIA et la liste des inférences interdites. Justification Opus : selfie, données de santé et inférences comportementales relèvent potentiellement des catégories spéciales UK GDPR; l'erreur y est juridiquement coûteuse, le surcoût de tokens est négligeable.

- Fichiers : docs/VISION/life-rpg.md, docs/ADR-002-life-rpg.md, docs/superpowers/specs/2026-07-05-morax-life-rpg-design.md.
- Documenter : parcours 18+, inférences interdites (y compris toute inférence ou stockage d'un statut ADHD ou de tout état de santé mentale, conformément à A10), consentement facial (usage unique du selfie), rétention, export, effacement.
- Verrouiller le positionnement dans les documents : compagnon de concentration et de motivation, aucune allégation de traitement ou de gestion du TDAH, ni dans l'app, ni sur l'App Store, ni dans le marketing.
- DPIA avant la bêta, base légale validée (ICO). Préciser : HealthKit ne quitte l'appareil que sous forme d'agrégats; l'avatar stylisé ne constitue pas une image faciale persistante; aucun embedding facial ni template biométrique n'est créé ou conservé, la ressemblance repose sur des attributs illustratifs discrets (à documenter explicitement dans la DPIA); CGU explicites : outil de motivation et divertissement, pas un dispositif médical.
- Couvrir le partage inter-utilisateurs des quêtes communes : consentement explicite par quête, contenu partagé limité aux statuts, droit de retrait immédiat, effacement de la visibilité à la sortie du groupe.
- Acceptation : aucune règle ambiguë, aucune promesse médicale; chaque donnée a une finalité, une durée et une méthode de suppression.

### Étape 2 : Contrats et stockage
Exécuteur : Sonnet.

- Fichiers : packages/model-core/src/contracts.ts, packages/model-core/src/models.registry.yaml, packages/game-core/ (nouveau), supabase/migrations/0015_life_rpg.sql.
- Tables : quest_templates, quest_instances, check_ins, progression, avatar_assets, service_policies, action_log. Pas de table factures en V1.
- packages/game-core : logique métier pure (quest-engine, party-engine, progression, machine d'états optimiste, avatar-state) en TypeScript sans aucun import react-native. Définir les ports plateforme (section 4) et le contrat InferenceProvider ici.
- Schéma d'agrégats santé neutre (pas, sommeil, séance) défini dans les contrats : HealthKit n'est qu'un adapter, Health Connect (Android) en sera un autre.
- RLS par utilisateur, idempotence, suppression en cascade (y compris buckets Storage).
- Acceptation : tests de contrats et RLS verts; aucune référence modèle hors registre; lint qui interdit tout import react-native ou SDK natif dans packages/.

### Étape 3 : App Expo et onboarding progressif
Exécuteur : Sonnet.

- Fichiers : mobile/package.json, mobile/app/onboarding.tsx, mobile/src/avatar/avatar-state.ts, mobile/src/avatar/avatar-fallback.tsx.
- Development build Expo iPhone : caméra, voix, notifications, auth Supabase. L'UI applique la direction visuelle "Calme Quotidien" (section 7) : thème centralisé, 3 onglets, écrans Aujourd'hui / Check-in / Progression en priorité.
- Onboarding J1 : consentement + photo -> rôle avatar_stylization : portrait stylisé et extraction des AvatarParams (coiffure, pilosité, palette de peau, lunettes, morphologie stylisée) -> suppression garantie de la photo originale -> première quête validée par simple tap. Seuls les AvatarParams et les textures stylisées persistent : aucune donnée biométrique brute, aucun embedding facial. Les permissions photo/voix (J2) et HealthKit/Calendrier (J3) sont demandées en contexte, jamais en bloc.
- Fallback ressemblance : si l'extraction échoue ou si le résultat est incohérent, sélection d'un preset stylisé parmi plusieurs personnages; la cascade complète de rendu est spécifiée à l'étape 4.
- Acceptation : onboarding complet sur appareil réel; suppression de la photo vérifiée; aucune donnée biométrique brute en base ni en storage; avatar stable entre sessions; fallback testé; aucun mur de permissions au premier lancement.

### Étape 4 : Avatar vivant, rendu 3D et animations idle
Exécuteur : Sonnet. Aucun LLM au runtime : le mapping état -> attitude est une machine d'états déterministe; le narratif reste sur narrative_generator.

- Fichiers : mobile/src/avatar/renderer.tsx (expo-gl + three.js, personnages GLTF riggés), packages/game-core/src/avatar/idle-controller.ts, mobile/src/avatar/assets/ (rig, clips, tenues, décors), mobile/src/avatar/fallback-2d.tsx.
- Assets mutualisés : un corps riggé commun (variantes de base), bibliothèque partagée de clips idle (respiration, regard, micro-gestes, changements de posture), tenues et décors modulaires. Personnalisation = AvatarParams + textures appliqués au rig commun; aucun asset 3D généré par utilisateur.
- Présence permanente façon lobby : idle en continu sur l'écran principal, attitudes pilotées par AvatarState (énergie, concentration, progression du jour) via l'IdleController : prêt, concentré, satisfait, légèrement fatigué. Transitions douces, variations aléatoires seedées pour éviter la répétition mécanique.
- Garde-fous expressifs (liste interdite testée) : jamais de dégradation physique (maigreur, surpoids, blessure, vieillissement), jamais d'humiliation (effondrement, pleurs, regard accusateur). La fatigue reste légère (respiration plus lente, posture assise) et se dissipe sans pénalité dès la première quête du jour.
- Performance et batterie : 30 fps max, boucle de rendu suspendue hors écran et en arrière-plan, dégradation en pose statique si économie d'énergie ou surchauffe, budget mémoire d'assets défini et tenu.
- Fallback en cascade : (1) avatar ressemblant complet; (2) preset 3D non ressemblant choisi par l'utilisateur; (3) avatar vectoriel 2D animé si le contexte GL est indisponible. Les mêmes attitudes existent aux trois niveaux.
- Déblocages progressifs : tenues, poses, animations et décors rejoignent la boucle de récompense existante (scènes, Station Focus); aucun contenu payant en V1.
- Acceptation : 30 minutes d'idle sans fuite mémoire ni surchauffe sur appareil réel; attitude correcte pour chaque AvatarState simulé; liste interdite couverte par des tests de mapping; les trois niveaux de fallback testés; consommation batterie mesurée et documentée.

### Étape 5 : Moteur de quêtes, progression et Optimistic UI
Exécuteur : Sonnet.

- Fichiers : mobile/app/quests.tsx, mobile/src/quests/quest-engine.ts, mobile/src/quests/optimistic-ui.ts, worker/src/tasks/plan-quests.ts.
- Règles déterministes pour les habitudes simples; task_decomposition (Sonnet, sortie JSON stricte) pour les objectifs complexes.
- XP, séries, niveaux, quêtes de reprise sans régression punitive. Récompenses visuelles : déblocage de scènes et tenues; narrative_generator (Haiku) pour les retours positifs de l'avatar.
- Optimistic UI : au check-in, quête en "validation en cours", XP créditée provisoirement, confirmée ou annulée à réception du CheckInAnalysis.
- Acceptation : un même événement ne récompense jamais deux fois; reprise, retard et journée manquée testés; l'UI ne gèle jamais; décomposition JSON valide à 100 %.

### Étape 6 : Analyse photo/voix éphémère
Exécuteur : Sonnet; Opus flag haute complexité uniquement sur la calibration des seuils de confiance et l'équité entre groupes. Runtime : Gemini Flash-Lite (habit_evidence).

- Fichiers : worker/src/tasks/analyze-checkin.ts, worker/src/adapters/ephemeral-media.ts, worker/src/prompts.ts.
- Retirer EXIF, redimensionner, analyser sans stockage durable; suppression du média garantie dans tous les chemins d'exécution, y compris erreurs, timeouts et crash logs.
- Retourner uniquement des faits observables; confirmation demandée sous le seuil calibré. File d'attente avec timeout 10 s : au-delà, statut "ambigu" et confirmation manuelle.
- Jeu d'évaluation : au moins 150 exemples consentis ou synthétiques (lumière faible, doublons, ambiguïtés). Les seuils viennent de cette eval, jamais d'une constante.
- Acceptation : au moins 95 % de précision sur les auto-validations; aucune fuite de média; écart entre groupes mesuré et documenté; latence p50 < 3 s.

### Étape 7 : Calendrier et Apple Health (déterministe)
Exécuteur : Sonnet; revue Opus ciblée sur worker/src/action-policy-core.ts uniquement. Justification : écritures externes, gate HIGH, idempotence. Aucun LLM en lecture.

- Fichiers : mobile/src/integrations/healthkit.ts, mobile/src/integrations/calendar.ts, worker/src/action-policy-core.ts.
- Lecture HealthKit au lancement et pull-to-refresh (pas de background fetch en V1); seuls les agrégats nécessaires remontent, jamais l'historique brut.
- Validation des quêtes liées (pas, sommeil, séances) par le moteur déterministe : lecture du chiffre, comparaison au seuil, terminé.
- ServicePolicy : deny | read | confirm | auto par service. Toute écriture serveur passe par le gate HIGH existant (enqueueAction, risk HIGH).
- Acceptation : matrice de permissions testée; action annulable; refus propre si permission retirée; aucune double écriture.

### Étape 8 : Quêtes communes et relances sociales
Exécuteur : Sonnet; revue Opus ciblée sur les policies RLS de partage inter-utilisateurs. Justification Opus : une fuite de données entre utilisateurs est l'incident de sécurité le plus grave possible ici; le RLS passe de "par utilisateur" à "par appartenance", ce qui est exactement le genre de logique où une erreur est silencieuse.

- Fichiers : mobile/app/party.tsx, mobile/src/party/party-engine.ts, worker/src/tasks/nudge-scheduler.ts, supabase/migrations/0016_party_quests.sql.
- Tables : party_quests, party_members, progress_events, nudge_log. RLS : un non-membre ne voit rien; un membre ne voit que les statuts et séries des autres, jamais leurs check-ins, photos, audio ou agrégats santé.
- Création par lien d'invitation, 2 à 8 membres. Chaque membre accomplit sa propre instance; le groupe voit l'avancement de chacun (terminé, en cours, manqué) et les séries.
- Relances : décision par moteur déterministe uniquement (déclencheurs NudgePolicy : un membre termine avant toi, écart de série); copy générée par narrative_generator (Haiku) avec ton positif imposé ("Marie vient de terminer sa séance, à toi de jouer"), jamais culpabilisant ni comparatif négatif. Plafond : 1 relance sociale par quête et par jour, plages horaires respectées, opt-out par quête, mute par membre.
- Sortie de groupe : la progression du membre disparaît pour les autres (cascade); suppression de compte = retrait de toutes les parties.
- Les relances sont des push internes au produit : hors gate HIGH, mais journalisées dans nudge_log et plafonnées côté serveur.
- Acceptation : tests RLS adversariaux (non-membre, ex-membre, membre) verts; aucun contenu de preuve accessible entre membres; plafond de relances vérifié sous charge; opt-out effectif immédiatement; un même événement de progression ne déclenche jamais deux relances.

### Étape 9 : Mode Focus / Station Focus (ADHD-friendly)
Exécuteur : Sonnet. Aucun LLM au runtime hors narrative_generator; minuteur, déblocages et récompenses sont 100 % déterministes.

- Fichiers : mobile/app/focus.tsx, mobile/src/focus/focus-session.ts (machine d'états dans packages/game-core), mobile/src/focus/focus-unlocks.ts, supabase/migrations/0017_focus_mode.sql (table focus_sessions + jalons dans progression).
- Déblocage : après 1 ou 2 quêtes réussies (règle déterministe), présenté comme récompense RPG avec le décor "Station Focus". Invisible avant.
- Écran de session volontairement réduit : une seule quête (par défaut la prochaine échue, changeable en un tap), minuteur court et ajustable (défaut 15 min, bornes 5 à 25 min en V1), visualisation du temps restant adaptée ADHD (progression visuelle, pas un simple chiffre), ambiance sonore optionnelle (boucles embarquées libres de droits, lecture en arrière-plan iOS), pauses guidées courtes (respiration, étirement) entre les cycles.
- Fin de session : validation en un tap (fait | en partie | pas cette fois). Aucun justificatif photo requis : la session focus vaut auto-déclaration pour les quêtes dont la politique de preuve l'autorise, ou compte comme progression partielle sinon.
- Non-culpabilisation stricte : interrompre ou abandonner une session est neutre (aucune perte, aucun message négatif, option "reprendre" douce au retour); pas de streak de focus punitive; récompenses uniquement positives : XP léger, tenue, évolution du décor de concentration, retour narratif positif (Haiku).
- Déblocage progressif des options avancées par jalons d'usage (par exemple 3, 5 et 10 sessions) : nouvelles ambiances, durées personnalisées, rituels de démarrage, statistiques de focus, décor spécial. Jamais plus d'un écran de réglages; les défauts font le travail.
- Statistiques de focus : locales et privées à l'utilisateur, jamais partagées aux quêtes communes, jamais remontées en analytics au-delà des compteurs agrégés de l'étape 11.
- Technique : le minuteur survit à l'arrière-plan (restauration d'état + notification locale de fin de session); la session fonctionne hors-ligne, synchronisation à la reconnexion.
- Acceptation : déblocage au bon moment testé; session complète, interrompue et reprise testées; minuteur fiable après mise en arrière-plan et redémarrage de l'app; aucun message culpabilisant dans tous les chemins (revue de copy dédiée); audio coupé proprement en cas d'appel; jalons de déblocage jamais rejoués deux fois.

### Étape 10 : Contrôles de confidentialité
Exécuteur : Sonnet.

- Fichiers : mobile/app/settings/privacy.tsx, worker/src/tasks/data-deletion.ts.
- Export complet des données, révocation de la ressemblance (suppression des AvatarParams et textures, bascule vers un preset, sans perte de progression), suppression totale du compte : base, buckets Storage, caches, appartenances aux quêtes communes et événements de progression associés.
- Écran transparent : ce que Morax voit, ce qu'il garde, ce qu'il supprime, quand.
- Acceptation : suppression vérifiée en base et stockage; export lisible; révocation du visage effective sans casser la progression.

### Étape 11 : Vérification et bêta fermée
Exécuteur : Haiku.

- Typecheck, lint, tests unitaires, intégration, RLS, parcours iPhone réels.
- Scénarios : onboarding, hors-ligne, photo, voix, ambiguïté, timeout, HealthKit, calendrier, quête commune (invitation, avancement, relance, opt-out, sortie de groupe), Mode Focus (déblocage, session complète, interruption, reprise, arrière-plan, jalons), avatar vivant (attitudes, mémoire, batterie, cascade de fallback), export, suppression.
- Monitoring latence des workers d'analyse. Instrumentation limitée : rétention, jours actifs, quêtes terminées, taux de corrections manuelles. Aucun analytics facial.
- TestFlight uniquement après gate d'approbation; main intouché avant validation (boucle preview habituelle).
- Recrutement bêta : inclure des testeurs se déclarant volontairement concernés par les difficultés d'attention (consentement explicite, hors produit); aucun statut ADHD n'est stocké dans Morax.
- Acceptation : 20 à 30 testeurs adultes; rétention J7 >= 40 %; temps de validation moyen < 3 s, p95 < 10 s; taux de correction manuelle < 20 %; zéro incident de confidentialité. Signal social à surveiller : taux d'opt-out des relances (au-delà de 30 %, le ton ou la fréquence sont à revoir avant d'élargir). Signal focus : part des utilisateurs revenant pour une 2e session dans les 7 jours (si faible, revoir la durée par défaut et le moment du déblocage, pas ajouter des options).

## 6. Portabilité multi-plateforme et IA embarquée

Objectif : Android, macOS et éventuellement Windows sans réécriture, et bascule facile vers l'IA embarquée des appareils quand elle est disponible. Tout se joue sur des règles de structure appliquées dès la V1, pas sur du code supplémentaire.

### 6.1 Règles de portabilité

- **Trajectoire réaliste.** Android est quasi gratuit avec Expo/React Native : même codebase, il restera l'adapter Health Connect, FCM (déjà couvert par expo-notifications) et les tests appareil. macOS et Windows sont un saut plus grand : soit react-native-macos / react-native-windows (rendu natif, plus de travail), soit un shell desktop (web ou Tauri) réutilisant packages/game-core et react-native-web. Décision à prendre en V2; la seule chose qui compte en V1 est de ne pas la fermer.
- **Règle 1 : la logique métier vit dans packages/, jamais dans mobile/.** packages/game-core (quêtes, progression, party, machine d'états optimiste, avatar-state) est du TypeScript pur, testable sur Node, sans import react-native. mobile/ ne contient que l'UI et le câblage des adapters. C'est la garantie de portabilité la plus rentable qui existe.
- **Règle 2 : ports et adapters pour tout ce qui touche l'OS.** HealthPort, CalendarPort, NotificationPort, CameraPort, SpeechPort, SecureStoragePort, OnDeviceAIPort. Convention de fichiers : health.ios.ts (HealthKit), health.android.ts (Health Connect), etc. Le code partagé ne connaît que l'interface.
- **Règle 3 : contrats de données neutres.** Les agrégats santé, les notifications et les capacités caméra sont décrits en termes produit (pas, sommeil, séance validée), jamais en termes d'API Apple.
- **Règle 4 : le serveur est déjà portable.** Supabase, worker Cloud Run, gate HIGH : rien n'y référence iOS. Ne pas introduire de dépendance APNs directe; expo-notifications abstrait APNs/FCM.

### 6.2 IA embarquée : abstraction InferenceProvider et routage device/cloud

État des lieux (juillet 2026) : Apple expose le modèle on-device d'Apple Intelligence via le framework Foundation Models (iOS 26+, gratuit, hors-ligne, sortie structurée, entrée image depuis WWDC26, même API pour on-device, Private Cloud Compute et modèles tiers). Android expose Gemini Nano via les API ML Kit GenAI / Prompt API (multimodal image+texte, on-device). Les deux évoluent vite : c'est précisément pourquoi on ne code jamais contre ces API directement.

- **Un seul contrat : InferenceProvider.** Entrée (texte/image), schéma JSON de sortie attendu, manifeste de capacités déclaré par chaque adapter (vision, audio, tokens max, sortie structurée fiable). Trois implémentations : cloud.ts (chemin worker actuel, seul implémenté en V1), apple-foundation-models.ios.ts et gemini-nano.android.ts (modules natifs via Expo Modules, chantiers courts en V1.5 puisque l'abstraction existe).
- **Le registre YAML reste la source de vérité du routage.** Chaque rôle reçoit une liste de préférence ordonnée, par exemple habit_evidence : [device (si capacité vision), cloud.gemini-flash-lite]. Un resolver déterministe choisit au runtime selon la capacité réelle de l'appareil, le réglage utilisateur, le budget de latence et l'existence de seuils calibrés pour ce provider. Changer de stratégie = éditer le YAML, pas le code.
- **Fallback cloud systématique, jamais l'inverse en silence.** Un réglage utilisateur "traitement local uniquement" bloque proprement si le device ne peut pas, au lieu d'envoyer au cloud en douce.
- **Calibration par provider.** Un modèle ~3B on-device n'a pas la fiabilité d'un modèle cloud : l'eval de 150 exemples tourne sur chaque adapter, les seuils de confiance vivent dans le registre par rôle et par provider, et les validation_hooks déterministes s'appliquent quel que soit le lieu d'inférence. Un provider sans seuils calibrés n'est pas éligible au routage.
- **Gains attendus.** habit_evidence on-device : la photo ne quitte jamais le téléphone, argument DPIA majeur et coût API nul. narrative_generator on-device : gratuit et hors-ligne. Restent cloud : task_decomposition (qualité) et le pack avatar (ponctuel, modèle image lourd).
- **Télémétrie.** Journaliser le provider utilisé et la latence (jamais le contenu) pour comparer device vs cloud avant d'élargir le routage.

## 7. Direction visuelle V1 : Calme Quotidien

Référence : les deux visuels "Calme Quotidien" validés le 2026-07-07 (à déposer dans docs/design/ comme référence d'intention). Ils fixent l'intention, pas le pixel : une interface claire, lumineuse, adulte et rassurante, où l'utilisateur comprend immédiatement quoi faire, sans surcharge cognitive.

### 7.1 Trois écrans centraux (priorité V1)

- **Aujourd'hui** : avatar en buste dans l'en-tête (idle calme, présence de compagnon, ne domine jamais l'interface), niveau et XP discrets, 3 à 5 quêtes du jour en cartes simples avec progression, la quête majeure ou boss datée à part, une seule action principale ("Démarrer ma quête du jour"). C'est l'écran de la boucle quotidienne.
- **Check-in** : quête sélectionnée rappelée en haut, preuve au choix (photo, voix, tap), état "Analyse en cours" visible avec XP provisoires affichées ("+40 XP provisoires" : l'Optimistic UI de l'étape 5 rendue littérale), bouton "Confirmer manuellement" toujours accessible. La dégradation gracieuse de l'étape 6 est un bouton visible, pas un état d'erreur.
- **Progression** : attributs (force, énergie, concentration, organisation) en barres calmes, récompenses débloquées en galerie (tenues, lieux, scènes) portées par l'avatar.

Navigation : 3 onglets maximum (Aujourd'hui, Quêtes, Avatar). Tout le reste apparaît en contexte ou se débloque par l'usage.

### 7.2 Tokens et règles

- Fond crème clair, cartes blanches à coins arrondis, ombres à peine perceptibles; accent unique vert/teal pour les actions et la progression; touches chaudes réservées aux moments de récompense.
- Une seule famille d'icônes, lisible, jamais décorative; typographie sobre, deux niveaux de hiérarchie par écran; beaucoup d'espace, peu d'effets.
- Aucune animation d'interface non fonctionnelle : le vivant appartient à l'avatar (étape 4), pas aux composants.
- Règles ADHD-friendly opposables : une action principale par écran; jamais plus de 5 quêtes visibles; états système toujours visibles et rassurants ("Analyse en cours", "Tu gagnes déjà des XP"); aucun badge rouge, aucun compteur de retard, aucun chiffre culpabilisant.
- Copy : tutoiement doux, célébration sans emphase, jamais d'injonction.
- Les tokens (couleurs, rayons, espacements, typographie) sont centralisés dans un thème unique côté mobile; aucun style en dur dans les écrans.

### 7.3 Divergence assumée avec les visuels de référence

Les mockups montrent un avatar photoréaliste. La V1 reste sur un avatar stylisé (A2, A9) : le photoréalisme est précisément ce que le plan exclut (uncanny valley, posture biométrique). On retient la présence chaleureuse, la place de l'avatar dans la composition et l'ambiance générale, pas le rendu photoréaliste du visage.

Acceptation design (vérifiée à l'étape 11) : chaque écran passe le test des 5 secondes (quoi faire est évident sans lire); palette et tokens centralisés; une seule action principale par écran; la boucle choisir -> valider -> XP provisoires -> récompense est parcourable sans aucune explication.

## 8. Backlog V1.5 (sorti de la V1)

- Extraction de factures : Gemini Flash-Lite + validation déterministe (regex montants, dates ISO), raw_text_hash anti-doublons, suppression de l'image après extraction, aucune écriture externe automatique. À réintroduire seulement si la rétention V1 est validée et si la demande utilisateur existe.
- Background fetch HealthKit (notifications silencieuses).
- Social à grande échelle : guildes, classements, boss collaboratifs multi-groupes, chat intégré. La V1 se limite aux quêtes communes de l'étape 8.
- Adapters IA embarquée : apple-foundation-models.ios.ts et gemini-nano.android.ts, avec calibration des seuils par provider sur l'eval de 150 exemples (section 6.2).
- Focus en duo (body doubling) : session focus synchronisée avec un membre d'une quête commune, présence discrète sans chat. Extension naturelle des étapes 8 et 9.
- Portage Android : adapter Health Connect, tests appareil, parité fonctionnelle.
- Desktop macOS/Windows : choix shell (react-native-macos/windows vs web/Tauri) après validation du produit mobile.

## 9. Hypothèses et contraintes

- V1 : iPhone, React Native + Expo, adultes 18+, Royaume-Uni.
- Démarrage avec 3 à 5 habitudes; Morax peut aussi créer des quêtes depuis les objectifs.
- Portrait stylisé et AvatarParams générés une seule fois à l'onboarding; aucune génération d'image d'avatar quotidienne, l'expressivité vient du rig et des animations (étape 4).
- Si l'analyse LLM échoue ou expire : dégradation gracieuse vers validation manuelle, XP préservée.
- Compte Apple Developer Program payant (99 USD/an) requis dès l'étape 3 : les relances sociales reposent sur les push distantes (APNs), non disponibles avec un compte gratuit, et TestFlight l'exige de toute façon.
- Exécution dans un worktree isolé; commits conventionnels; fichiers ajoutés explicitement; aucun push sans gate; budget guards consultés avant les étapes lourdes.
- Distinction Main vs Boss (question ouverte de l'analyse 1, proposition) : une quête main est un jalon planifiable d'un objectif (courir 5 km sans pause); un boss est une épreuve datée à enjeu, non répétable, qui clôt un arc (courir le 10 km du 12 septembre). Le boss consomme les acquis des quêtes main et daily; le rater déclenche une quête de reprise, pas une punition.
