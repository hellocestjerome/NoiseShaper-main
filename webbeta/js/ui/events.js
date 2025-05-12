/**
 * events.js - Gestion des événements et coordination entre composants
 * Ce module fait le lien entre l'interface utilisateur et le moteur audio/graphique
 */

class AppEvents {
    constructor() {
        // Références aux composants principaux
        this.audioContext = null;
        this.noiseGenerator = null;
        this.spectrumAnalyzer = null;
        this.spectrumRenderer = null;

        // État de l'application
        this.isInitialized = false;
        this.isPlaying = false;
        this.animationId = null;

        // Initialisation
        this.initEvents();
    }

    /**
     * Initialise l'application et les composants principaux
     */
    async init() {
        try {
            // Attendre l'initialisation du contexte audio
            await audioContextManager.initialize();
            this.audioContext = audioContextManager.context;

            // Créer l'analyseur de spectre
            this.spectrumAnalyzer = new SpectrumAnalyzer(audioConfig);

            // Créer le générateur de bruit
            this.noiseGenerator = new WhiteNoiseGenerator(this.audioContext, audioConfig);

            // Créer le renderer pour le canvas
            const canvas = document.getElementById('spectrum-canvas');
            if (canvas) {
                this.spectrumRenderer = new SpectrumRenderer(canvas, audioConfig);
            }

            this.isInitialized = true;
            console.log('Application initialisée avec succès');

            // Mettre à jour les paramètres initiaux
            this.updateAnalyzerSettings();

            return true;
        } catch (error) {
            console.error('Erreur lors de l\'initialisation:', error);
            return false;
        }
    }

    /**
     * Initialise les écouteurs d'événements
     */
    initEvents() {
        // Événements de playback
        document.addEventListener('playback-toggle', async (event) => {
            if (!this.isInitialized) {
                const success = await this.init();
                if (!success) return;
            }

            this.isPlaying = event.detail.isPlaying;
            this.togglePlayback();
        });

        // Événements de changement d'amplitude
        document.addEventListener('amplitude-change', (event) => {
            if (!this.noiseGenerator) return;

            const amplitude = event.detail.amplitude;
            this.noiseGenerator.setAmplitude(amplitude);
        });

        // Événements de changement de type de RNG
        document.addEventListener('rng-type-change', (event) => {
            if (!this.noiseGenerator) return;

            const rngType = event.detail.rngType;
            this.noiseGenerator.setRngType(rngType);
        });

        // Événements de changement d'analyseur
        document.addEventListener('analyzer-change', (event) => {
            this.updateAnalyzerSettings(event.detail);
        });

        // Événements de filtres
        document.addEventListener('filter-add', (event) => {
            if (!this.noiseGenerator) return;

            const filter = event.detail.filter;
            this.noiseGenerator.addFilter(filter);

            // Si c'est un filtre Plateau, mettre à jour la visualisation
            if (filter.type === 'plateau' && this.spectrumRenderer) {
                this.updatePlateauVisualization(filter);
            }
        });

        document.addEventListener('filter-update', (event) => {
            // La mise à jour est gérée directement par le générateur de bruit
            // via la référence aux filtres

            // Si c'est un filtre Plateau, mettre à jour la visualisation
            const filter = event.detail.filter;
            if (filter && filter.type === 'plateau' && this.spectrumRenderer) {
                this.updatePlateauVisualization(filter);
            }
        });

        document.addEventListener('filter-remove', (event) => {
            if (!this.noiseGenerator) return;

            const filterId = event.detail.filterId;
            const filterIndex = this.noiseGenerator.filters.findIndex(f => f.params.id === filterId);

            // Vérifier si c'est un filtre Plateau avant de le supprimer
            const isPlateauFilter = filterIndex !== -1 &&
                this.noiseGenerator.filters[filterIndex].params.type === 'plateau';

            if (filterIndex !== -1) {
                this.noiseGenerator.removeFilter(filterIndex);

                // Si c'était un filtre Plateau, effacer la visualisation
                if (isPlateauFilter && this.spectrumRenderer) {
                    this.spectrumRenderer.setFilterResponse(null);
                    this.spectrumRenderer.render();
                }
            }
        });

        // Événement de redimensionnement (pour le canvas)
        window.addEventListener('resize', () => {
            if (this.spectrumRenderer) {
                this.spectrumRenderer.resize();
            }
        });
    }

    /**
     * Démarre ou arrête la lecture
     */
    togglePlayback() {
        if (this.isPlaying) {
            this.startPlayback();
        } else {
            this.stopPlayback();
        }
    }

    /**
     * Démarre la lecture et la visualisation
     */
    startPlayback() {
        if (!this.isInitialized || !this.noiseGenerator) return;

        // Démarrer le générateur de bruit
        this.noiseGenerator.start();

        // Démarrer l'animation pour la visualisation
        this.startVisualization();

        console.log('Lecture démarrée');
    }

    /**
     * Arrête la lecture et la visualisation
     */
    stopPlayback() {
        if (!this.isInitialized || !this.noiseGenerator) return;

        // Arrêter le générateur de bruit
        this.noiseGenerator.stop();

        // Arrêter l'animation
        this.stopVisualization();

        console.log('Lecture arrêtée');
    }

    /**
     * Démarre la boucle d'animation pour la visualisation
     */
    startVisualization() {
        if (!this.spectrumRenderer) return;

        // Arrêter l'animation existante si elle existe
        this.stopVisualization();

        // Créer la fonction de mise à jour
        const updateFrame = () => {
            // Récupérer les données de fréquence si disponibles
            if (this.noiseGenerator && this.noiseGenerator.analyserNode) {
                const frequencyData = this.noiseGenerator.getRawFrequencyData();

                // Traiter les données pour l'affichage
                if (this.spectrumAnalyzer) {
                    const processedData = this.spectrumAnalyzer.processAnalyserData(frequencyData);

                    // Mettre à jour le renderer
                    this.spectrumRenderer.updateData(processedData);
                }
            }

            // Rendre la visualisation
            this.spectrumRenderer.render();

            // Continuer l'animation si en lecture
            if (this.isPlaying) {
                this.animationId = requestAnimationFrame(updateFrame);
            }
        };

        // Démarrer la boucle d'animation
        this.animationId = requestAnimationFrame(updateFrame);
    }

    /**
     * Arrête la boucle d'animation
     */
    stopVisualization() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Met à jour la visualisation d'un filtre Plateau
     * @param {Object} plateauFilter - Paramètres du filtre Plateau
     */
    updatePlateauVisualization(plateauFilter) {
        if (!this.spectrumRenderer || !plateauFilter) return;

        // Récupérer une référence au filtre dans le generateur de bruit
        const filterIndex = this.noiseGenerator.filters.findIndex(f =>
            f.params.id === plateauFilter.id && f.params.type === 'plateau');

        if (filterIndex === -1) return;

        // Récupérer l'objet du filtre depuis le générateur de bruit
        const filterObject = this.noiseGenerator.filters[filterIndex].node;

        if (!filterObject || typeof filterObject.calculateFrequencyResponse !== 'function') {
            console.warn('Le filtre ne possède pas la méthode calculateFrequencyResponse');
            return;
        }

        // Calculer la réponse en fréquence du filtre
        const filterResponse = filterObject.calculateFrequencyResponse(20, 20000, 1000);

        // Mettre à jour la visualisation
        this.spectrumRenderer.setFilterResponse(filterResponse);
        this.spectrumRenderer.render();

        console.log("Visualisation du filtre Plateau mise à jour:", filterResponse);
    }

    /**
     * Met à jour les paramètres de l'analyseur
     * @param {Object} params - Nouveaux paramètres (optionnel)
     */
    updateAnalyzerSettings(params = null) {
        // Récupérer les paramètres des contrôles si non fournis
        if (!params && window.uiControls) {
            params = {
                fftSize: parseInt(uiControls.fftSize.value),
                windowType: uiControls.windowType.value,
                scaleType: uiControls.scaleType.value,
                averagingCount: parseInt(uiControls.averaging.value)
            };
        }

        if (!params) return;

        // Mettre à jour les paramètres de configuration
        if (window.audioConfig) {
            audioConfig.fftSize = params.fftSize;
            audioConfig.windowType = params.windowType;
            audioConfig.scaleType = params.scaleType;
            audioConfig.averagingCount = params.averagingCount;
        }

        // Mettre à jour l'analyseur
        if (this.spectrumAnalyzer) {
            this.spectrumAnalyzer.updateParameters(params);
        }

        // Mettre à jour le générateur de bruit
        if (this.noiseGenerator && this.noiseGenerator.analyserNode) {
            this.noiseGenerator.setFFTSize(params.fftSize);
        }

        // Mettre à jour le renderer
        if (this.spectrumRenderer) {
            this.spectrumRenderer.updateParameters({
                scaleType: params.scaleType
            });

            // Forcer un rendu
            this.spectrumRenderer.render();
        }
    }
}

// Créer l'instance globale du gestionnaire d'événements
window.appEvents = new AppEvents();
