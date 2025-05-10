# Règles de migration (Cline Rules) pour le portage de NoiseShaper vers le web

## 1. Règles d'architecture

- **Règle de séparation** : Séparer clairement le code en trois couches distinctes :

  - Couche UI (HTML/CSS)
  - Couche logique métier (JS)
  - Couche audio (Web Audio API)

- **Règle de correspondance** : Chaque module Python doit avoir un équivalent JS identifiable.

  - `config.py` → `config.js`
  - `processor.py` → `processor.js`
  - `filters.py` → `filters/`
  - `audio_sources.py` → `sources.js`

- **Règle d'isolation** : Isoler le code spécifique à la plateforme pour faciliter la maintenance.

## 2. Règles techniques audio

- **Règle de contexte unique** : Utiliser un seul `AudioContext` pour toute l'application.

- **Règle de chaînage** : Implémenter les filtres comme une chaîne de nœuds audio :

  ```
  NoiseSource → Filter1 → Filter2 → ... → Analyzer → Output
  ```

- **Règle d'échantillonnage** : Toujours vérifier et respecter la fréquence d'échantillonnage du contexte (généralement 44100 ou 48000 Hz).

- **Règle de buffer** : Utiliser des tailles de buffer optimales pour un bon compromis entre latence et performance (1024 ou 2048 échantillons).

## 3. Règles de traitement du signal

- **Règle de conversion FFT** : Mapper la méthode `np.fft.fft` de NumPy à l'API `AnalyserNode.getFloatFrequencyData()`.

- **Règle de fenêtrage** : Implémenter les mêmes fonctions de fenêtrage (Hanning, Hamming, etc.) pour des résultats cohérents.

- **Règle de normalisation** : Appliquer une normalisation cohérente aux données spectrales pour la visualisation.

- **Règle d'échelle** : Gérer correctement les échelles linéaire et logarithmique comme dans l'original.

## 4. Règles d'interface utilisateur

- **Règle de réactivité** : Chaque contrôle doit mettre à jour les paramètres audio en temps réel.

- **Règle de parité visuelle** : L'interface doit ressembler visuellement à l'application Python.

- **Règle d'état** : Maintenir l'état global de l'application dans un objet unique pour faciliter la sauvegarde/restauration.

- **Règle d'événements** : Utiliser un système d'événements cohérent pour la communication entre composants.

## 5. Règles de filtrage audio

- **Règle de paramétrage** : Chaque filtre doit exposer exactement les mêmes paramètres que son équivalent Python.

- **Règle d'implémentation** : Pour les filtres complexes, implémenter les équations directement dans des AudioWorklets.

- **Règle de compatibilité** : Prévoir des implémentations alternatives pour les navigateurs ne supportant pas les fonctionnalités avancées.

## 6. Règles de performance

- **Règle d'optimisation** : Préférer les opérations vectorielles (TypedArray) aux boucles.

- **Règle de rafraîchissement** : Limiter le rafraîchissement de l'UI à 60fps maximum (requestAnimationFrame).

- **Règle de calcul** : Déporter les calculs intensifs dans des Web Workers ou des AudioWorklets.

- **Règle de mémoire** : Réutiliser les buffers existants plutôt que d'en créer de nouveaux.

## 7. Règles de compatibilité

- **Règle de détection** : Vérifier la disponibilité des API avant utilisation et proposer des alternatives.

- **Règle de dégradation gracieuse** : Prévoir des fallbacks pour les fonctionnalités non supportées.

## 8. Structure de fichiers

```
webbeta/
├── index.html           # Page principale
├── css/
│   ├── main.css         # Styles principaux
│   └── components.css   # Styles des composants
├── js/
│   ├── main.js          # Point d'entrée
│   ├── audio/
│   │   ├── context.js   # Gestion de l'AudioContext
│   │   ├── noise.js     # Générateur de bruit blanc
│   │   └── filters/     # Implémentation des filtres
│   ├── ui/
│   │   ├── controls.js  # Contrôles d'interface
│   │   └── events.js    # Gestion des événements
│   └── visualizer/
│       ├── analyzer.js  # Analyse FFT
│       └── renderer.js  # Rendu du graphique
└── worklets/
    └── noise-processor.js # AudioWorklet pour génération de bruit
```

## 9. Correspondance des fonctionnalités

| Fonctionnalité Python | Équivalent Web                         |
| --------------------- | -------------------------------------- |
| `np.fft.fft`          | `AnalyserNode.getFloatFrequencyData()` |
| `np.hanning`          | Implémentation JS personnalisée        |
| `sounddevice`         | Web Audio API                          |
| `PyQt6`               | HTML/CSS + JavaScript                  |
| `pyqtgraph`           | Canvas API ou D3.js                    |
| Filtres personnalisés | BiquadFilterNode + AudioWorklet        |
| Sauvegarde/chargement | localStorage ou IndexedDB              |

Ces règles serviront de guide pendant le développement et permettront d'assurer une migration cohérente et fidèle de l'application Python vers le web.
